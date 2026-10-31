import type { StorageClient } from "./client";
import { assertSafeObjectKey } from "./client";

interface FakeObject {
  bytes: Uint8Array;
  contentType: string;
}

export interface FakeStorage extends StorageClient {
  objects: Map<string, FakeObject>;
  put(key: string, bytes: Uint8Array, contentType: string): void;
}

function settle<T>(run: () => T): Promise<T> {
  return new Promise<T>((resolve) => resolve(run()));
}

export function createFakeStorage(): FakeStorage {
  const objects = new Map<string, FakeObject>();

  return {
    objects,

    put(key, bytes, contentType) {
      assertSafeObjectKey("presignPut", key);
      objects.set(key, { bytes, contentType });
    },

    presignPut(input) {
      return settle(() => {
        assertSafeObjectKey("presignPut", input.key);
        return {
          url: `fake://put/${input.key}`,
          headers: {
            "content-type": input.contentType,
            ...(input.cacheControl
              ? { "cache-control": input.cacheControl }
              : {}),
          },
        };
      });
    },

    presignGet(key) {
      return settle(() => {
        assertSafeObjectKey("presignGet", key);
        return `fake://get/${key}`;
      });
    },

    head(key) {
      return settle(() => {
        assertSafeObjectKey("head", key);
        const found = objects.get(key);
        return found
          ? { size: found.bytes.byteLength, contentType: found.contentType }
          : null;
      });
    },

    get(key, range) {
      return settle(() => {
        assertSafeObjectKey("get", key);
        const found = objects.get(key);
        if (!found) return null;
        const bytes = range ? found.bytes.slice(0, range.length) : found.bytes;
        return {
          size: bytes.byteLength,
          contentType: found.contentType,
          body: new Blob([bytes]).stream(),
        };
      });
    },

    delete(key) {
      return settle(() => {
        assertSafeObjectKey("delete", key);
        objects.delete(key);
      });
    },
  };
}
