import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, seedAcademies, seedClasses } from "./helpers";

const A = "acad_seam_a";
const B = "acad_seam_b";
const OWNER_A = "u_owner_a";
const STUDENT_A = "u_student_a";
const PENDING_A = "u_pending_a";
const SUSPENDED_A = "u_suspended_a";
const REMOVED_A = "u_removed_a";
const INSTRUCTOR_A = "u_instructor_a";
const OWNER_B = "u_owner_b";
const CLASS_A = "bbbbbbbb-0000-4000-8000-00000000000a";
const CLASS_B = "bbbbbbbb-0000-4000-8000-00000000000b";

const WEEK = {
  from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

describe("tenant seam", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: A,
        code: "700010",
        members: [
          { userId: OWNER_A, role: "owner", status: "active" },
          { userId: INSTRUCTOR_A, role: "instructor", status: "active" },
          { userId: STUDENT_A, role: "student", status: "active" },
          {
            userId: PENDING_A,
            role: "member",
            status: "pending",
            invitedRole: "student",
          },
          { userId: SUSPENDED_A, role: "student", status: "suspended" },
          { userId: REMOVED_A, role: "student", status: "removed" },
        ],
      },
      {
        id: B,
        code: "700011",
        members: [{ userId: OWNER_B, role: "owner", status: "active" }],
      },
    ]);
    await seedClasses(h.pg, [
      { id: CLASS_A, academyId: A, instructorId: OWNER_A, startsInMinutes: 30 },
      { id: CLASS_B, academyId: B, instructorId: OWNER_B, startsInMinutes: 30 },
    ]);
  });

  afterAll(() => h.close());

  it("rejects a caller with no active academy", async () => {
    await expect(h.as(STUDENT_A, null).class.mine(WEEK)).rejects.toThrow(
      /No active organization/,
    );
  });

  it("rejects a caller who is not a member of the active academy", async () => {
    await expect(h.as(OWNER_B, A).class.mine(WEEK)).rejects.toThrow(
      /not a member/,
    );
  });

  it("rejects a suspended member and says it is reversible", async () => {
    await expect(h.as(SUSPENDED_A, A).class.mine(WEEK)).rejects.toThrow(
      /suspended/,
    );
  });

  it("rejects a removed member", async () => {
    await expect(h.as(REMOVED_A, A).class.mine(WEEK)).rejects.toThrow(
      /removed/,
    );
  });

  it("admits a pending member at the enrolled tier", async () => {
    const rows = await h.as(PENDING_A, A).class.mine(WEEK);
    expect(rows).toHaveLength(1);
  });

  it("blocks a pending member from the member tier", async () => {
    await expect(h.as(PENDING_A, A).booking.mine()).resolves.toBeInstanceOf(
      Array,
    );
    await expect(h.as(PENDING_A, A).membership.members()).rejects.toThrow(
      /pending approval/,
    );
  });

  it("blocks a student from staff procedures", async () => {
    await expect(
      h.as(STUDENT_A, A).attendance.list({ id: CLASS_A }),
    ).rejects.toThrow(/Staff only/);
  });

  it("blocks an instructor from owner procedures", async () => {
    await expect(h.as(INSTRUCTOR_A, A).membership.staff()).rejects.toThrow(
      /Owner only/,
    );
    await expect(
      h.as(INSTRUCTOR_A, A).attendance.list({ id: CLASS_A }),
    ).resolves.toBeTruthy();
  });

  it("refuses the referral ledger to an instructor", async () => {
    await expect(h.as(INSTRUCTOR_A, A).referral.dashboard()).rejects.toThrow(
      /Owner only/,
    );
    await expect(h.as(OWNER_A, A).referral.dashboard()).resolves.toBeTruthy();
  });

  it("keeps the owner-only figures off an instructor's dashboard", async () => {
    const forInstructor = await h.as(INSTRUCTOR_A, A).stats.dashboard();
    expect(forInstructor.insights.newMembers).toBeNull();
    expect(forInstructor.drifting).toBeNull();
    expect(forInstructor.revenue).toBeNull();

    const forOwner = await h.as(OWNER_A, A).stats.dashboard();
    expect(forOwner.insights.newMembers?.thisMonth).toBeGreaterThan(0);
    expect(forOwner.drifting).not.toBeNull();
    expect(forOwner.revenue).not.toBeNull();
  });

  it("RLS hides another academy's classes from the week read", async () => {
    const mine = await h.as(STUDENT_A, A).class.mine(WEEK);
    expect(mine.map((c) => c.id)).toEqual([CLASS_A]);
    const theirs = await h.as(OWNER_B, B).class.week(WEEK);
    expect(theirs.map((c) => c.id)).toEqual([CLASS_B]);
  });

  it("RLS hides another academy's class from a direct id read", async () => {
    await expect(h.as(STUDENT_A, A).class.get({ id: CLASS_B })).rejects.toThrow(
      /Class not found/,
    );
  });

  it("RLS blocks booking another academy's class", async () => {
    await expect(
      h.as(STUDENT_A, A).booking.book({ classId: CLASS_B }),
    ).rejects.toThrow(/Class not found/);
  });
});
