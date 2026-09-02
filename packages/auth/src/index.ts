import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, oAuthProxy, organization } from "better-auth/plugins";

import { provisionOrganization } from "@matops/db";
import { db } from "@matops/db/client";
import { sendEmail } from "@matops/notifications";

import { authEnv } from "../env";
import { ac, roles } from "./permissions";

/**
 * The magic-link URL carries a caller-supplied `callbackURL`, so it is escaped
 * before it goes into an href attribute — an unescaped quote would break out of
 * the attribute and let a crafted sign-in request inject markup into the email.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function initAuth<
  TExtraPlugins extends BetterAuthPlugin[] = [],
>(options: {
  baseUrl: string;
  productionUrl: string;
  secret: string | undefined;
  // Google OAuth (spec S1 social login, ADR 35). Both must be set to enable the
  // provider; if either is missing we register no social provider (magic-link
  // only), so dev + CI without Google creds still work.
  googleClientId?: string;
  googleClientSecret?: string;
  extraPlugins?: TExtraPlugins;
}) {
  const socialProviders =
    options.googleClientId && options.googleClientSecret
      ? {
          google: {
            clientId: options.googleClientId,
            clientSecret: options.googleClientSecret,
          },
        }
      : undefined;

  const config = {
    database: drizzleAdapter(db, {
      provider: "pg",
    }),
    baseURL: options.baseUrl,
    secret: options.secret,
    // Social accounts land in Better Auth's existing `account` table (providerId
    // = "google") — no new migration. A social sign-in creates a user with NO
    // academy membership, exactly like magic-link, so the join/approval gate
    // (S2, ADR 29) is unchanged. `phone` is optional, so Google users are fine.
    socialProviders,
    // One identity per email (ADR 35): a Google sign-in is linked to an existing
    // user with the same email instead of forking a second account — so an owner
    // who created their gym via magic-link reaches the SAME academy when they
    // later sign in with Google (and vice-versa). Safe here: both magic-link and
    // Google yield a verified email. `trustedProviders` makes the link explicit.
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
      },
    },
    // The session + user rows are re-read from Postgres on EVERY authed request
    // (2 round trips to Neon). The cache signs them into the session cookie
    // instead, so a request inside the window costs zero queries. Tradeoff: a
    // revoked or role-changed session stays valid for up to `maxAge` (ADR 81).
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    // Phone is captured at seamless registration (docs/issues/26); email is
    // required and verified via the magic link. Membership `status` lives on the
    // organization member row (below), not on the user.
    user: {
      additionalFields: {
        phone: { type: "string", required: false, input: true },
      },
    },
    plugins: [
      oAuthProxy({
        productionURL: options.productionUrl,
      }),
      organization({
        ac,
        roles,
        // The academy creator becomes an owner of the ORGANIZATION
        // (docs/issues/20). The hook below gives them the default academy and an
        // active owner membership of it, so onboarding is seamless — the creator
        // is a working owner with no approval step.
        creatorRole: "owner",
        organizationHooks: {
          // The shareable 6-digit code lives on the ENTITY now (ADR 124), so
          // the provisioner mints it with the default academy rather than the
          // organization carrying one.
          afterCreateOrganization: async ({ member, organization }) => {
            await provisionOrganization(
              { organizationId: organization.id, ownerUserId: member.userId },
              db,
            );
          },
        },

      }),
      magicLink({
        sendMagicLink: async ({ email, token, url }) => {
          // Log the link only in dev so sign-in works with no email provider
          // configured — production must never write a live magic-link token to
          // server logs. `sendEmail` delivers via Resend when RESEND_API_KEY /
          // RESEND_FROM are set; it no-ops (logged) otherwise and never throws,
          // so an unconfigured or failing transport can never break sign-in.
          //
          // WEB opens `url` directly. MOBILE cannot: the session cookie is set on
          // the verify response, and if the link opens in the system browser that
          // cookie lands in the browser, never the app. So the Expo app must
          // verify the token itself (authClient.magicLink.verify → the expo
          // client stores the returned cookie). We emit a deep link the app
          // handles at `app/magic-link.tsx`.
          if (authEnv().NODE_ENV !== "production") {
            console.log(`[auth] magic link for ${email}: ${url}`);
            console.log(
              `[auth] mobile deep link for ${email}: matops://magic-link?token=${token}`,
            );
          }
          await sendEmail({
            to: email,
            subject: "Your MatOps sign-in link",
            text: `Sign in to MatOps by opening this link:\n\n${url}\n\nThis link expires shortly. If you didn't request it, you can ignore this email.`,
            html: `<p>Sign in to MatOps by clicking the link below:</p><p><a href="${escapeHtml(url)}">Sign in to MatOps</a></p><p>This link expires shortly. If you didn't request it, you can ignore this email.</p>`,
          });
        },
      }),
      expo(),
      ...(options.extraPlugins ?? []),
    ],
    // The mobile app's custom scheme (apps/expo scheme = `matops`). The magic-link
    // verify redirect must start with a trusted origin for @better-auth/expo to
    // append the session cookie back to the app. (Expo Go's `exp://` is auto-added
    // in development by the expo() plugin; the custom scheme is not, so list it.)
    trustedOrigins: ["matops://"],
    // Magic-link send is public and spends the shared Resend quota, so one
    // flooder would break sign-in for every academy at once. Storage is the
    // default in-memory one: per instance on Vercel Fluid compute, and reset by
    // a cold start, so it brakes a flood without being a global ceiling. Better
    // Auth only enables this in production, so it is invisible in `dev:next`.
    rateLimit: {
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/magic-link": { window: 300, max: 5 },
        "/magic-link/verify": { window: 60, max: 20 },
      },
    },
    onAPIError: {
      onError(error) {
        // The MESSAGE only. The Better Auth context carries the app secret as a
        // top-level property, so logging `ctx` wrote it to the production log on
        // any unauthenticated bad request.
        console.error(
          "[auth] API error:",
          error instanceof Error ? error.message : String(error),
        );
      },
    },
  } satisfies BetterAuthOptions;

  return betterAuth(config);
}

export type Auth = ReturnType<typeof initAuth>;
export type Session = Auth["$Infer"]["Session"];
