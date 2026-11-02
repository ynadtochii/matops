import { describe, expect, it } from "vitest";

import {
  ACADEMY_STORAGE_QUOTA_BYTES,
  canUploadFile,
  FILE_RULES,
  fileKey,
  fitWithin,
  isFileKind,
  isPublicFileKey,
  pendingUploadCutoff,
  publicFileUrl,
  sniffFileType,
  uploadProblem,
} from "../src/storage";

const FILE_ID = "0b6f1c2e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";
const active = (role: string) => ({ role, status: "active" });

describe("canUploadFile", () => {
  it.each([
    ["student", "active", true],
    ["student", "pending", true],
    ["instructor", "active", true],
    ["owner", "active", true],
    ["student", "suspended", false],
    ["student", "archived", false],
  ])("avatar for a %s who is %s: %s", (role, status, allowed) => {
    expect(canUploadFile("avatar", { role, status })).toBe(allowed);
  });

  it.each([
    ["owner", true],
    ["manager", true],
    ["instructor", false],
    ["student", false],
  ])("academy icon for an active %s: %s", (role, allowed) => {
    expect(canUploadFile("academy_icon", active(role))).toBe(allowed);
  });
});

describe("uploadProblem", () => {
  const ok = {
    contentType: "image/webp",
    sizeBytes: 1000,
    academyUsedBytes: 0,
  };

  it("accepts an allowed type within the limits", () => {
    expect(uploadProblem({ kind: "avatar", ...ok })).toBeNull();
  });

  it.each(["application/pdf", "image/svg+xml", "text/html", "image/gif", ""])(
    "refuses %j for an avatar",
    (contentType) => {
      expect(uploadProblem({ kind: "avatar", ...ok, contentType })).toBe(
        "type_not_allowed",
      );
    },
  );

  it("takes a PDF or an image up to 5 MB as a payment receipt", () => {
    for (const contentType of ["application/pdf", "image/jpeg"]) {
      expect(
        uploadProblem({
          kind: "payment_receipt",
          ...ok,
          contentType,
          sizeBytes: 5 * 1024 * 1024,
        }),
      ).toBeNull();
    }
    expect(
      uploadProblem({
        kind: "payment_receipt",
        ...ok,
        sizeBytes: 5 * 1024 * 1024 + 1,
      }),
    ).toBe("too_large");
    expect(
      uploadProblem({
        kind: "payment_receipt",
        ...ok,
        contentType: "text/html",
      }),
    ).toBe("type_not_allowed");
  });

  it.each([0, -1, 1.5])("refuses size %d as empty", (sizeBytes) => {
    expect(uploadProblem({ kind: "avatar", ...ok, sizeBytes })).toBe("empty");
  });

  it("refuses a file over the kind's limit", () => {
    expect(
      uploadProblem({
        kind: "avatar",
        ...ok,
        sizeBytes: FILE_RULES.avatar.maxBytes + 1,
      }),
    ).toBe("too_large");
  });

  it("refuses a file that would pass the academy quota", () => {
    expect(
      uploadProblem({
        kind: "avatar",
        ...ok,
        academyUsedBytes: ACADEMY_STORAGE_QUOTA_BYTES - 999,
      }),
    ).toBe("quota");
    expect(
      uploadProblem({
        kind: "avatar",
        ...ok,
        academyUsedBytes: ACADEMY_STORAGE_QUOTA_BYTES - 1000,
      }),
    ).toBeNull();
  });
});

describe("sniffFileType", () => {
  const bytes = (...b: number[]) => new Uint8Array(b);

  it("knows JPEG, PNG and WebP by their first bytes", () => {
    expect(sniffFileType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(
      sniffFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
    ).toBe("image/png");
    expect(
      sniffFileType(
        bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50),
      ),
    ).toBe("image/webp");
  });

  it("refuses a PDF", () => {
    expect(sniffFileType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31))).toBe(
      "application/pdf",
    );
  });

  it("refuses everything else", () => {
    expect(sniffFileType(new TextEncoder().encode("<svg xmlns="))).toBeNull();
    expect(sniffFileType(new TextEncoder().encode("<html>"))).toBeNull();
    expect(
      sniffFileType(
        bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x41, 0x56, 0x49, 0x20),
      ),
    ).toBeNull();
    expect(sniffFileType(bytes(0xff, 0xd8))).toBeNull();
    expect(sniffFileType(bytes())).toBeNull();
  });
});

describe("fileKey", () => {
  it("puts the kind first, then the academy, then the file id", () => {
    expect(
      fileKey({
        kind: "avatar",
        entityId: "AbC123",
        fileId: FILE_ID,
        contentType: "image/webp",
      }),
    ).toBe(`avatar/AbC123/${FILE_ID}.webp`);
    expect(
      fileKey({
        kind: "academy_icon",
        entityId: "AbC123",
        fileId: FILE_ID,
        contentType: "image/png",
      }),
    ).toBe(`icon/AbC123/${FILE_ID}.png`);
  });

  it("refuses ids that could change the path", () => {
    expect(() =>
      fileKey({
        kind: "avatar",
        entityId: "../x",
        fileId: FILE_ID,
        contentType: "image/png",
      }),
    ).toThrow();
    expect(() =>
      fileKey({
        kind: "avatar",
        entityId: "AbC123",
        fileId: "not-a-uuid",
        contentType: "image/png",
      }),
    ).toThrow();
  });
});

describe("isPublicFileKey", () => {
  it("allows avatar and icon keys", () => {
    expect(isPublicFileKey(`avatar/AbC123/${FILE_ID}.webp`)).toBe(true);
    expect(isPublicFileKey(`icon/AbC123/${FILE_ID}.jpg`)).toBe(true);
  });

  it.each([
    `receipt/AbC123/${FILE_ID}.pdf`,
    `receipt/AbC123/${FILE_ID}.jpg`,
    `avatar/AbC123/${FILE_ID}.pdf`,
    `avatar/../receipt/${FILE_ID}.jpg`,
    `avatar/AbC123/${FILE_ID}.webp/x`,
    "avatar/AbC123/abc.webp",
    `smoke/AbC123/${FILE_ID}.png`,
  ])("refuses %s", (key) => {
    expect(isPublicFileKey(key)).toBe(false);
  });
});

describe("publicFileUrl", () => {
  it("joins the app url and the key under /files", () => {
    expect(publicFileUrl("https://matops.app/", "avatar/a/b.webp")).toBe(
      "https://matops.app/files/avatar/a/b.webp",
    );
  });

  it("returns null without a key", () => {
    expect(publicFileUrl("https://matops.app", null)).toBeNull();
  });
});

describe("pendingUploadCutoff", () => {
  it("is one day before now", () => {
    const now = new Date("2026-12-01T10:00:00Z");
    expect(pendingUploadCutoff(now).toISOString()).toBe(
      "2026-11-30T10:00:00.000Z",
    );
  });
});

describe("isFileKind", () => {
  it("knows the three kinds only", () => {
    expect(isFileKind("avatar")).toBe(true);
    expect(isFileKind("academy_icon")).toBe(true);
    expect(isFileKind("payment_receipt")).toBe(true);
    expect(isFileKind("document")).toBe(false);
  });
});

describe("fitWithin", () => {
  it("scales the longest edge down to the limit and keeps the shape", () => {
    expect(fitWithin(4000, 3000, 512)).toEqual({ width: 512, height: 384 });
    expect(fitWithin(1000, 2000, 512)).toEqual({ width: 256, height: 512 });
  });

  it("never scales a small image up", () => {
    expect(fitWithin(300, 200, 512)).toEqual({ width: 300, height: 200 });
  });

  it("never returns a zero edge", () => {
    expect(fitWithin(10_000, 1, 512)).toEqual({ width: 512, height: 1 });
  });
});
