import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Harness } from "./helpers";
import { harness, rejectionCode } from "./helpers";

const ACAD = "acad_rolling";
const OWNER = "u_rolling_owner";
const MANAGER = "u_rolling_manager";
const STUDENT = "u_rolling_student";
const AHEAD = "u_rolling_ahead";
const START = "2026-11-15";

describe("rolling membership periods (ADR 163)", () => {
  let h: Harness;
  let planId: string;
  let assignment: string;
  let aheadAssignment: string;

  const owner = () => h.as(OWNER, ACAD);
  const manager = () => h.as(MANAGER, ACAD);
  const student = () => h.as(STUDENT, ACAD);
  const mine = async () => {
    const held = (await student().accessPlan.mine()).memberships[0];
    if (!held) throw new Error("no membership");
    return held;
  };

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T12:00:00Z"));
    h = await harness([
      {
        id: ACAD,
        code: "700163",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: MANAGER, role: "manager", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
          { userId: AHEAD, role: "student", status: "active" },
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
    assignment = (
      await owner().accessPlan.assign({
        userId: STUDENT,
        planId,
        startsOn: START,
      })
    ).id;
    aheadAssignment = (
      await owner().accessPlan.assign({
        userId: AHEAD,
        planId,
        startsOn: START,
      })
    ).id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await h.close();
  });

  it("counts the period from the start day", async () => {
    const held = await mine();
    expect([
      held.month,
      held.periodLabel,
      held.nextPaymentOn,
      held.paymentDayLabel,
    ]).toEqual([
      "2026-11-15",
      "15 Nov to 14 Dec 2026",
      "2026-12-15",
      "the 15th",
    ]);
  });

  it("gives a new member three days to pay", async () => {
    const held = await mine();
    expect(held.deadline.toISOString()).toBe("2026-11-18T00:00:00.000Z");
  });

  it("refuses a date that is not one of the membership's periods", async () => {
    expect(
      await rejectionCode(
        owner().accessPlan.markMonth({
          assignmentId: assignment,
          month: "2026-11-01",
          paid: true,
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("lets only the owner move a due date", async () => {
    expect(
      await rejectionCode(
        manager().accessPlan.setDueDate({
          assignmentId: assignment,
          month: START,
          stopsOn: "2026-11-25",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("moves the due date and puts it back", async () => {
    await owner().accessPlan.setDueDate({
      assignmentId: assignment,
      month: START,
      stopsOn: "2026-11-25",
      reason: "Paying on payday",
    });
    const moved = await mine();
    expect([moved.deadline.toISOString(), moved.deadlineMoved]).toEqual([
      "2026-11-25T00:00:00.000Z",
      true,
    ]);

    await owner().accessPlan.setDueDate({
      assignmentId: assignment,
      month: START,
      stopsOn: null,
    });
    const reset = await mine();
    expect([reset.deadline.toISOString(), reset.deadlineMoved]).toEqual([
      "2026-11-18T00:00:00.000Z",
      false,
    ]);

    const audit = await h.pg.query<{ event: string; reason: string | null }>(
      `SELECT event, reason FROM membership_month_audit WHERE assignment_id = $1 ORDER BY created_at`,
      [assignment],
    );
    expect(audit.rows.map((r) => [r.event, r.reason])).toEqual([
      ["due_date_changed", "Paying on payday"],
      ["due_date_reset", null],
    ]);
  });

  it("lets only the owner change the payment date, and never to today", async () => {
    expect(
      await rejectionCode(
        manager().accessPlan.changePaymentDate({
          assignmentId: assignment,
          nextPaymentOn: "2026-12-10",
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await rejectionCode(
        owner().accessPlan.changePaymentDate({
          assignmentId: assignment,
          nextPaymentOn: "2026-11-20",
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("shortens the current period and starts the new payment day", async () => {
    const done = await owner().accessPlan.changePaymentDate({
      assignmentId: assignment,
      nextPaymentOn: "2026-12-10",
    });
    expect(done.paymentDayLabel).toBe("the 10th");

    const held = await mine();
    expect([held.assignmentId, held.periodLabel, held.nextPaymentOn]).toEqual([
      assignment,
      "15 Nov to 9 Dec 2026",
      "2026-12-10",
    ]);

    const rows = await owner().accessPlan.forUser({ userId: STUDENT });
    expect(rows.map((r) => [r.startMonth, r.endMonth]).sort()).toEqual([
      ["2026-11-15", "2026-12-10"],
      ["2026-12-10", null],
    ]);

    expect(
      await rejectionCode(
        owner().accessPlan.changePaymentDate({
          assignmentId: assignment,
          nextPaymentOn: "2026-12-20",
        }),
      ),
    ).toBe("CONFLICT");
  });

  it("renews the first period after the change with the usual grace", async () => {
    vi.setSystemTime(new Date("2026-12-12T12:00:00Z"));
    const held = await mine();
    expect([
      held.month,
      held.periodLabel,
      held.deadline.toISOString(),
      held.firstMonth,
    ]).toEqual([
      "2026-12-10",
      "10 Dec 2026 to 9 Jan 2027",
      "2026-12-17T00:00:00.000Z",
      false,
    ]);
    vi.setSystemTime(new Date("2026-11-20T12:00:00Z"));
  });

  it("refuses to move the date over months paid ahead", async () => {
    await owner().accessPlan.recordPurchase({
      assignmentId: aheadAssignment,
      months: 3,
    });
    expect(
      await rejectionCode(
        owner().accessPlan.changePaymentDate({
          assignmentId: aheadAssignment,
          nextPaymentOn: "2026-12-01",
        }),
      ),
    ).toBe("CONFLICT");
  });
});
