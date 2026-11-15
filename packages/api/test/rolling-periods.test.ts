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
    const wrong = await owner().accessPlan.changePaymentDate({
      assignmentId: assignment,
      nextPaymentOn: "2026-12-20",
    });
    expect(wrong.paymentDayLabel).toBe("the 20th");
    const done = await owner().accessPlan.changePaymentDate({
      assignmentId: assignment,
      nextPaymentOn: "2026-12-10",
      reason: "Salary day",
    });
    expect(done.paymentDayLabel).toBe("the 10th");

    const held = await mine();
    expect([held.assignmentId, held.periodLabel, held.nextPaymentOn]).toEqual([
      assignment,
      "15 Nov to 9 Dec 2026",
      "2026-12-10",
    ]);

    const rows = await owner().accessPlan.forUser({ userId: STUDENT });
    expect(
      rows.map((r) => [r.id, r.startMonth, r.endMonth, r.paymentDayLabel]),
    ).toEqual([[assignment, START, null, "the 10th"]]);
    expect(rows[0]?.dueDates.map((d) => d.month)).toEqual([
      START,
      "2026-12-10",
      "2027-01-10",
    ]);

    const audit = await h.pg.query<{ event: string; reason: string | null }>(
      `SELECT event, reason FROM membership_month_audit WHERE assignment_id = $1 AND event = 'payment_date_changed' ORDER BY created_at`,
      [assignment],
    );
    expect(audit.rows.map((r) => r.reason)).toEqual([
      "Next payment 2026-12-20",
      "Next payment 2026-12-10: Salary day",
    ]);
  });

  it("moves the due date of a later period", async () => {
    await owner().accessPlan.setDueDate({
      assignmentId: assignment,
      month: "2026-12-10",
      stopsOn: "2026-12-22",
    });
    const rows = await owner().accessPlan.forUser({ userId: STUDENT });
    expect(
      rows[0]?.dueDates.find((d) => d.month === "2026-12-10"),
    ).toMatchObject({ deadlineOn: "2026-12-22", deadlineMoved: true });

    const board = await owner().accessPlan.monthBoard();
    expect(
      board.rows
        .find((r) => r.assignmentId === assignment)
        ?.dueDates.map((d) => [d.month, d.deadlineOn]),
    ).toEqual([
      [START, "2026-11-18"],
      ["2026-12-10", "2026-12-22"],
      ["2027-01-10", "2027-01-17"],
    ]);
  });

  it("renews after the change with the moved due date and no join grace", async () => {
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
      "2026-12-22T00:00:00.000Z",
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

  it("moves the due date of a paid period and shows the next unpaid one", async () => {
    await owner().accessPlan.setDueDate({
      assignmentId: aheadAssignment,
      month: START,
      stopsOn: "2026-11-30",
    });
    const rows = await owner().accessPlan.forUser({ userId: AHEAD });
    expect(
      rows[0]?.dueDates.map((d) => [d.month, d.paid, d.deadlineMoved]),
    ).toEqual([
      [START, true, true],
      ["2026-12-15", true, false],
      ["2027-01-15", true, false],
      ["2027-02-15", false, false],
    ]);
  });

  it("still pauses a membership after the change", async () => {
    await owner().accessPlan.suspend({ id: assignment });
    const rows = await owner().accessPlan.forUser({ userId: STUDENT });
    expect(rows[0]?.status).toBe("suspended");
  });
});
