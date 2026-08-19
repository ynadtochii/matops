import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, memberId, seedAcademies } from "./helpers";

const ACAD = "acad_pay";
const OWNER = "u_pay_owner";
const STUDENT = "u_pay_student";
const STUDENT_MEMBER = memberId(ACAD, STUDENT);

describe("payments confirm loop", () => {
  let h: Harness;
  let planId: string;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ACAD,
        code: "700030",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
        ],
      },
    ]);
  });

  afterAll(() => h.close());

  beforeEach(async () => {
    await h.pg.exec(`
      DELETE FROM "payment_claim";
      DELETE FROM "member_dues";
      DELETE FROM "membership_plan";
    `);
    const created = await h.as(OWNER, ACAD).payments.createPlan({
      name: "Unlimited",
      priceMinor: 8000,
      currency: "EUR",
      cycle: "monthly",
    });
    if (!created.id) throw new Error("expected a created plan id");
    planId = created.id;
    await h.as(OWNER, ACAD).payments.setMemberDues({
      memberId: STUDENT_MEMBER,
      planId,
      nextDueAt: "2026-08-31",
    });
  });

  const openClaim = async () => {
    await h.as(STUDENT, ACAD).payments.claim({});
    const [claim] = await h.as(OWNER, ACAD).payments.claims();
    if (!claim) throw new Error("expected a pending claim");
    return claim;
  };

  const dueDate = async () => {
    const res = await h.pg.query<{ d: string }>(
      `SELECT to_char(next_due_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d
         FROM "member_dues" WHERE member_id = $1`,
      [STUDENT_MEMBER],
    );
    return res.rows[0]?.d ?? null;
  };

  it("the student sees the dues line and can pay", async () => {
    const mine = await h.as(STUDENT, ACAD).payments.myDues();
    expect(mine.dues?.amountMinor).toBe(8000);
    expect(mine.dues?.period).toBe("2026-08");
    expect(mine.canPay).toBe(true);
  });

  it("confirming rolls the due date one cycle and closes the claim", async () => {
    const claim = await openClaim();
    expect(await dueDate()).toBe("2026-08-31");
    await h.as(OWNER, ACAD).payments.confirm({ claimId: claim.id });
    expect(await dueDate()).toBe("2026-09-30");
    expect(await h.as(OWNER, ACAD).payments.claims()).toHaveLength(0);
  });

  it("a second confirm is refused and does not roll again", async () => {
    const claim = await openClaim();
    await h.as(OWNER, ACAD).payments.confirm({ claimId: claim.id });
    await expect(
      h.as(OWNER, ACAD).payments.confirm({ claimId: claim.id }),
    ).rejects.toThrow(/already been handled/);
    expect(await dueDate()).toBe("2026-09-30");
  });

  it("rejecting closes the claim without rolling the due date", async () => {
    const claim = await openClaim();
    await h.as(OWNER, ACAD).payments.reject({ claimId: claim.id });
    expect(await dueDate()).toBe("2026-08-31");
    expect(await h.as(OWNER, ACAD).payments.claims()).toHaveLength(0);
  });

  it("a second claim for the same period is refused", async () => {
    await openClaim();
    await expect(h.as(STUDENT, ACAD).payments.claim({})).rejects.toThrow(
      /already submitted/,
    );
    const mine = await h.as(STUDENT, ACAD).payments.myDues();
    expect(mine.canPay).toBe(false);
    expect(mine.openClaim).not.toBeNull();
  });

  it("the member list dot agrees with the student's own view", async () => {
    const [, student] = await h.as(OWNER, ACAD).membership.members();
    const mine = await h.as(STUDENT, ACAD).payments.myDues();
    expect(student?.dues?.status).toBe(mine.dues?.status);
  });

  it("a member with no dues set has no status", async () => {
    await h.as(OWNER, ACAD).payments.setMemberDues({
      memberId: STUDENT_MEMBER,
      planId: null,
      nextDueAt: "2026-08-31",
    });
    const mine = await h.as(STUDENT, ACAD).payments.myDues();
    expect(mine.dues).toBeNull();
    expect(mine.canPay).toBe(false);
  });
});
