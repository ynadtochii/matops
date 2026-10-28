import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

export function parseSecretKey(
  value: string | null | undefined,
): Buffer | null {
  if (!value) return null;
  const key = Buffer.from(value, "base64");
  return key.length === 32 ? key : null;
}

export function parseSecretKeys(
  current: string | null | undefined,
  previous: string | null | undefined,
): Buffer[] {
  const key = parseSecretKey(current);
  if (!key) return [];
  const old = parseSecretKey(previous);
  return old ? [key, old] : [key];
}

export function openSecretWithAny(
  keys: readonly Buffer[],
  sealed: string,
): string | null {
  for (const key of keys) {
    const plain = openSecret(key, sealed);
    if (plain !== null) return plain;
  }
  return null;
}

export function sealSecret(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

export function openSecret(key: Buffer, sealed: string): string | null {
  const [version, iv, tag, body, extra] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !body || extra !== undefined) {
    return null;
  }
  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
