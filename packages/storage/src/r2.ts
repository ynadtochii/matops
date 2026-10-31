import { AwsClient } from "aws4fetch";

import type {
  ObjectInfo,
  StorageClient,
  StorageOperation,
  StoredObject,
} from "./client";
import { assertSafeObjectKey, StorageError } from "./client";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export interface R2Options {
  fetch?: typeof fetch;
  now?: () => Date;
}

const MAX_PRESIGN_SECONDS = 604_800;

function amzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

export function createR2Storage(
  config: R2Config,
  options: R2Options = {},
): StorageClient {
  const aws = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  const base = `https://${config.accountId}.eu.r2.cloudflarestorage.com/${config.bucket}/`;

  async function presign(
    operation: "presignPut" | "presignGet",
    key: string,
    expiresIn: number,
    headers: Record<string, string>,
  ): Promise<string> {
    assertSafeObjectKey(operation, key);
    if (
      !Number.isInteger(expiresIn) ||
      expiresIn < 1 ||
      expiresIn > MAX_PRESIGN_SECONDS
    ) {
      throw new StorageError(operation, key);
    }
    const url = new URL(base + key);
    url.searchParams.set("X-Amz-Expires", String(expiresIn));
    try {
      const signed = await aws.sign(url.toString(), {
        method: operation === "presignPut" ? "PUT" : "GET",
        headers,
        aws: { signQuery: true, allHeaders: true, datetime: amzDate(now()) },
      });
      return signed.url;
    } catch (cause) {
      throw new StorageError(operation, key, undefined, { cause });
    }
  }

  async function send(
    operation: StorageOperation,
    key: string,
    method: "HEAD" | "GET" | "DELETE",
    headers: Record<string, string> = {},
  ): Promise<Response> {
    assertSafeObjectKey(operation, key);
    try {
      const request = await aws.sign(base + key, {
        method,
        headers,
        aws: { datetime: amzDate(now()) },
      });
      // A signal on fetch also aborts the body stream, so it may only cover
      // the wait for headers: /files streams the body to slow clients.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      try {
        return await fetchImpl(request, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    } catch (cause) {
      throw new StorageError(operation, key, undefined, { cause });
    }
  }

  async function fail(
    operation: StorageOperation,
    key: string,
    res: Response,
  ): Promise<never> {
    await res.body?.cancel();
    throw new StorageError(operation, key, res.status);
  }

  function info(res: Response): ObjectInfo {
    return {
      size: Number(res.headers.get("content-length") ?? 0),
      contentType:
        res.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  return {
    async presignPut(input) {
      const headers: Record<string, string> = {
        "content-type": input.contentType,
        ...(input.cacheControl ? { "cache-control": input.cacheControl } : {}),
      };
      const url = await presign("presignPut", input.key, input.expiresIn, {
        ...headers,
        "content-length": String(input.contentLength),
      });
      return { url, headers };
    },

    presignGet(key, expiresIn) {
      return presign("presignGet", key, expiresIn, {});
    },

    async head(key) {
      const res = await send("head", key, "HEAD");
      if (res.status === 404) return null;
      if (!res.ok) return fail("head", key, res);
      return info(res);
    },

    async get(key, range): Promise<StoredObject | null> {
      const res = await send(
        "get",
        key,
        "GET",
        range ? { range: `bytes=0-${range.length - 1}` } : {},
      );
      if (res.status === 404) {
        await res.body?.cancel();
        return null;
      }
      if (!res.ok) return fail("get", key, res);
      return { ...info(res), body: res.body ?? new Blob([]).stream() };
    },

    async delete(key) {
      const res = await send("delete", key, "DELETE");
      await res.body?.cancel();
      if (!res.ok && res.status !== 404) {
        throw new StorageError("delete", key, res.status);
      }
    },
  };
}
