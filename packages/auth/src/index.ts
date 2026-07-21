import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, oAuthProxy, organization } from "better-auth/plugins";

import { generateAcademyCode, setMemberActive } from "@matops/db";
import { db } from "@matops/db/client";

import { ac, roles } from "./permissions";

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
        // The academy creator becomes an owner (docs/issues/20). The hook below
        // also flips that owner membership to `active` at once, so onboarding is
        // seamless — the creator is a working owner with no approval step.
        creatorRole: "owner",
        organizationHooks: {
          // Give the new gym its shareable 6-digit code (docs/issues/32) BEFORE
          // the row is inserted. `public_code` is NOT NULL (migration 0010), so
          // it must be part of the INSERT — assigning it in afterCreate runs too
          // late and the insert fails the constraint. `generateAcademyCode`
          // checks uniqueness; the unique index is the final backstop on a race.
          beforeCreateOrganization: async ({ organization }) => {
            return {
              data: { ...organization, publicCode: await generateAcademyCode() },
            };
          },
          afterCreateOrganization: async ({ member }) => {
            await setMemberActive(member.id);
          },
        },
        schema: {
          organization: {
            additionalFields: {
              // The shareable 6-digit code (docs/issues/32). NOT NULL in the DB;
              // server-set in beforeCreateOrganization (`input: false` → clients
              // cannot pass it). The drizzle adapter resolves this by the drizzle
              // property key `publicCode` (auth-schema maps it to the existing
              // `public_code` column) — so no fieldName override, no migration,
              // no schema regen.
              publicCode: {
                type: "string",
                required: false,
                input: false,
              },
            },
          },
          member: {
            additionalFields: {
              // Everyone who self-joins via an invite link starts `pending` and
              // sees a view-only app until an owner approves (docs/issues/20, 23).
              // `input: false` → clients cannot set it; the server controls it.
              status: {
                type: "string",
                defaultValue: "pending",
                input: false,
              },
              // The role to grant AT approval (docs/issues/14, 20). A pending
              // member holds the harmless Better Auth default role (`member`) —
              // not one of our academy roles — so it passes no role check even if
              // a status guard is missed; approval sets `role := invitedRole`.
              // Server-controlled (`input: false`); set from the invite at join.
              invitedRole: {
                type: "string",
                required: false,
                input: false,
              },
            },
          },
        },
      }),
      magicLink({
        sendMagicLink: ({ email, token, url }) => {
          // Phase 4 wires Resend (packages/notifications). For now, log the link
          // so dev sign-in works with no email provider configured.
          //
          // WEB opens `url` directly. MOBILE cannot: the session cookie is set on
          // the verify response, and if the link opens in the system browser that
          // cookie lands in the browser, never the app. So the Expo app must
          // verify the token itself (authClient.magicLink.verify → the expo
          // client stores the returned cookie). We emit a deep link the app
          // handles at `app/magic-link.tsx`.
          console.log(`[auth] magic link for ${email}: ${url}`);
          console.log(
            `[auth] mobile deep link for ${email}: matops://magic-link?token=${token}`,
          );
          return Promise.resolve();
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
    onAPIError: {
      onError(error, ctx) {
        console.error("BETTER AUTH API ERROR", error, ctx);
      },
    },
  } satisfies BetterAuthOptions;

  return betterAuth(config);
}

export type Auth = ReturnType<typeof initAuth>;
export type Session = Auth["$Infer"]["Session"];
