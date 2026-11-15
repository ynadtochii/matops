import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { eq } from "@matops/db";
import { entity } from "@matops/db/schema";

import type { Harness } from "./helpers";
import { harness, rejectionCode, uploadProof } from "./helpers";

const ACAD = "acad_confirm_claim";
const OWNER = "u_confirm_owner";
const MANAGER = "u_confirm_manager";
const CASHER = "u_confirm_cash";
const BANKER = "u_confirm_bank";
const CHANGED = "u_confirm_changed";
const RENEWER = "u_confirm_renew";

describe("confirming a claim with a start day and months (ADR 164)", () => {
  let h: Harness;
  let planId: string;
  let cashId: string;
  let bankId: string;

  const owner = () => h.as(OWNER, ACAD);
  const manager = () => h.as(MANAGER, ACAD);
  const held = async (userId: string) => {
    const membership = (await h.as(userId, ACAD).accessPlan.mine())
      .memberships[0];
    if (!membership) throw new Error("no membership");
    return membership;
  };
  const claimOf = async (userId: string) => {
    const assignmentId = (await held(userId)).assignmentId;
    const claim = (await owner().accessPlan.claims()).find(
      (c) => c.assignmentId === assignmentId,
    );
    if (!claim) throw new Error("no claim");
    return claim;
  };
  const choose = async (userId: string) =>
    (await h.as(userId, ACAD).studentPlan.choose({ planId })).assignmentId;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
    h = await harness([
      {
        id: ACAD,
        code: "700164",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: MANAGER, role: "manager", status: "active" },
          { userId: CASHER, role: "student", status: "active" },
          { userId: BANKER, role: "student", status: "active" },
          { userId: CHANGED, role: "student", status: "active" },
          { userId: RENEWER, role: "student", status: "active" },
        ],
      },
    ]);
    await h.exec
      .update(entity)
      .set({ membershipEnforcedAt: new Date() })
      .where(eq(entity.id, ACAD));
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
    cashId = (
      await owner().paymentMethod.save({
        kind: "cash",
        label: "Cash",
        details: "",
        enabled: true,
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
  });

  afterAll(async () => {
    await h.close();
    vi.useRealTimers();
  });

  it("starts from the day they paid when a manager confirms as reported", async () => {
    const assignmentId = await choose(CASHER);
    await h.as(CASHER, ACAD).accessPlan.claimMonth({
      assignmentId,
      methodId: cashId,
      cashPaidTo: OWNER,
      cashPaidOn: "2026-11-12",
    });
    const claim = await claimOf(CASHER);
    expect([
      claim.confirm.startEditable,
      claim.confirm.startsOn,
      claim.confirm.months,
    ]).toEqual([true, "2026-11-12", 1]);

    expect(
      await rejectionCode(
        manager().accessPlan.confirmClaim({
          assignmentId,
          month: claim.month,
          months: 2,
        }),
      ),
    ).toBe("FORBIDDEN");

    await manager().accessPlan.confirmClaim({
      assignmentId,
      month: claim.month,
    });
    const membership = await held(CASHER);
    expect([
      membership.month,
      membership.periodLabel,
      membership.paid,
      membership.paymentDayLabel,
    ]).toEqual(["2026-11-12", "12 Nov to 11 Dec 2026", true, "the 12th"]);
  });

  it("keeps the start when they paid on the day they chose the plan", async () => {
    const assignmentId = await choose(BANKER);
    await h.as(BANKER, ACAD).accessPlan.claimMonth({
      assignmentId,
      methodId: bankId,
      proofFileId: await uploadProof(h, BANKER, ACAD),
    });
    const claim = await claimOf(BANKER);
    expect(claim.confirm.startsOn).toBe("2026-11-15");
    await owner().accessPlan.confirmClaim({ assignmentId, month: claim.month });
    const membership = await held(BANKER);
    expect([membership.month, membership.paid]).toEqual(["2026-11-15", true]);
  });

  it("lets the owner pick the start day and the months", async () => {
    const assignmentId = await choose(CHANGED);
    await h.as(CHANGED, ACAD).accessPlan.claimMonth({
      assignmentId,
      methodId: bankId,
      proofFileId: await uploadProof(h, CHANGED, ACAD),
    });
    const claim = await claimOf(CHANGED);
    for (const startsOn of ["2026-11-16", "2026-10-14"]) {
      expect(
        await rejectionCode(
          owner().accessPlan.confirmClaim({
            assignmentId,
            month: claim.month,
            startsOn,
          }),
        ),
      ).toBe("BAD_REQUEST");
    }

    const done = await owner().accessPlan.confirmClaim({
      assignmentId,
      month: claim.month,
      startsOn: "2026-11-10",
      months: 3,
      reason: "Paid at the front desk",
    });
    expect([done.firstMonth, done.months]).toEqual(["2026-11-10", 3]);
    const membership = await held(CHANGED);
    expect([
      membership.month,
      membership.paid,
      membership.nextPaymentOn,
      membership.paidUntilLabel,
    ]).toEqual(["2026-11-10", true, "2026-12-10", "9 Feb 2027"]);

    const audit = await h.pg.query<{ reason: string | null }>(
      `SELECT reason FROM membership_month_audit WHERE assignment_id = $1 AND event = 'claim_adjusted' AND after_status = 'confirmed'`,
      [assignmentId],
    );
    expect(audit.rows.map((r) => r.reason)).toEqual([
      "Starts 2026-11-10, 3 months, €150.00: Paid at the front desk",
    ]);
  });

  it("changes only the months on a renewal", async () => {
    await h.pg.query(
      `UPDATE access_plan_price SET effective_month = '2026-01-01' WHERE plan_id = $1`,
      [planId],
    );
    const { id: assignmentId } = await owner().accessPlan.assign({
      userId: RENEWER,
      planId,
      startMonth: "2026-09-01",
      startsOn: "2026-09-01",
    });
    for (const month of ["2026-09-01", "2026-10-01"]) {
      await owner().accessPlan.markMonth({ assignmentId, month, paid: true });
    }
    await h.as(RENEWER, ACAD).accessPlan.claimMonth({
      assignmentId,
      methodId: bankId,
      proofFileId: await uploadProof(h, RENEWER, ACAD),
    });
    const claim = await claimOf(RENEWER);
    expect([claim.month, claim.confirm.startEditable]).toEqual([
      "2026-11-01",
      false,
    ]);
    expect(
      await rejectionCode(
        owner().accessPlan.confirmClaim({
          assignmentId,
          month: claim.month,
          startsOn: "2026-11-05",
        }),
      ),
    ).toBe("BAD_REQUEST");

    await owner().accessPlan.confirmClaim({
      assignmentId,
      month: claim.month,
      months: 2,
    });
    const membership = await held(RENEWER);
    expect([
      membership.month,
      membership.paid,
      membership.paidUntilLabel,
    ]).toEqual(["2026-11-01", true, "31 Dec 2026"]);
  });
});
