import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, memberId, seedAcademies } from "./helpers";

const A = "acad_scope_a";
const B = "acad_scope_b";
const OWNER_A = "u_scope_owner_a";
const STUDENT_A = "u_scope_student_a";
const OWNER_B = "u_scope_owner_b";
const STUDENT_B = "u_scope_student_b";

const FOREIGN = memberId(B, STUDENT_B);
const OWN = memberId(A, STUDENT_A);

describe("member-scoped owner mutations reject a foreign memberId", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: A,
        code: "700020",
        members: [
          { userId: OWNER_A, role: "owner", status: "active" },
          { userId: STUDENT_A, role: "student", status: "active" },
        ],
      },
      {
        id: B,
        code: "700021",
        members: [
          { userId: OWNER_B, role: "owner", status: "active" },
          { userId: STUDENT_B, role: "student", status: "active" },
        ],
      },
    ]);
  });

  afterAll(() => h.close());

  const owner = () => h.as(OWNER_A, A);

  it("membership.approve", async () => {
    await expect(
      owner().membership.approve({ memberId: FOREIGN }),
    ).rejects.toThrow(/Member not found/);
  });

  it("membership.suspend", async () => {
    await expect(
      owner().membership.suspend({ memberId: FOREIGN }),
    ).rejects.toThrow(/Member not found/);
  });

  it("membership.memberHistory", async () => {
    await expect(
      owner().membership.memberHistory({ memberId: FOREIGN }),
    ).rejects.toThrow(/Member not found/);
  });

  it("note.add", async () => {
    await expect(
      owner().note.add({ memberId: FOREIGN, body: "leaked" }),
    ).rejects.toThrow(/Member not found/);
  });

  it("note.forMember", async () => {
    await expect(owner().note.forMember({ memberId: FOREIGN })).rejects.toThrow(
      /Member not found/,
    );
  });

  it("rank.set", async () => {
    await expect(
      owner().rank.set({
        memberId: FOREIGN,
        discipline: "bjj",
        belt: "blue",
        stripes: 0,
      }),
    ).rejects.toThrow(/Member not found/);
  });

  it("rank.forMember", async () => {
    await expect(owner().rank.forMember({ memberId: FOREIGN })).rejects.toThrow(
      /Member not found/,
    );
  });

  it("payments.setMemberDues", async () => {
    await expect(
      owner().payments.setMemberDues({
        memberId: FOREIGN,
        planId: null,
        nextDueAt: "2026-09-01",
      }),
    ).rejects.toThrow(/Member not found/);
  });

  it("referral.assign", async () => {
    await expect(
      owner().referral.assign({
        studentMemberId: FOREIGN,
        referrerMemberId: OWN,
      }),
    ).rejects.toThrow(/Member not found/);
  });

  it("referral.history", async () => {
    await expect(
      owner().referral.history({ studentMemberId: FOREIGN }),
    ).rejects.toThrow(/Member not found|Student not found/);
  });

  it("the same calls work on the owner's own academy", async () => {
    await expect(
      owner().note.add({ memberId: OWN, body: "kept" }),
    ).resolves.toEqual({ ok: true });
    const notes = await owner().note.forMember({ memberId: OWN });
    expect(notes).toHaveLength(1);
  });

  it("the member list never shows another academy's people", async () => {
    const rows = await owner().membership.members();
    expect(rows.map((r) => r.memberId).sort()).toEqual([OWN]);
  });
});
