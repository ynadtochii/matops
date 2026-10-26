import type { StorageClient } from "@matops/storage";
import { isPublicFileKey, PUBLIC_FILE_CACHE_CONTROL } from "@matops/domain";
import { StorageError } from "@matops/storage";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function publicFileResponse(
  key: string,
  storage: StorageClient | null,
): Promise<Response> {
  if (!isPublicFileKey(key) || !storage) return notFound();
  let object;
  try {
    object = await storage.get(key);
  } catch (error) {
    if (!(error instanceof StorageError)) throw error;
    console.error("[files] storage read failed", error);
    return new Response("Storage unavailable", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (!object) return notFound();
  const extension = key.slice(key.lastIndexOf(".") + 1);
  return new Response(object.body, {
    headers: {
      "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
      "Content-Length": String(object.size),
      "Cache-Control": PUBLIC_FILE_CACHE_CONTROL,
      // Vercel caches a function response only with s-maxage or this header.
      "Vercel-CDN-Cache-Control": "max-age=2592000",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
}
