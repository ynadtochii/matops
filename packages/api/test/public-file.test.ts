import { describe, expect, it, vi } from "vitest";

import { StorageError } from "@matops/storage";
import { createFakeStorage } from "@matops/storage/testing";

import { publicFileResponse } from "../src/public-file";

const ID = "0b6f1c2e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";
const AVATAR = `avatar/AcadA/${ID}.webp`;
const RECEIPT = `receipt/AcadA/${ID}.pdf`;
const BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);

describe("publicFileResponse", () => {
  it("streams an avatar with cache and safety headers", async () => {
    const storage = createFakeStorage();
    storage.put(AVATAR, BYTES, "text/html");

    const res = await publicFileResponse(AVATAR, storage);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("content-length")).toBe(String(BYTES.byteLength));
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=2592000, immutable",
    );
    expect(res.headers.get("vercel-cdn-cache-control")).toBe("max-age=2592000");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("sandbox");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...BYTES]);
  });

  it("never serves a receipt, even when it exists", async () => {
    const storage = createFakeStorage();
    storage.put(RECEIPT, BYTES, "application/pdf");

    const res = await publicFileResponse(RECEIPT, storage);

    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    `avatar/../receipt/AcadA/${ID}.pdf`,
    `avatar/AcadA/${ID}.webp/extra`,
    "avatar/AcadA/not-a-uuid.webp",
    `smoke/AcadA/${ID}.png`,
  ])("returns 404 for %s", async (key) => {
    const res = await publicFileResponse(key, createFakeStorage());
    expect(res.status).toBe(404);
  });

  it("returns 404 for a missing object", async () => {
    const res = await publicFileResponse(AVATAR, createFakeStorage());
    expect(res.status).toBe(404);
  });

  it("returns 404 when storage is not set up", async () => {
    const res = await publicFileResponse(AVATAR, null);
    expect(res.status).toBe(404);
  });

  it("returns an uncached 502 when storage fails", async () => {
    const storage = createFakeStorage();
    storage.get = () => Promise.reject(new StorageError("get", AVATAR, 500));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await publicFileResponse(AVATAR, storage);

    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
