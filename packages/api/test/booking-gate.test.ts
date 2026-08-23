import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import {
  harness,
  memberId,
  rejectionCode,
  seedAcademies,
  seedClasses,
} from "./helpers";

const ACAD = "acad_gate";
const OWNER = "u_gate_owner";
const STUDENT = "u_gate_student";
const PENDING = "u_gate_pending";
const CLASS = "00000000-0000-4000-8000-0000000a0001";
const STUDENT_MEMBER = memberId(ACAD, STUDENT);

const isoDaysFromNow = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe("membership booking gate", () => {
  let h: Harness;
  let planId: string;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ACAD,
        code: "700040",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
          {
            userId: PENDING,
            role: "member",
            status: "pending",
            invitedRole: "student",
          },
        ],
      },
    ]);
    await seedClasses(h.pg, [
      { id: CLASS, academyId: ACAD, instructorId: OWNER, startsInMinutes: 30 },
    ]);
  });

  afterAll(() => h.close());

  beforeEach(async () => {
    await h.pg.exec(`
      DELETE FROM "class_participation";
      UPDATE "class" SET booking_count = 0;
      DELETE FROM "payment_claim";
      DELETE FROM "member_dues";
      DELETE FROM "membership_plan";
      DELETE FROM "payment_settings";
      UPDATE "member" SET created_at = now();
    `);
    const created = await h.as(OWNER, ACAD).payments.createPlan({
      name: "Unlimited",
      priceMinor: 8000,
      currency: "EUR",
      cycle: "monthly",
    });
    planId = created.id;
  });

  const enforce = async (graceDays = 7) => {
    await h.as(OWNER, ACAD).payments.updateBookingGate({
      enforced: true,
      graceDays,
    });
  };

  const putOnPlan = async (nextDueAt: string) => {
    await h.as(OWNER, ACAD).payments.setMemberDues({
      memberId: STUDENT_MEMBER,
      planId,
      nextDueAt,
    });
  };

  it("enforcement off: a deeply overdue member still books", async () => {
    await putOnPlan(isoDaysFromNow(-60));
    const res = await h.as(STUDENT, ACAD).booking.book({ classId: CLASS });
    expect(res.tier).toBe("confirmed");
  });

  it("a fresh member with no plan books through the grace window", async () => {
    await enforce();
    const res = await h.as(STUDENT, ACAD).booking.book({ classId: CLASS });
    expect(res.tier).toBe("confirmed");
    const mine = await h.as(STUDENT, ACAD).payments.myDues();
    expect(mine.access.state).toBe("no_plan");
    expect(mine.canChoosePlan).toBe(true);
  });

  it("no plan past the window: booking locks", async () => {
    await enforce();
    await h.pg.query(
      `UPDATE "member" SET created_at = now() - interval '30 days' WHERE id = $1`,
      [STUDENT_MEMBER],
    );
    await h.pg.exec(
      `UPDATE "payment_settings" SET enforced_at = now() - interval '30 days'`,
    );
    expect(
      await rejectionCode(h.as(STUDENT, ACAD).booking.book({ classId: CLASS })),
    ).toBe("PRECONDITION_FAILED");
    const mine = await h.as(STUDENT, ACAD).payments.myDues();
    expect(mine.access).toEqual({
      state: "locked",
      reason: "no_plan",
      daysUntilLock: null,
    });
  });

  it("turning enforcement on grants an old plan-less member the window", async () => {
    await h.pg.query(
      `UPDATE "member" SET created_at = now() - interval '300 days' WHERE id = $1`,
      [STUDENT_MEMBER],
    );
    await enforce();
    const res = await h.as(STUDENT, ACAD).booking.book({ classId: CLASS });
    expect(res.tier).toBe("confirmed");
  });

  it("overdue inside the grace window still books; past it locks", async () => {
    await enforce(7);
    await putOnPlan(isoDaysFromNow(-3));
    expect(
      (await h.as(STUDENT, ACAD).booking.book({ classId: CLASS })).tier,
    ).toBe("confirmed");
    await h.as(STUDENT, ACAD).booking.cancel({ classId: CLASS });
    await putOnPlan(isoDaysFromNow(-20));
    expect(
      await rejectionCode(h.as(STUDENT, ACAD).booking.book({ classId: CLASS })),
    ).toBe("PRECONDITION_FAILED");
  });

  it("an open 'I paid' claim unblocks immediately; a reject re-locks", async () => {
    await enforce();
    await putOnPlan(isoDaysFromNow(-20));
    await h.as(STUDENT, ACAD).payments.claim({});
    expect(
      (await h.as(STUDENT, ACAD).booking.book({ classId: CLASS })).tier,
    ).toBe("confirmed");
    await h.as(STUDENT, ACAD).booking.cancel({ classId: CLASS });
    const [claim] = await h.as(OWNER, ACAD).payments.claims();
    if (!claim) throw new Error("expected a pending claim");
    await h.as(OWNER, ACAD).payments.reject({ claimId: claim.id });
    expect(
      await rejectionCode(h.as(STUDENT, ACAD).booking.book({ classId: CLASS })),
    ).toBe("PRECONDITION_FAILED");
  });

  it("cancel still works while locked", async () => {
    await putOnPlan(isoDaysFromNow(30));
    await h.as(STUDENT, ACAD).booking.book({ classId: CLASS });
    await enforce();
    await putOnPlan(isoDaysFromNow(-20));
    const res = await h.as(STUDENT, ACAD).booking.cancel({ classId: CLASS });
    expect(res.ok).toBe(true);
  });

  it("a pending member's provisional booking is never gated", async () => {
    await enforce();
    await h.pg.exec(
      `UPDATE "member" SET created_at = now() - interval '300 days'`,
    );
    await h.pg.exec(
      `UPDATE "payment_settings" SET enforced_at = now() - interval '300 days'`,
    );
    const res = await h.as(PENDING, ACAD).booking.book({ classId: CLASS });
    expect(res.tier).toBe("provisional");
  });

  it("staff are never gated", async () => {
    await enforce();
    await h.pg.exec(
      `UPDATE "payment_settings" SET enforced_at = now() - interval '300 days'`,
    );
    await h.pg.exec(
      `UPDATE "member" SET created_at = now() - interval '300 days'`,
    );
    const res = await h.as(OWNER, ACAD).booking.book({ classId: CLASS });
    expect(res.tier).toBe("confirmed");
  });

  it("choosePlan sets the first due date to the 1st of next month, once", async () => {
    await h.as(STUDENT, ACAD).payments.choosePlan({ planId });
    const res = await h.pg.query<{ d: string }>(
      `SELECT to_char(next_due_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d
         FROM "member_dues" WHERE member_id = $1`,
      [STUDENT_MEMBER],
    );
    const now = new Date();
    const expected = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    )
      .toISOString()
      .slice(0, 10);
    expect(res.rows[0]?.d).toBe(expected);
    expect(
      await rejectionCode(h.as(STUDENT, ACAD).payments.choosePlan({ planId })),
    ).toBe("PRECONDITION_FAILED");
  });

  it("approving a student in a one-plan academy auto-assigns the plan", async () => {
    await h
      .as(OWNER, ACAD)
      .membership.approve({ memberId: memberId(ACAD, PENDING) });
    const res = await h.pg.query<{ plan_id: string }>(
      `SELECT plan_id FROM "member_dues" WHERE member_id = $1`,
      [memberId(ACAD, PENDING)],
    );
    expect(res.rows[0]?.plan_id).toBe(planId);
    await h.pg.query(
      `UPDATE "member" SET role = 'member', status = 'pending' WHERE id = $1`,
      [memberId(ACAD, PENDING)],
    );
  });

  it("approving with several plans assigns nothing", async () => {
    await h.as(OWNER, ACAD).payments.createPlan({
      name: "Twice a week",
      priceMinor: 5000,
      currency: "EUR",
      cycle: "monthly",
    });
    await h
      .as(OWNER, ACAD)
      .membership.approve({ memberId: memberId(ACAD, PENDING) });
    const res = await h.pg.query(
      `SELECT plan_id FROM "member_dues" WHERE member_id = $1`,
      [memberId(ACAD, PENDING)],
    );
    expect(res.rows).toHaveLength(0);
    await h.pg.query(
      `UPDATE "member" SET role = 'member', status = 'pending' WHERE id = $1`,
      [memberId(ACAD, PENDING)],
    );
  });

  it("the owner roster shows each student's access state", async () => {
    await enforce();
    await putOnPlan(isoDaysFromNow(-20));
    const rows = await h.as(OWNER, ACAD).membership.members();
    const student = rows.find((r) => r.memberId === STUDENT_MEMBER);
    expect(student?.access?.state).toBe("locked");
    const owner = rows.find((r) => r.memberId === memberId(ACAD, OWNER));
    expect(owner?.access).toBeNull();
  });

  it("the gate toggle round-trips through getRequisites", async () => {
    await enforce(10);
    let req = await h.as(OWNER, ACAD).payments.getRequisites();
    expect(req.enforced).toBe(true);
    expect(req.graceDays).toBe(10);
    await h
      .as(OWNER, ACAD)
      .payments.updateBookingGate({ enforced: false, graceDays: 10 });
    req = await h.as(OWNER, ACAD).payments.getRequisites();
    expect(req.enforced).toBe(false);
  });
});
