import type { StorageClient } from "@matops/storage";
import { isPublicFileKey, PUBLIC_FILE_CACHE_CONTROL } from "@matops/domain";

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
  const object = await storage.get(key);
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
