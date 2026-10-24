import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { resetRateLimits } from "../src/rate-limit";
import { appRouter } from "../src/root";
import { harness, memberId, personId, rejectionCode } from "./helpers";

const A = "storage_academy_a";
const B = "storage_academy_b";
const OWNER = "storage_owner";
const MANAGER = "storage_manager";
const COACH = "storage_coach";
const STUDENT = "storage_student";
const APPLICANT = "storage_applicant";
const OTHER_OWNER = "storage_other_owner";

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8,
]);
const SVG = new TextEncoder().encode('<svg xmlns="x"></svg>');

describe("storage router (ADR 152)", () => {
  let h: Harness;

  beforeEach(async () => {
    resetRateLimits();
    h = await harness([
      {
        id: A,
        code: "815201",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: MANAGER, role: "manager", status: "active" },
          { userId: COACH, role: "instructor", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
          { userId: APPLICANT, role: "student", status: "pending" },
        ],
      },
      {
        id: B,
        code: "815202",
        members: [{ userId: OTHER_OWNER, role: "owner", status: "active" }],
      },
    ]);
  });

  afterEach(async () => {
    await h.close();
  });

  async function upload(
    userId: string,
    kind: "avatar" | "academy_icon",
    bytes: Uint8Array = PNG,
    academyId = A,
  ) {
    const caller = h.as(userId, academyId);
    const started = await caller.storage.createUpload({
      kind,
      contentType: "image/png",
      sizeBytes: bytes.byteLength,
    });
    const key = started.url.replace("fake://put/", "");
    h.storage.put(key, bytes, "image/png");
    const done = await caller.storage.completeUpload({
      fileId: started.fileId,
    });
    return { ...started, key, url: done.url };
  }

  const fileRow = async (id: string) =>
    (
      await h.pg.query<{ status: string; kind: string }>(
        `SELECT status, kind FROM stored_file WHERE id = $1`,
        [id],
      )
    ).rows[0];

  it("uploads an avatar and shows it on academy.current", async () => {
    const done = await upload(STUDENT, "avatar");

    expect(done.key).toMatch(/^avatar\/storage_academy_a\/[0-9a-f-]{36}\.png$/);
    expect(done.url).toBe(`http://localhost:3004/files/${done.key}`);
    expect(done.headers).toEqual({
      "content-type": "image/png",
      "cache-control": "public, max-age=2592000, immutable",
    });
    expect(await fileRow(done.fileId)).toEqual({
      status: "ready",
      kind: "avatar",
    });
    const current = await h.as(STUDENT, A).academy.current();
    expect(current?.avatarUrl).toBe(done.url);
    expect(current?.iconUrl).toBeNull();
  });

  it("lets a pending student set an avatar", async () => {
    const done = await upload(APPLICANT, "avatar");
    expect(await fileRow(done.fileId)).toEqual({
      status: "ready",
      kind: "avatar",
    });
  });

  it("replaces the avatar and deletes the old object and row", async () => {
    const first = await upload(STUDENT, "avatar");
    const second = await upload(STUDENT, "avatar");

    expect(h.storage.objects.has(first.key)).toBe(false);
    expect(h.storage.objects.has(second.key)).toBe(true);
    expect(await fileRow(first.fileId)).toBeUndefined();
    const current = await h.as(STUDENT, A).academy.current();
    expect(current?.avatarUrl).toBe(second.url);
  });

  it("shows the avatar in the member, staff and walk-in lists", async () => {
    const student = await upload(STUDENT, "avatar");
    const coach = await upload(COACH, "avatar");

    const members = await h.as(OWNER, A).membership.members({
      audience: "all",
    });
    const staff = await h.as(OWNER, A).membership.staff();
    const walkIns = await h.as(COACH, A).attendance.members();

    expect(
      members.find((m) => m.memberId === memberId(A, STUDENT))?.avatarUrl,
    ).toBe(student.url);
    expect(
      members.find((m) => m.memberId === memberId(A, OWNER))?.avatarUrl,
    ).toBeNull();
    expect(
      staff.find((m) => m.memberId === memberId(A, COACH))?.avatarUrl,
    ).toBe(coach.url);
    const studentIds = [personId(A, STUDENT), STUDENT];
    expect(walkIns.find((m) => studentIds.includes(m.id))?.avatarUrl).toBe(
      student.url,
    );
  });

  it("removes the avatar", async () => {
    const done = await upload(STUDENT, "avatar");

    await h.as(STUDENT, A).storage.removeAvatar();

    expect(h.storage.objects.has(done.key)).toBe(false);
    expect(await fileRow(done.fileId)).toBeUndefined();
    const current = await h.as(STUDENT, A).academy.current();
    expect(current?.avatarUrl).toBeNull();
  });

  it("lets an owner or manager set the academy icon, and everyone see it", async () => {
    const byOwner = await upload(OWNER, "academy_icon");
    expect(byOwner.key).toMatch(/^icon\/storage_academy_a\//);

    const byManager = await upload(MANAGER, "academy_icon");
    expect(h.storage.objects.has(byOwner.key)).toBe(false);

    const current = await h.as(STUDENT, A).academy.current();
    expect(current?.iconUrl).toBe(byManager.url);
  });

  it("refuses the icon to an instructor and a student", async () => {
    for (const userId of [COACH, STUDENT]) {
      expect(
        await rejectionCode(
          h.as(userId, A).storage.createUpload({
            kind: "academy_icon",
            contentType: "image/png",
            sizeBytes: 10,
          }),
        ),
      ).toBe("FORBIDDEN");
      expect(await rejectionCode(h.as(userId, A).storage.removeIcon())).toBe(
        "FORBIDDEN",
      );
    }
  });

  it("shows the icon on the public join and drop-in links", async () => {
    const icon = await upload(OWNER, "academy_icon");
    const invite = await h.as(OWNER, A).invite.create({ role: "student" });
    const dropIn = await h.as(OWNER, A).dropIn.link();

    const joined = await h
      .as("nobody", null)
      .invite.resolve({ token: invite.token });
    const visited = await h
      .as("nobody", null)
      .dropIn.resolve({ token: dropIn.token });

    expect(joined.academyIconUrl).toBe(icon.url);
    expect(visited.iconUrl).toBe(icon.url);
    expect(joined).not.toHaveProperty("academyIconKey");
  });

  it("removes the icon", async () => {
    const done = await upload(OWNER, "academy_icon");

    await h.as(OWNER, A).storage.removeIcon();

    expect(h.storage.objects.has(done.key)).toBe(false);
    const current = await h.as(OWNER, A).academy.current();
    expect(current?.iconUrl).toBeNull();
  });

  it("refuses a file over the kind's limit", async () => {
    expect(
      await rejectionCode(
        h.as(STUDENT, A).storage.createUpload({
          kind: "avatar",
          contentType: "image/png",
          sizeBytes: 2 * 1024 * 1024 + 1,
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("refuses bytes that are not the declared type and deletes them", async () => {
    const caller = h.as(STUDENT, A);
    const started = await caller.storage.createUpload({
      kind: "avatar",
      contentType: "image/png",
      sizeBytes: SVG.byteLength,
    });
    const key = started.url.replace("fake://put/", "");
    h.storage.put(key, SVG, "image/png");

    expect(
      await rejectionCode(
        caller.storage.completeUpload({ fileId: started.fileId }),
      ),
    ).toBe("BAD_REQUEST");
    expect(h.storage.objects.has(key)).toBe(false);
    expect((await fileRow(started.fileId))?.status).toBe("pending");
  });

  it("refuses an object whose size differs from the one signed", async () => {
    const caller = h.as(STUDENT, A);
    const started = await caller.storage.createUpload({
      kind: "avatar",
      contentType: "image/png",
      sizeBytes: PNG.byteLength + 1,
    });
    const key = started.url.replace("fake://put/", "");
    h.storage.put(key, PNG, "image/png");

    expect(
      await rejectionCode(
        caller.storage.completeUpload({ fileId: started.fileId }),
      ),
    ).toBe("BAD_REQUEST");
    expect(h.storage.objects.has(key)).toBe(false);
  });

  it("says when nothing was uploaded yet", async () => {
    const started = await h.as(STUDENT, A).storage.createUpload({
      kind: "avatar",
      contentType: "image/png",
      sizeBytes: 16,
    });

    expect(
      await rejectionCode(
        h.as(STUDENT, A).storage.completeUpload({ fileId: started.fileId }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("never completes someone else's upload or one from another academy", async () => {
    const started = await h.as(STUDENT, A).storage.createUpload({
      kind: "avatar",
      contentType: "image/png",
      sizeBytes: PNG.byteLength,
    });
    h.storage.put(started.url.replace("fake://put/", ""), PNG, "image/png");

    expect(
      await rejectionCode(
        h.as(COACH, A).storage.completeUpload({ fileId: started.fileId }),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await rejectionCode(
        h.as(OTHER_OWNER, B).storage.completeUpload({
          fileId: started.fileId,
        }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("completes an upload only once", async () => {
    const done = await upload(STUDENT, "avatar");

    expect(
      await rejectionCode(
        h.as(STUDENT, A).storage.completeUpload({ fileId: done.fileId }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("sweeps the caller's abandoned uploads older than a day", async () => {
    const caller = h.as(STUDENT, A);
    const old = await caller.storage.createUpload({
      kind: "avatar",
      contentType: "image/png",
      sizeBytes: PNG.byteLength,
    });
    const oldKey = old.url.replace("fake://put/", "");
    h.storage.put(oldKey, PNG, "image/png");
    await h.pg.query(
      `UPDATE stored_file SET created_at = now() - interval '2 days' WHERE id = $1`,
      [old.fileId],
    );

    await caller.storage.createUpload({
      kind: "avatar",
      contentType: "image/png",
      sizeBytes: PNG.byteLength,
    });

    expect(await fileRow(old.fileId)).toBeUndefined();
    expect(h.storage.objects.has(oldKey)).toBe(false);
  });

  it("limits uploads per user per hour", async () => {
    const start = () =>
      h.as(STUDENT, A).storage.createUpload({
        kind: "avatar",
        contentType: "image/png",
        sizeBytes: 16,
      });
    for (let i = 0; i < 20; i++) await start();

    expect(await rejectionCode(start())).toBe("TOO_MANY_REQUESTS");
  });

  it("refuses uploads when storage is not set up", async () => {
    const caller = appRouter.createCaller({
      ...h.ctxFor(STUDENT, A),
      storage: null,
    });

    expect(
      await rejectionCode(
        caller.storage.createUpload({
          kind: "avatar",
          contentType: "image/png",
          sizeBytes: 16,
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("deletes the member's avatar object when the member is erased", async () => {
    const done = await upload(STUDENT, "avatar");
    const icon = await upload(OWNER, "academy_icon");
    await h.as(STUDENT, A).membership.requestErasure();

    await h.as(OWNER, A).membership.purge({ memberId: memberId(A, STUDENT) });

    expect(h.storage.objects.has(done.key)).toBe(false);
    expect(h.storage.objects.has(icon.key)).toBe(true);
  });
});
