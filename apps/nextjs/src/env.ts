import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets-zod";
import { z } from "zod/v4";

import { authEnv } from "@matops/auth/env";
import { notificationsEnv } from "@matops/notifications/env";

export const env = createEnv({
  extends: [authEnv(), notificationsEnv(), vercel()],
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  /**
   * Specify your server-side environment variables schema here.
   * This way you can ensure the app isn't built with invalid env vars.
   */
  server: {
    POSTGRES_URL: z.url(),
  },

  /**
   * Specify your client-side environment variables schema here.
   * For them to be exposed to the client, prefix them with `NEXT_PUBLIC_`.
   */
  client: {
    /**
     * Who runs MatOps, in the privacy policy. Required: the policy is public
     * and promises a route to a data deletion, so it cannot ship a placeholder.
     */
    NEXT_PUBLIC_LEGAL_ENTITY: z.string().min(1),
    NEXT_PUBLIC_LEGAL_ADDRESS: z.string().min(1),
    NEXT_PUBLIC_PRIVACY_CONTACT: z.email(),
  },
  /**
   * Destructure all variables from `process.env` to make sure they aren't tree-shaken away.
   */
  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,

    NEXT_PUBLIC_LEGAL_ENTITY: process.env.NEXT_PUBLIC_LEGAL_ENTITY,
    NEXT_PUBLIC_LEGAL_ADDRESS: process.env.NEXT_PUBLIC_LEGAL_ADDRESS,
    NEXT_PUBLIC_PRIVACY_CONTACT: process.env.NEXT_PUBLIC_PRIVACY_CONTACT,
  },
  skipValidation:
    !!process.env.CI || process.env.npm_lifecycle_event === "lint",
});
