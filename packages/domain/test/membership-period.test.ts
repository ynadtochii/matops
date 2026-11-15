import { describe, expect, it } from "vitest";

import {
  currentPeriod,
  formatPeriod,
  isPeriodStart,
  nextPeriod,
  paymentDateProblem,
  paymentDayLabel,
  periodLastDay,
  periodOf,
  periodStart,
} from "../src/membership-period";

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
    expect(periodOf("2026-12-14", "2026-11-15")).toBe("2026-11-15");
    expect(periodOf("2026-12-15", "2026-11-15")).toBe("2026-12-15");
    expect(periodOf("2027-03-30", "2027-01-31")).toBe("2027-02-28");
    expect(periodOf("2027-03-31", "2027-01-31")).toBe("2027-03-31");
    expect(periodOf("2026-09-20", "2026-01-01")).toBe("2026-09-01");
  });

  it("knows a real period start", () => {
    expect(isPeriodStart("2027-02-28", "2027-01-31")).toBe(true);
    expect(isPeriodStart("2027-02-27", "2027-01-31")).toBe(false);
  });
});

describe("nextPeriod", () => {
  it("steps across a short month and a year end", () => {
    expect(nextPeriod("2027-02-28", "2027-01-31")).toBe("2027-03-31");
    expect(nextPeriod("2026-12-15", "2026-11-15")).toBe("2027-01-15");
  });
});

describe("periodLastDay", () => {
  const held = { startMonth: "2026-11-15", endMonth: null };

  it("is the day before the next period", () => {
    expect(periodLastDay("2026-11-15", held)).toBe("2026-12-14");
  });

  it("stops at the end the payment date change wrote", () => {
    expect(
      periodLastDay("2026-11-15", { ...held, endMonth: "2026-12-10" }),
    ).toBe("2026-12-09");
    expect(
      periodLastDay("2026-11-15", { ...held, endMonth: "2027-01-05" }),
    ).toBe("2026-12-14");
  });
});

describe("currentPeriod", () => {
  const held = { startMonth: "2026-11-15", endMonth: "2027-01-10" };

  it("is null before the start and from the end", () => {
    expect(currentPeriod("2026-11-14", held)).toBeNull();
    expect(currentPeriod("2027-01-10", held)).toBeNull();
    expect(currentPeriod("2027-01-09", held)).toBe("2026-12-15");
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
    status: "active",
    endMonth: null,
    currentStart: "2026-11-15",
    takenAfterCurrent: [],
    changePending: false,
    held: false,
  };

  it("accepts any later date", () => {
    expect(paymentDateProblem(ok)).toBeNull();
    expect(
      paymentDateProblem({ ...ok, nextPaymentOn: "2027-03-01" }),
    ).toBeNull();
  });

  it("refuses today, the past, a paused or ended membership and paid ahead", () => {
    expect(paymentDateProblem({ ...ok, nextPaymentOn: "2026-11-20" })).toBe(
      "not_after_today",
    );
    expect(paymentDateProblem({ ...ok, status: "suspended" })).toBe("inactive");
    expect(paymentDateProblem({ ...ok, endMonth: "2027-01-01" })).toBe("ended");
    expect(paymentDateProblem({ ...ok, currentStart: null })).toBe("ended");
    expect(paymentDateProblem({ ...ok, changePending: true })).toBe(
      "change_pending",
    );
    expect(paymentDateProblem({ ...ok, held: true })).toBe("payment_declined");
    expect(
      paymentDateProblem({ ...ok, takenAfterCurrent: ["2026-12-15"] }),
    ).toBe("paid_ahead");
  });
});
