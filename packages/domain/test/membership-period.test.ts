import { describe, expect, it } from "vitest";

import type { PeriodSchedule } from "../src/membership-period";
import {
  currentPeriod,
  earliestKey,
  formatPeriod,
  isPeriodStart,
  nextPeriod,
  paymentDateProblem,
  paymentDay,
  paymentDayLabel,
  periodLastDay,
  periodOf,
  periodsFrom,
  periodStart,
  runningOn,
} from "../src/membership-period";

const from = (startMonth: string): PeriodSchedule => ({
  startMonth,
  endMonth: null,
  periodAnchor: null,
  periodAnchorFrom: null,
});

describe("periodStart", () => {
  it("counts whole months from the anchor", () => {
    expect(periodStart("2026-11-15", 0)).toBe("2026-11-15");
    expect(periodStart("2026-11-15", 1)).toBe("2026-12-15");
    expect(periodStart("2026-11-15", 2)).toBe("2027-01-15");
    expect(periodStart("2026-11-15", -1)).toBe("2026-10-15");
  });

  it("uses the last day of shorter months and comes back to the 31st", () => {
    expect(periodStart("2027-01-31", 1)).toBe("2027-02-28");
    expect(periodStart("2027-01-31", 2)).toBe("2027-03-31");
    expect(periodStart("2027-01-31", 3)).toBe("2027-04-30");
    expect(periodStart("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("gives calendar months for an anchor on the 1st", () => {
    expect(periodStart("2026-09-01", 3)).toBe("2026-12-01");
    expect(periodStart("2026-09-01", 4)).toBe("2027-01-01");
  });
});

describe("periodOf", () => {
  it("finds the period that holds a day", () => {
    expect(periodOf("2026-12-14", from("2026-11-15"))).toBe("2026-11-15");
    expect(periodOf("2026-12-15", from("2026-11-15"))).toBe("2026-12-15");
    expect(periodOf("2027-03-30", from("2027-01-31"))).toBe("2027-02-28");
    expect(periodOf("2027-03-31", from("2027-01-31"))).toBe("2027-03-31");
    expect(periodOf("2026-09-20", from("2026-01-01"))).toBe("2026-09-01");
  });

  it("knows a real period start", () => {
    expect(isPeriodStart("2027-02-28", from("2027-01-31"))).toBe(true);
    expect(isPeriodStart("2027-02-27", from("2027-01-31"))).toBe(false);
  });
});

describe("a changed payment date", () => {
  const moved: PeriodSchedule = {
    startMonth: "2026-09-15",
    endMonth: null,
    periodAnchor: "2026-12-10",
    periodAnchorFrom: "2026-11-15",
  };

  it("keeps the periods before it", () => {
    expect(periodOf("2026-10-20", moved)).toBe("2026-10-15");
    expect(nextPeriod("2026-10-15", moved)).toBe("2026-11-15");
  });

  it("shortens the period running at the change to end on the new date", () => {
    expect(periodOf("2026-12-09", moved)).toBe("2026-11-15");
    expect(nextPeriod("2026-11-15", moved)).toBe("2026-12-10");
    expect(periodLastDay("2026-11-15", moved)).toBe("2026-12-09");
  });

  it("can also stretch it past its usual end", () => {
    const later = { ...moved, periodAnchor: "2027-01-05" };
    expect(periodOf("2026-12-20", later)).toBe("2026-11-15");
    expect(periodLastDay("2026-11-15", later)).toBe("2027-01-04");
  });

  it("counts from the new date afterwards", () => {
    expect(periodOf("2027-01-09", moved)).toBe("2026-12-10");
    expect(periodsFrom("2026-11-15", moved, 3)).toEqual([
      "2026-11-15",
      "2026-12-10",
      "2027-01-10",
    ]);
    expect(paymentDay(moved)).toBe("2026-12-10");
    expect(paymentDay(from("2026-09-15"))).toBe("2026-09-15");
  });
});

describe("nextPeriod", () => {
  it("steps across a short month and a year end", () => {
    expect(nextPeriod("2027-02-28", from("2027-01-31"))).toBe("2027-03-31");
    expect(nextPeriod("2026-12-15", from("2026-11-15"))).toBe("2027-01-15");
  });
});

describe("periodLastDay", () => {
  it("is the day before the next period, or before the end", () => {
    expect(periodLastDay("2026-11-15", from("2026-11-15"))).toBe("2026-12-14");
    expect(
      periodLastDay("2026-11-15", {
        ...from("2026-11-15"),
        endMonth: "2026-12-01",
      }),
    ).toBe("2026-11-30");
  });
});

describe("currentPeriod and runningOn", () => {
  const ended = { ...from("2026-11-15"), endMonth: "2027-01-10", id: "a" };
  const later = { ...from("2027-02-01"), id: "b" };

  it("is null before the start and from the end", () => {
    expect(currentPeriod("2026-11-14", ended)).toBeNull();
    expect(currentPeriod("2027-01-10", ended)).toBeNull();
    expect(currentPeriod("2027-01-09", ended)).toBe("2026-12-15");
  });

  it("keeps only the rows running that day, with their period", () => {
    expect(
      runningOn("2026-12-20", [ended, later]).map((r) => [r.id, r.month]),
    ).toEqual([["a", "2026-12-15"]]);
  });

  it("finds the earliest key", () => {
    expect(earliestKey(["2026-12-15", "2026-11-15"], "2026-12-20")).toBe(
      "2026-11-15",
    );
    expect(earliestKey([], "2026-12-20")).toBe("2026-12-20");
  });
});

describe("labels", () => {
  it("writes a period and a payment day", () => {
    expect(formatPeriod("2026-11-15", "2026-12-14")).toBe(
      "15 Nov to 14 Dec 2026",
    );
    expect(formatPeriod("2026-12-15", "2027-01-14")).toBe(
      "15 Dec 2026 to 14 Jan 2027",
    );
    expect(paymentDayLabel("2026-11-15")).toBe("the 15th");
    expect(paymentDayLabel("2026-11-02")).toBe("the 2nd");
    expect(paymentDayLabel("2026-10-31")).toBe(
      "the 31st, or the last day of shorter months",
    );
  });
});

describe("paymentDateProblem", () => {
  const ok = {
    nextPaymentOn: "2026-12-10",
    today: "2026-11-20",
    status: "active" as const,
    endMonth: null,
    currentStart: "2026-11-15",
    takenAfterCurrent: [],
    changePending: false,
    declined: false,
  };

  it("accepts any later date", () => {
    expect(paymentDateProblem(ok)).toBeNull();
    expect(
      paymentDateProblem({ ...ok, nextPaymentOn: "2027-03-01" }),
    ).toBeNull();
  });

  it("refuses today, a paused or ended membership, a declined payment and paid ahead", () => {
    expect(paymentDateProblem({ ...ok, nextPaymentOn: "2026-11-20" })).toBe(
      "not_after_today",
    );
    expect(paymentDateProblem({ ...ok, status: "suspended" })).toBe("inactive");
    expect(paymentDateProblem({ ...ok, endMonth: "2027-01-01" })).toBe("ended");
    expect(paymentDateProblem({ ...ok, currentStart: null })).toBe("ended");
    expect(paymentDateProblem({ ...ok, changePending: true })).toBe(
      "change_pending",
    );
    expect(paymentDateProblem({ ...ok, declined: true })).toBe(
      "payment_declined",
    );
    expect(
      paymentDateProblem({ ...ok, takenAfterCurrent: ["2026-12-15"] }),
    ).toBe("paid_ahead");
  });
});
