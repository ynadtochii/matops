import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, rejectionCode, seedAcademies, seedClasses } from "./helpers";

const ACAD = "acad_seam";
const OTHER = "acad_seam_other";
const OWNER = "u_seam_owner";
const COACH = "u_seam_coach";
const STUDENT = "u_seam_student";
const OTHER_OWNER = "u_seam_other_owner";
const CLASS_NOW = "44444444-4444-4444-8444-000000000001";
const CLASS_LATER = "44444444-4444-4444-8444-000000000002";

describe("procedures that write identity tables", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ACAD,
        code: "700090",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: COACH, role: "instructor", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
        ],
      },
      {
        id: OTHER,
        code: "700091",
        members: [{ userId: OTHER_OWNER, role: "owner", status: "active" }],
      },
    ]);
    await seedClasses(h.pg, [
      {
        id: CLASS_NOW,
        academyId: ACAD,
        instructorId: COACH,
        startsInMinutes: 5,
      },
      {
        id: CLASS_LATER,
        academyId: ACAD,
        instructorId: COACH,
        startsInMinutes: 90,
      },
    ]);
  });

  afterAll(() => h.close());

  describe("invite links", () => {
    it("creates, lists and rotates without hanging", async () => {
      const created = await h
        .as(OWNER, ACAD)
        .invite.create({ role: "student" });
      expect(created.role).toBe("student");

      const listed = await h.as(OWNER, ACAD).invite.list();
      expect(listed.map((i) => i.id)).toContain(created.id);

      const rotated = await h
        .as(OWNER, ACAD)
        .invite.rotate({ role: "student" });
      expect(rotated.token).not.toBe(created.token);

      const after = await h.as(OWNER, ACAD).invite.list();
      expect(after.map((i) => i.id)).toContain(rotated.id);
      expect(after.map((i) => i.id)).not.toContain(created.id);
    });

    it("resolves a live token and refuses a rotated one", async () => {
      const link = await h.as(OWNER, ACAD).invite.create({ role: "student" });
      const resolved = await h.as(STUDENT, ACAD).invite.resolve({
        token: link.token,
      });
      expect(resolved.academyId).toBe(ACAD);

      await h.as(OWNER, ACAD).invite.rotate({ role: "student" });
      expect(
        await rejectionCode(
          h.as(STUDENT, ACAD).invite.resolve({ token: link.token }),
        ),
      ).toBe("NOT_FOUND");
    });

    it("is staff-readable, owner-written, and never leaks another academy's links", async () => {
      const made = await h
        .as(OWNER, ACAD)
        .invite.create({ role: "instructor" });

      const readable = await h.as(COACH, ACAD).invite.list();
      expect(readable.map((i) => i.id)).toContain(made.id);
      expect(
        await rejectionCode(
          h.as(COACH, ACAD).invite.create({ role: "student" }),
        ),
      ).toBe("FORBIDDEN");
      expect(await rejectionCode(h.as(STUDENT, ACAD).invite.list())).toBe(
        "FORBIDDEN",
      );

      const theirs = await h.as(OTHER_OWNER, OTHER).invite.list();
      expect(theirs).toHaveLength(0);
    });
  });
});
