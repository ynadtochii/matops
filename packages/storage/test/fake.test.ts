import { describe, expect, it } from "vitest";

import { readBytes, StorageError } from "../src/client";
import { createFakeStorage } from "../src/testing";

describe("createFakeStorage", () => {
  it("stores, reads a range, and deletes", async () => {
    const storage = createFakeStorage();
    storage.put("avatar/ent1/a.png", new Uint8Array([1, 2, 3, 4]), "image/png");

    await expect(storage.head("avatar/ent1/a.png")).resolves.toEqual({
      size: 4,
      contentType: "image/png",
    });

    const part = await storage.get("avatar/ent1/a.png", { length: 2 });
    const bytes = new Uint8Array(await new Response(part?.body).arrayBuffer());
    expect([...bytes]).toEqual([1, 2]);

    await storage.delete("avatar/ent1/a.png");
    await expect(storage.head("avatar/ent1/a.png")).resolves.toBeNull();
    await expect(storage.get("avatar/ent1/a.png")).resolves.toBeNull();
  });

  it("returns the headers the client must send", async () => {
    const storage = createFakeStorage();

    const put = await storage.presignPut({
      key: "icon/ent1/a.png",
      contentType: "image/png",
      contentLength: 10,
      cacheControl: "public, max-age=60",
      expiresIn: 300,
    });

    expect(put.url).toBe("fake://put/icon/ent1/a.png");
    expect(put.headers).toEqual({
      "content-type": "image/png",
      "cache-control": "public, max-age=60",
    });
  });

  it("refuses unsafe keys like the real client", async () => {
    const storage = createFakeStorage();

    await expect(storage.head("../x")).rejects.toBeInstanceOf(StorageError);
    expect(() => storage.put("/x", new Uint8Array(), "image/png")).toThrow(
      StorageError,
    );
  });
});

describe("readBytes", () => {
  it("joins every chunk of a stream", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3]));
        controller.close();
      },
    });

    expect([...(await readBytes(stream))]).toEqual([1, 2, 3]);
  });
});
