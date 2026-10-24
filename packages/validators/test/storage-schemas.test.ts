import { describe, expect, it } from "vitest";

import { CompleteUploadSchema, CreateUploadSchema } from "../src/storage";

describe("CreateUploadSchema", () => {
  it("accepts an avatar or icon image", () => {
    expect(
      CreateUploadSchema.parse({
        kind: "avatar",
        contentType: "image/webp",
        sizeBytes: 1000,
      }),
    ).toEqual({ kind: "avatar", contentType: "image/webp", sizeBytes: 1000 });
    expect(
      CreateUploadSchema.safeParse({
        kind: "academy_icon",
        contentType: "image/png",
        sizeBytes: 1,
      }).success,
    ).toBe(true);
  });

  it.each([
    { kind: "payment_receipt", contentType: "image/png", sizeBytes: 1 },
    { kind: "avatar", contentType: "image/svg+xml", sizeBytes: 1 },
    { kind: "avatar", contentType: "application/pdf", sizeBytes: 1 },
    { kind: "avatar", contentType: "image/png", sizeBytes: 0 },
    { kind: "avatar", contentType: "image/png", sizeBytes: 1.5 },
    { kind: "avatar", contentType: "image/png", sizeBytes: 11 * 1024 * 1024 },
  ])("refuses %j", (input) => {
    expect(CreateUploadSchema.safeParse(input).success).toBe(false);
  });
});

describe("CompleteUploadSchema", () => {
  it("needs a uuid", () => {
    expect(
      CompleteUploadSchema.safeParse({
        fileId: "0b6f1c2e-3d4a-4b5c-8d9e-0f1a2b3c4d5e",
      }).success,
    ).toBe(true);
    expect(CompleteUploadSchema.safeParse({ fileId: "../x" }).success).toBe(
      false,
    );
  });
});
