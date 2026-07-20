import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, oAuthProxy, organization } from "better-auth/plugins";

import { db } from "@matops/db/client";

import { ac, roles } from "./permissions";

export function initAuth<
  TExtraPlugins extends BetterAuthPlugin[] = [],
>(options: {
  baseUrl: string;
  productionUrl: string;
  secret: string | undefined;
  extraPlugins?: TExtraPlugins;
}) {
  const config = {
    database: drizzleAdapter(db, {
      provider: "pg",
    }),
    baseURL: options.baseUrl,
    secret: options.secret,
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
        // The academy creator becomes an owner (docs/issues/20). Onboarding
        // (slice 1.1) additionally sets that member active.
        creatorRole: "owner",
        schema: {
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
            },
          },
        },
      }),
      magicLink({
        sendMagicLink: ({ email, url }) => {
          // Phase 4 wires Resend (packages/notifications). For now, log the link
          // so dev sign-in works with no email provider configured.
          console.log(`[auth] magic link for ${email}: ${url}`);
          return Promise.resolve();
        },
      }),
      expo(),
      ...(options.extraPlugins ?? []),
    ],
    trustedOrigins: ["expo://"],
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
