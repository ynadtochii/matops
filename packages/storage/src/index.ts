import type { StorageClient } from "./client";
import { storageEnv } from "./env";
import { createR2Storage } from "./r2";

export * from "./client";
export * from "./r2";

let cached: StorageClient | null | undefined;

export function storage(): StorageClient | null {
  if (cached !== undefined) return cached;
  const env = storageEnv();
  cached =
    env.R2_ACCOUNT_ID &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    env.R2_BUCKET
      ? createR2Storage({
          accountId: env.R2_ACCOUNT_ID,
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
          bucket: env.R2_BUCKET,
        })
      : null;
  return cached;
}
