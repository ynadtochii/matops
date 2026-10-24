import { describe, expect, it } from "vitest";

import { isSafeObjectKey, StorageError } from "../src/client";
import { createR2Storage } from "../src/r2";

const config = {
  accountId: "acc123",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "secret-example",
  bucket: "matops-private-dev",
};

const fixedNow = () => new Date("2026-10-16T12:00:00.000Z");

function recordingFetch(response: () => Response) {
  const requests: Request[] = [];
  const impl = (input: Request | string | URL) => {
    requests.push(input as Request);
    return Promise.resolve(response());
  };
  return { requests, fetch: impl };
}

describe("isSafeObjectKey", () => {
  it.each([
    "avatar/ent1/0b6f.webp",
    "receipt/2m/ent1/abc-def.pdf",
    "icon/e_1/x.png",
    "avatar/AbC123xYz/0b6f.webp",
  ])("accepts %s", (key) => {
    expect(isSafeObjectKey(key)).toBe(true);
  });

  it.each([
    "",
    "/avatar/x.png",
    "avatar/../receipt/x.pdf",
    "avatar//x.png",
    "avatar/",
    "avatar/x y.png",
    "avatar/x.png?x=1",
    "a".repeat(513),
  ])("refuses %j", (key) => {
    expect(isSafeObjectKey(key)).toBe(false);
  });
});

describe("createR2Storage presign", () => {
  const storage = createR2Storage(config, { now: fixedNow });

  it("signs content type, length and cache control into the PUT url", async () => {
    const put = await storage.presignPut({
      key: "avatar/ent1/abc.webp",
      contentType: "image/webp",
      contentLength: 1234,
      cacheControl: "public, max-age=2592000, immutable",
      expiresIn: 300,
    });
    const url = new URL(put.url);

    expect(url.origin).toBe("https://acc123.eu.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/matops-private-dev/avatar/ent1/abc.webp");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-Date")).toBe("20261016T120000Z");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "cache-control;content-length;content-type;host",
    );
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get("X-Amz-Credential")).toContain(
      "/auto/s3/aws4_request",
    );
    expect(put.headers).toEqual({
      "content-type": "image/webp",
      "cache-control": "public, max-age=2592000, immutable",
    });
  });

  it("changes the signature when the length changes", async () => {
    const input = {
      key: "avatar/ent1/abc.webp",
      contentType: "image/webp",
      expiresIn: 300,
    };
    const a = await storage.presignPut({ ...input, contentLength: 1 });
    const b = await storage.presignPut({ ...input, contentLength: 2 });

    expect(new URL(a.url).searchParams.get("X-Amz-Signature")).not.toBe(
      new URL(b.url).searchParams.get("X-Amz-Signature"),
    );
  });

  it.each([0, -1, 1.5, 604_801])("refuses expiresIn %d", async (expiresIn) => {
    await expect(
      storage.presignPut({
        key: "icon/ent1/abc.png",
        contentType: "image/png",
        contentLength: 1,
        expiresIn,
      }),
    ).rejects.toBeInstanceOf(StorageError);
  });

  it("refuses an unsafe key", async () => {
    await expect(
      storage.presignPut({
        key: "../secret",
        contentType: "image/png",
        contentLength: 1,
        expiresIn: 60,
      }),
    ).rejects.toBeInstanceOf(StorageError);
  });
});

describe("createR2Storage requests", () => {
  it("head returns size and type", async () => {
    const rec = recordingFetch(
      () =>
        new Response(null, {
          status: 200,
          headers: { "content-length": "42", "content-type": "image/png" },
        }),
    );
    const storage = createR2Storage(config, { fetch: rec.fetch });

    await expect(storage.head("icon/ent1/a.png")).resolves.toEqual({
      size: 42,
      contentType: "image/png",
    });
    expect(rec.requests[0]?.method).toBe("HEAD");
    expect(rec.requests[0]?.headers.get("authorization")).toContain(
      "AWS4-HMAC-SHA256",
    );
  });

  it("head returns null on 404", async () => {
    const rec = recordingFetch(() => new Response(null, { status: 404 }));
    const storage = createR2Storage(config, { fetch: rec.fetch });

    await expect(storage.head("icon/ent1/a.png")).resolves.toBeNull();
  });

  it("head throws StorageError with the status on 500", async () => {
    const rec = recordingFetch(() => new Response(null, { status: 500 }));
    const storage = createR2Storage(config, { fetch: rec.fetch });

    const error = await storage
      .head("icon/ent1/a.png")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(StorageError);
    expect((error as StorageError).status).toBe(500);
    expect((error as StorageError).message).not.toContain("secret-example");
  });

  it("get sends a range header and returns the bytes", async () => {
    const rec = recordingFetch(
      () =>
        new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
          status: 206,
          headers: { "content-length": "3", "content-type": "image/jpeg" },
        }),
    );
    const storage = createR2Storage(config, { fetch: rec.fetch });

    const object = await storage.get("avatar/ent1/a.jpg", { length: 16 });

    expect(rec.requests[0]?.headers.get("range")).toBe("bytes=0-15");
    expect(object?.size).toBe(3);
    expect(object?.contentType).toBe("image/jpeg");
    const bytes = new Uint8Array(
      await new Response(object?.body).arrayBuffer(),
    );
    expect([...bytes]).toEqual([0xff, 0xd8, 0xff]);
  });

  it("get without a range sends no range header", async () => {
    const rec = recordingFetch(() => new Response("x", { status: 200 }));
    const storage = createR2Storage(config, { fetch: rec.fetch });

    await storage.get("avatar/ent1/a.jpg");

    expect(rec.requests[0]?.headers.has("range")).toBe(false);
  });

  it("get returns null on 404", async () => {
    const rec = recordingFetch(() => new Response("nope", { status: 404 }));
    const storage = createR2Storage(config, { fetch: rec.fetch });

    await expect(storage.get("avatar/ent1/a.jpg")).resolves.toBeNull();
  });

  it("delete treats 404 as success", async () => {
    const rec = recordingFetch(() => new Response(null, { status: 404 }));
    const storage = createR2Storage(config, { fetch: rec.fetch });

    await expect(storage.delete("avatar/ent1/a.jpg")).resolves.toBeUndefined();
    expect(rec.requests[0]?.method).toBe("DELETE");
  });

  it("delete throws on 403", async () => {
    const rec = recordingFetch(() => new Response(null, { status: 403 }));
    const storage = createR2Storage(config, { fetch: rec.fetch });

    await expect(storage.delete("avatar/ent1/a.jpg")).rejects.toBeInstanceOf(
      StorageError,
    );
  });

  it("wraps a network failure in StorageError", async () => {
    const storage = createR2Storage(config, {
      fetch: () => Promise.reject(new TypeError("fetch failed")),
    });

    const error = await storage
      .head("icon/ent1/a.png")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(StorageError);
    expect((error as StorageError).cause).toBeInstanceOf(TypeError);
  });

  it("never sends a request for an unsafe key", async () => {
    const rec = recordingFetch(() => new Response(null, { status: 200 }));
    const storage = createR2Storage(config, { fetch: rec.fetch });

    await expect(storage.delete("avatar/../x")).rejects.toBeInstanceOf(
      StorageError,
    );
    expect(rec.requests).toHaveLength(0);
  });
});
