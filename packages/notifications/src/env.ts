import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

/**
 * Notifications transport env (docs/issues/17, 34). All optional so builds and
 * dev/lint never fail when notifications are unconfigured — the transport
 * degrades to a no-op + a log line when a key is missing. Configure in
 * production to actually deliver.
 */
export function notificationsEnv() {
  return createEnv({
    server: {
      // Resend API key + verified sender for transactional email.
      RESEND_API_KEY: z.string().min(1).optional(),
      RESEND_FROM: z.string().min(1).optional(),
      // Optional Expo access token (only needed for enhanced push security).
      EXPO_ACCESS_TOKEN: z.string().min(1).optional(),
    },
    runtimeEnv: process.env,
    skipValidation:
      !!process.env.CI || process.env.npm_lifecycle_event === "lint",
  });
}
