import { storageEnv } from "./env";
import { createR2Storage } from "./r2";

const env = storageEnv();
const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } =
  env;

if (
  !R2_ACCOUNT_ID ||
  !R2_ACCESS_KEY_ID ||
  !R2_SECRET_ACCESS_KEY ||
  !R2_BUCKET
) {
  console.error("[smoke] R2_* vars are missing in .env");
  process.exit(1);
}
if (!R2_BUCKET.endsWith("-dev")) {
  console.error(
    `[smoke] refusing to run against ${R2_BUCKET}: dev buckets only`,
  );
  process.exit(1);
}

const storage = createR2Storage({
  accountId: R2_ACCOUNT_ID,
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET_ACCESS_KEY,
  bucket: R2_BUCKET,
});

const key = `smoke/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
const bytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);
const origin = "http://localhost:3004";
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) failed += 1;
}

try {
  const tooBig = await storage.presignPut({
    key,
    contentType: "image/png",
    contentLength: bytes.byteLength - 1,
    expiresIn: 60,
  });
  const rejected = await fetch(tooBig.url, {
    method: "PUT",
    headers: tooBig.headers,
    body: bytes,
  });
  check(
    "PUT with a different size is refused",
    rejected.status === 403,
    `HTTP ${rejected.status}`,
  );

  const put = await storage.presignPut({
    key,
    contentType: "image/png",
    contentLength: bytes.byteLength,
    cacheControl: "public, max-age=2592000, immutable",
    expiresIn: 60,
  });
  const preflight = await fetch(put.url, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type,cache-control",
    },
  });
  check(
    "CORS preflight allows localhost:3004",
    preflight.headers.get("access-control-allow-origin") === origin,
    `HTTP ${preflight.status}`,
  );

  const uploaded = await fetch(put.url, {
    method: "PUT",
    headers: put.headers,
    body: bytes,
  });
  check(
    "presigned PUT stores the object",
    uploaded.ok,
    `HTTP ${uploaded.status}`,
  );

  const head = await storage.head(key);
  check(
    "HEAD returns size and type",
    head?.size === bytes.byteLength && head.contentType === "image/png",
    JSON.stringify(head),
  );

  const first = await storage.get(key, { length: 8 });
  const firstBytes = first
    ? new Uint8Array(await new Response(first.body).arrayBuffer())
    : new Uint8Array();
  check(
    "ranged GET returns the first 8 bytes",
    firstBytes.length === 8 && firstBytes[1] === 0x50,
    `${firstBytes.length} bytes`,
  );

  await storage.delete(key);
  check("DELETE removes the object", (await storage.head(key)) === null);
} catch (error) {
  failed += 1;
  console.error("FAIL unexpected error", error);
  await storage.delete(key).catch(() => undefined);
}

console.log(
  failed === 0 ? "\nall checks passed" : `\n${failed} check(s) failed`,
);
process.exit(failed === 0 ? 0 : 1);
