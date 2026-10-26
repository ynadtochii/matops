import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

export function storageEnv() {
  return createEnv({
    server: {
      R2_ACCOUNT_ID: z.string().min(1).optional(),
      R2_ACCESS_KEY_ID: z.string().min(1).optional(),
      R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
      R2_BUCKET: z.string().min(1).optional(),
    },
    runtimeEnv: process.env,
    skipValidation:
      !!process.env.CI || process.env.npm_lifecycle_event === "lint",
  });
}
