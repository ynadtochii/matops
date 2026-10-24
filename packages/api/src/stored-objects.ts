import type { StorageClient } from "@matops/storage";

export async function deleteStoredObjects(
  storage: StorageClient | null,
  keys: string[],
): Promise<void> {
  if (keys.length === 0) return;
  if (!storage) {
    console.error(
      `[storage] not configured: ${keys.length} object(s) left in the bucket`,
    );
    return;
  }
  await Promise.all(
    keys.map((key) =>
      storage.delete(key).catch((error: unknown) => {
        console.error(`[storage] delete failed for ${key}`, error);
      }),
    ),
  );
}
