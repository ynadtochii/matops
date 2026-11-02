import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { monthsFrom } from "@matops/domain";

import type { Harness } from "./helpers";
import { harness, rejectionCode, uploadProof } from "./helpers";

const ACAD = "acad_upfront";
const OWNER = "u_upfront_owner";
const MANAGER = "u_upfront_manager";
const STUDENT = "u_upfront_student";
const DESK = "u_upfront_desk";
const NOV = "2026-11-01";

describe("paying several months upfront (ADR 161)", () => {
  let h: Harness;
  let planId: string;
  let bankId: string;
  let studentAssignment: string;
  let deskAssignment: string;

  const owner = () => h.as(OWNER, ACAD);
  const manager = () => h.as(MANAGER, ACAD);
  const student = () => h.as(STUDENT, ACAD);
  const desk = () => h.as(DESK, ACAD);
  const statuses = async (assignmentId: string) =>
    (
      await h.pg.query<{ month: string; status: string; price_minor: number }>(
        `SELECT to_char(month, 'YYYY-MM-DD') AS month, status, price_minor FROM membership_month WHERE assignment_id = $1 ORDER BY month`,
        [assignmentId],
      )
    ).rows;
  const mine = async (who = student()) => {
    const held = (await who.accessPlan.mine()).memberships[0];
    if (!held) throw new Error("no membership");
    return held;
  };

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
    h = await harness([
      {
        id: ACAD,
        code: "700161",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: MANAGER, role: "manager", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
          { userId: DESK, role: "student", status: "active" },
        ],
      },
    ]);
    await h.pg.query(
      `UPDATE entity SET membership_enforced_at = now() WHERE id = $1`,
      [ACAD],
    );
    await owner().accessPlan.setPolicy({
      graceDays: 7,
      calendarTimeZone: "UTC",
    });
    planId = (
      await owner().accessPlan.create({
        name: "BJJ",
        entityIds: [ACAD],
        priceMinor: 5000,
        currency: "EUR",
      })
    ).id;
    bankId = (
      await owner().paymentMethod.save({
        kind: "bank",
        label: "Bank transfer",
        details: "IBAN PT50 0000",
        enabled: true,
      })
    ).id;
    studentAssignment = (
      await owner().accessPlan.assign({ userId: STUDENT, planId })
    ).id;
    deskAssignment = (await owner().accessPlan.assign({ userId: DESK, planId }))
      .id;
  });

  afterAll(async () => {
    await h.close();
    vi.useRealTimers();
  });

  it("lets only the owner set the pay-ahead rule", async () => {
    const rule = { fromMonths: 3, percent: 10, monthMinor: null };
    expect(
      await rejectionCode(manager().accessPlan.setDiscount({ planId, rule })),
    ).toBe("FORBIDDEN");
    expect(
      await rejectionCode(
        owner().accessPlan.setDiscount({
          planId,
          rule: { fromMonths: 3, percent: null, monthMinor: 5000 },
        }),
      ),
    ).toBe("BAD_REQUEST");
    await owner().accessPlan.setDiscount({ planId, rule });
    const plans = await manager().accessPlan.list();
    expect(plans.find((p) => p.id === planId)?.discount).toEqual(rule);
    const offer = await mine();
    expect(offer.upfront).toMatchObject({
      firstMonth: NOV,
      monthlyMinor: 5000,
      rule,
    });
  });

  it("lets only the owner add the rule when creating a plan", async () => {
    const discount = { fromMonths: 6, percent: null, monthMinor: 4200 };
    const plan = {
      name: "BJJ + Gym",
      entityIds: [ACAD],
      priceMinor: 6000,
      currency: "EUR",
      discount,
    };
    expect(await rejectionCode(manager().accessPlan.create(plan))).toBe(
      "FORBIDDEN",
    );
    expect(
      await rejectionCode(
        owner().accessPlan.create({
          ...plan,
          discount: { ...discount, monthMinor: 6000 },
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      await rejectionCode(
        owner().accessPlan.create({
          name: "No price yet",
          entityIds: [ACAD],
          discount,
        }),
      ),
    ).toBe("BAD_REQUEST");
    const made = await owner().accessPlan.create(plan);
    const plans = await manager().accessPlan.list();
    expect(plans.find((p) => p.id === made.id)?.discount).toEqual(discount);
    await expect(
      manager().accessPlan.create({
        ...plan,
        name: "Plain",
        discount: undefined,
      }),
    ).resolves.toBeDefined();
  });

  it("takes a several-month claim only by cash or bank, at the quoted total", async () => {
    expect(
      await rejectionCode(
        student().accessPlan.claimMonth({
          assignmentId: studentAssignment,
          months: 3,
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      await rejectionCode(
        student().accessPlan.claimMonth({
          assignmentId: studentAssignment,
          months: 3,
          methodId: bankId,
          priceMinor: 15000,
          currency: "EUR",
          proofFileId: await uploadProof(h, STUDENT, ACAD),
        }),
      ),
    ).toBe("CONFLICT");
  });

  it("reports three months as one purchase with its share on each month", async () => {
    const claimed = await student().accessPlan.claimMonth({
      assignmentId: studentAssignment,
      months: 3,
      methodId: bankId,
      priceMinor: 13500,
      currency: "EUR",
      proofFileId: await uploadProof(h, STUDENT, ACAD),
    });
    expect(claimed).toMatchObject({ claimed: true, month: NOV });
    expect(await statuses(studentAssignment)).toEqual(
      monthsFrom(NOV, 3).map((month) => ({
        month,
        status: "reported",
        price_minor: 4500,
      })),
    );
    const claims = await manager().accessPlan.claims();
    const mineClaims = claims.filter(
      (c) => c.assignmentId === studentAssignment,
    );
    expect(mineClaims).toHaveLength(1);
    expect(mineClaims[0]?.purchase).toMatchObject({
      months: 3,
      totalMinor: 13500,
      currency: "EUR",
    });
    expect((await mine()).upfront?.firstMonth).toBe("2027-02-01");
  });

  it("confirms every month of the purchase at once", async () => {
    await manager().accessPlan.markMonth({
      assignmentId: studentAssignment,
      month: NOV,
      paid: true,
    });
    expect((await statuses(studentAssignment)).map((r) => r.status)).toEqual([
      "confirmed",
      "confirmed",
      "confirmed",
    ]);
    expect((await mine()).paidUntil).toBe("2027-01-01");
    const board = await manager().accessPlan.monthBoard();
    expect(
      board.rows.find((r) => r.assignmentId === studentAssignment)
        ?.paidUntilLabel,
    ).not.toBeNull();
  });

  it("lets staff record months at the rule's total, and only the owner change it", async () => {
    expect(
      await rejectionCode(
        manager().accessPlan.recordPurchase({
          assignmentId: deskAssignment,
          months: 2,
          totalMinor: 8000,
        }),
      ),
    ).toBe("FORBIDDEN");
    const recorded = await manager().accessPlan.recordPurchase({
      assignmentId: deskAssignment,
      months: 2,
      methodId: bankId,
    });
    expect(recorded).toMatchObject({
      firstMonth: NOV,
      lastMonth: "2026-12-01",
    });
    expect(await statuses(deskAssignment)).toEqual([
      { month: NOV, status: "confirmed", price_minor: 5000 },
      { month: "2026-12-01", status: "confirmed", price_minor: 5000 },
    ]);
    const deal = await owner().accessPlan.recordPurchase({
      assignmentId: deskAssignment,
      months: 3,
      totalMinor: 10000,
    });
    expect(deal.firstMonth).toBe("2027-01-01");
    expect(
      (await statuses(deskAssignment)).slice(2).map((r) => r.price_minor),
    ).toEqual([3334, 3333, 3333]);
    expect((await mine(desk())).paidUntil).toBe("2027-03-01");
  });

  it("lets only the owner discard a purchase, keeping the months already used", async () => {
    const { rows } = await h.pg.query<{ id: string }>(
      `SELECT id FROM membership_purchase WHERE assignment_id = $1 AND first_month = '2026-11-01'`,
      [deskAssignment],
    );
    const purchaseId = rows[0]?.id ?? "";
    expect(
      await rejectionCode(manager().accessPlan.discardPurchase({ purchaseId })),
    ).toBe("FORBIDDEN");
    expect(await owner().accessPlan.discardPurchase({ purchaseId })).toEqual({
      dropped: 1,
    });
    expect((await statuses(deskAssignment)).map((r) => r.month)).toEqual([
      NOV,
      "2027-01-01",
      "2027-02-01",
      "2027-03-01",
    ]);
    expect(
      await rejectionCode(owner().accessPlan.discardPurchase({ purchaseId })),
    ).toBe("NOT_FOUND");
  });

  it("rejects a several-month claim as a whole", async () => {
    await student().accessPlan.claimMonth({
      assignmentId: studentAssignment,
      months: 2,
      methodId: bankId,
      priceMinor: 10000,
      currency: "EUR",
      proofFileId: await uploadProof(h, STUDENT, ACAD),
    });
    await manager().accessPlan.rejectClaim({
      assignmentId: studentAssignment,
      month: "2027-02-01",
    });
    expect(
      (await statuses(studentAssignment)).map((r) => [r.month, r.status]),
    ).toEqual([
      [NOV, "confirmed"],
      ["2026-12-01", "confirmed"],
      ["2027-01-01", "confirmed"],
      ["2027-02-01", "rejected"],
    ]);
  });
});
