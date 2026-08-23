import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, memberId, rejectionCode, seedAcademies } from "./helpers";

const ACAD = "acad_desk";
const OWNER = "u_desk_owner";
const COACH = "u_desk_coach";
const STUDENT = "u_desk_student";
const PENDING = "u_desk_pending";
const PENDING_TWO = "u_desk_pending_two";
const PENDING_COACH = "u_desk_pending_coach";

describe("an instructor runs the desk", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ACAD,
        code: "700050",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: COACH, role: "instructor", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
          {
            userId: PENDING,
            role: "member",
            status: "pending",
            invitedRole: "student",
          },
          {
            userId: PENDING_TWO,
            role: "member",
            status: "pending",
            invitedRole: "student",
          },
          {
            userId: PENDING_COACH,
            role: "member",
            status: "pending",
            invitedRole: "instructor",
          },
        ],
      },
    ]);
  });

  afterAll(() => h.close());

  const coach = () => h.as(COACH, ACAD);
  const owner = () => h.as(OWNER, ACAD);

  it("reads the roster", async () => {
    const rows = await coach().membership.members();
    expect(rows.map((r) => r.memberId)).toContain(memberId(ACAD, STUDENT));
  });

  it("approves a pending student", async () => {
    await coach().membership.approve({ memberId: memberId(ACAD, PENDING) });

    const rows = await coach().membership.members();
    const approved = rows.find((r) => r.memberId === memberId(ACAD, PENDING));
    expect(approved?.status).toBe("active");
    expect(approved?.role).toBe("student");
  });

  it("declines a pending student", async () => {
    await coach().membership.reject({ memberId: memberId(ACAD, PENDING_TWO) });

    const rows = await coach().membership.members();
    expect(rows.map((r) => r.memberId)).not.toContain(
      memberId(ACAD, PENDING_TWO),
    );
  });

  it("sets a rank", async () => {
    await coach().rank.set({
      memberId: memberId(ACAD, STUDENT),
      discipline: "bjj",
      belt: "blue",
      stripes: 1,
    });

    const ranks = await coach().rank.forMember({
      memberId: memberId(ACAD, STUDENT),
    });
    expect(ranks.ranks[0]?.belt).toBe("blue");
  });

  it("opens a member's history", async () => {
    await expect(
      coach().membership.memberHistory({ memberId: memberId(ACAD, STUDENT) }),
    ).resolves.toBeTruthy();
  });

  it("never sees the dues figures the owner sees", async () => {
    const plan = await owner().payments.createPlan({
      name: "Unlimited",
      priceMinor: 5000,
      currency: "EUR",
    });
    await owner().payments.setMemberDues({
      memberId: memberId(ACAD, STUDENT),
      planId: plan.id,
      nextDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const forOwner = await owner().membership.members();
    const forCoach = await coach().membership.members();
    const pick = (rows: typeof forOwner) =>
      rows.find((r) => r.memberId === memberId(ACAD, STUDENT));

    expect(pick(forOwner)?.dues?.priceMinor).toBe(5000);
    expect(pick(forCoach)?.dues).toBeNull();
  });

  it("is still refused everything that is the owner's job", async () => {
    const target = { memberId: memberId(ACAD, STUDENT) };

    expect(await rejectionCode(coach().membership.archive(target))).toBe(
      "FORBIDDEN",
    );
    expect(await rejectionCode(coach().membership.purge(target))).toBe(
      "FORBIDDEN",
    );
    expect(await rejectionCode(coach().membership.archived())).toBe(
      "FORBIDDEN",
    );
    expect(await rejectionCode(coach().membership.suspend(target))).toBe(
      "FORBIDDEN",
    );
    expect(await rejectionCode(coach().membership.promote(target))).toBe(
      "FORBIDDEN",
    );
    expect(
      await rejectionCode(
        coach().membership.setRole({ ...target, role: "instructor" }),
      ),
    ).toBe("FORBIDDEN");
    expect(await rejectionCode(coach().membership.staff())).toBe("FORBIDDEN");
    expect(await rejectionCode(coach().dropIn.list())).toBe("FORBIDDEN");
    expect(await rejectionCode(coach().invite.list())).toBe("FORBIDDEN");
  });

  it("cannot let a coach seat itself a colleague", async () => {
    const target = { memberId: memberId(ACAD, PENDING_COACH) };

    expect(await rejectionCode(coach().membership.approve(target))).toBe(
      "FORBIDDEN",
    );
    expect(await rejectionCode(coach().membership.reject(target))).toBe(
      "FORBIDDEN",
    );

    await owner().membership.approve(target);
    const seated = (await owner().membership.members()).find(
      (r) => r.memberId === target.memberId,
    );
    expect(seated?.role).toBe("instructor");
  });

  it("still refuses a student the desk entirely", async () => {
    expect(await rejectionCode(h.as(STUDENT, ACAD).membership.members())).toBe(
      "FORBIDDEN",
    );
    expect(
      await rejectionCode(
        h.as(STUDENT, ACAD).membership.approve({
          memberId: memberId(ACAD, PENDING),
        }),
      ),
    ).toBe("FORBIDDEN");
  });
});
