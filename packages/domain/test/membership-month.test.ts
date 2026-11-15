import { describe, expect, it } from "vitest";

import type { MembershipPolicy } from "../src/membership-month";
import {
  JOIN_GRACE_DAYS,
  membershipWarning,
  monthOf,
  monthVerdict,
  nextMonth,
  payDeadline,
  upcomingDueDates,
} from "../src/membership-month";

const LISBON: MembershipPolicy = { graceDays: 7, timeZone: "Europe/Lisbon" };
const KYIV: MembershipPolicy = { graceDays: 7, timeZone: "Europe/Kyiv" };

describe("monthOf", () => {
  it("reads the month in the organization's own zone", () => {
    // 22:30 UTC on 31 August is already 1 September in Kyiv (UTC+3).
    const instant = new Date("2026-08-31T22:30:00Z");
    expect(monthOf(instant, "Europe/Kyiv")).toBe("2026-09-01");
    expect(monthOf(instant, "Europe/Lisbon")).toBe("2026-08-01");
  });
});

describe("nextMonth", () => {
  it("steps one month, and over the end of a year", () => {
    expect(nextMonth("2026-09-01")).toBe("2026-10-01");
    expect(nextMonth("2026-12-01")).toBe("2027-01-01");
  });
});

describe("payDeadline for a normal month", () => {
  const normal = { month: "2026-09-01", startMonth: "2026-08-01" };

  it("stops on the 8th at local midnight with seven grace days", () => {
    expect(payDeadline({ ...normal, policy: LISBON }).toISOString()).toBe(
      "2026-09-07T23:00:00.000Z",
    );
    expect(payDeadline({ ...normal, policy: KYIV }).toISOString()).toBe(
      "2026-09-07T21:00:00.000Z",
    );
  });

  it("follows the owner's own grace days", () => {
    const strict = payDeadline({
      ...normal,
      policy: { ...LISBON, graceDays: 0 },
    });
    const generous = payDeadline({
      ...normal,
      policy: { ...LISBON, graceDays: 14 },
    });
    expect(strict.toISOString()).toBe("2026-08-31T23:00:00.000Z");
    expect(generous.toISOString()).toBe("2026-09-14T23:00:00.000Z");
  });

  it("admits the 1st to the 7th and blocks the 8th", () => {
    const at = (iso: string) =>
      monthVerdict({ ...normal, policy: LISBON, now: new Date(iso) });
    expect(at("2026-09-01T00:00:00Z")).toBe("within-grace");
    // 23:59 local on the 7th, the last minute that is in time.
    expect(at("2026-09-07T22:59:00Z")).toBe("within-grace");
    // Midnight local on the 8th.
    expect(at("2026-09-07T23:00:00Z")).toBe("blocked");
  });
});

describe("payDeadline for a new membership", () => {
  const joined = {
    month: "2026-09-15",
    startMonth: "2026-09-15",
    joinedOn: "2026-09-15",
    policy: LISBON,
  };

  it("gives a 15 September joiner three days, to the 18th", () => {
    expect(payDeadline(joined).toISOString()).toBe("2026-09-17T23:00:00.000Z");
  });

  it("gives the next period its start plus the owner's grace days", () => {
    expect(payDeadline({ ...joined, month: "2026-10-15" }).toISOString()).toBe(
      "2026-10-21T23:00:00.000Z",
    );
  });

  it("counts a calendar membership's mid-month join from the join day", () => {
    expect(
      payDeadline({
        month: "2026-09-01",
        startMonth: "2026-09-01",
        joinedOn: "2026-09-28",
        policy: LISBON,
      }).toISOString(),
    ).toBe("2026-09-30T23:00:00.000Z");
  });

  it("renews the first period of a continuation", () => {
    expect(
      payDeadline({
        month: "2026-12-10",
        startMonth: "2026-12-10",
        joinedOn: "2026-09-15",
        policy: LISBON,
      }).toISOString(),
    ).toBe("2026-12-17T00:00:00.000Z");
  });

  it("keeps midnight across a daylight-saving change", () => {
    expect(
      payDeadline({
        month: "2026-10-24",
        startMonth: "2026-10-24",
        joinedOn: "2026-10-24",
        policy: LISBON,
      }).toISOString(),
    ).toBe("2026-10-27T00:00:00.000Z");
  });

  it("uses the join grace the constant names", () => {
    expect(JOIN_GRACE_DAYS).toBe(3);
  });
});

describe("monthVerdict", () => {
  const month = {
    month: "2026-09-01",
    startMonth: "2026-08-01",
    policy: LISBON,
  };

  it("says paid whatever the clock says", () => {
    expect(
      monthVerdict({
        ...month,
        paid: true,
        now: new Date("2027-01-01T00:00:00Z"),
      }),
    ).toBe("paid");
  });

  it("treats a missing record as unpaid, never as paid", () => {
    const late = new Date("2026-09-20T00:00:00Z");
    expect(monthVerdict({ ...month, now: late })).toBe("blocked");
    expect(monthVerdict({ ...month, paid: null, now: late })).toBe("blocked");
    expect(monthVerdict({ ...month, paid: false, now: late })).toBe("blocked");
  });
});

describe("membershipWarning", () => {
  const base = {
    periodLabel: "September 2026",
    deadline: new Date("2026-09-07T23:00:00Z"),
    planName: "BJJ + Gym",
    timeZone: "Europe/Lisbon",
  };

  it("says nothing at all about a paid month", () => {
    expect(membershipWarning({ ...base, verdict: "paid" })).toBeNull();
  });

  it("names the month, the plan and the day access stops", () => {
    const warning = membershipWarning({ ...base, verdict: "within-grace" });
    expect(warning?.headline).toBe(
      "September 2026 is not paid yet on BJJ + Gym.",
    );
    // The deadline is the first moment too late, so the text names the 8th.
    // Matched loosely: en-GB abbreviates September as "Sep" or "Sept"
    // depending on the ICU build, and the day is what this test is about.
    expect(warning?.detail).toMatch(/Tue 8 Sept?/);
    expect(warning?.detail).toContain("cancelled");
  });

  it("still explains itself once booking has closed", () => {
    const warning = membershipWarning({ ...base, verdict: "blocked" });
    expect(warning?.verdict).toBe("blocked");
    expect(warning?.headline).toContain("unpaid");
    expect(warning?.detail).toMatch(/Tue 8 Sept?/);
  });

  it("names the period it is given", () => {
    const warning = membershipWarning({
      ...base,
      periodLabel: "15 Dec to 14 Jan 2027",
      verdict: "within-grace",
    });
    expect(warning?.headline).toContain("15 Dec to 14 Jan 2027");
  });
});

describe("upcomingDueDates", () => {
  const UTC: MembershipPolicy = { graceDays: 8, timeZone: "UTC" };
  const schedule = {
    startMonth: "2026-09-01",
    startsOn: "2026-09-01",
    endMonth: null,
    periodAnchor: null,
    periodAnchorFrom: null,
  };
  const paid = (month: string) => ({
    month,
    status: "confirmed",
    deadline: null,
  });

  it("lists the current period and the next two", () => {
    expect(
      upcomingDueDates({
        current: "2026-11-01",
        schedule,
        recorded: [],
        policy: UTC,
      }),
    ).toEqual([
      {
        month: "2026-11-01",
        label: "1 Nov to 30 Nov 2026",
        deadlineOn: "2026-11-09",
        deadlineMoved: false,
        paid: false,
      },
      {
        month: "2026-12-01",
        label: "1 Dec to 31 Dec 2026",
        deadlineOn: "2026-12-09",
        deadlineMoved: false,
        paid: false,
      },
      {
        month: "2027-01-01",
        label: "1 Jan to 31 Jan 2027",
        deadlineOn: "2027-01-09",
        deadlineMoved: false,
        paid: false,
      },
    ]);
  });

  it("keeps paid periods and goes on to the first unpaid one", () => {
    const dates = upcomingDueDates({
      current: "2026-11-01",
      schedule,
      recorded: [
        paid("2026-11-01"),
        paid("2026-12-01"),
        paid("2027-01-01"),
        {
          month: "2027-02-01",
          status: "unpaid",
          deadline: new Date("2027-02-20T00:00:00Z"),
        },
      ],
      policy: UTC,
    });
    expect(
      dates.map((d) => [d.month, d.paid, d.deadlineOn, d.deadlineMoved]),
    ).toEqual([
      ["2026-11-01", true, "2026-11-09", false],
      ["2026-12-01", true, "2026-12-09", false],
      ["2027-01-01", true, "2027-01-09", false],
      ["2027-02-01", false, "2027-02-20", true],
    ]);
  });

  it("stops at the end of the membership", () => {
    expect(
      upcomingDueDates({
        current: "2026-11-01",
        schedule: { ...schedule, endMonth: "2027-01-01" },
        recorded: [],
        policy: UTC,
      }).map((d) => d.month),
    ).toEqual(["2026-11-01", "2026-12-01"]);
  });
});
