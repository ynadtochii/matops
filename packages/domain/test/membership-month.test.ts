import { describe, expect, it } from "vitest";

import type { MembershipPolicy } from "../src/membership-month";
import {
  canClaimMonth,
  JOIN_GRACE_DAYS,
  membershipWarning,
  monthAdmits,
  monthOf,
  monthVerdict,
  nextMonth,
  payDeadline,
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

describe("payDeadline for a mid-month join", () => {
  const september = {
    month: "2026-09-01",
    startMonth: "2026-09-01",
    policy: LISBON,
  };

  it("gives a 15 September joiner seven days, to the 22nd", () => {
    expect(
      payDeadline({ ...september, joinedOn: "2026-09-15" }).toISOString(),
    ).toBe("2026-09-21T23:00:00.000Z");
  });

  it("starts October on the 1st with the normal monthly grace", () => {
    const october = payDeadline({
      month: "2026-10-01",
      startMonth: "2026-09-01",
      joinedOn: "2026-09-15",
      policy: LISBON,
    });
    expect(october.toISOString()).toBe("2026-10-07T23:00:00.000Z");
  });

  it("lets a late-month join's window cross into the next month", () => {
    // Joining on 28 September, seven days runs to 5 October. September's
    // deadline moves; October's does not, and gets its own month record.
    const septemberDue = payDeadline({
      ...september,
      joinedOn: "2026-09-28",
    });
    expect(septemberDue.toISOString()).toBe("2026-10-04T23:00:00.000Z");

    const octoberDue = payDeadline({
      month: "2026-10-01",
      startMonth: "2026-09-01",
      joinedOn: "2026-09-28",
      policy: LISBON,
    });
    expect(octoberDue.toISOString()).toBe("2026-10-07T23:00:00.000Z");
    expect(septemberDue.getTime()).toBeLessThan(octoberDue.getTime());
  });

  it("keeps midnight across a daylight-saving change", () => {
    // Lisbon leaves summer time on 25 October 2026. Joining on the 22nd, the
    // window ends on the 29th at local midnight, which is 00:00Z once the
    // clocks have gone back, not 23:00Z the day before.
    expect(
      payDeadline({
        month: "2026-10-01",
        startMonth: "2026-10-01",
        joinedOn: "2026-10-22",
        policy: LISBON,
      }).toISOString(),
    ).toBe("2026-10-29T00:00:00.000Z");
  });

  it("treats a first-of-the-month join as a normal month", () => {
    const asJoin = payDeadline({ ...september, joinedOn: "2026-09-01" });
    const asNormal = payDeadline({ ...september, joinedOn: null });
    expect(asJoin.toISOString()).toBe(asNormal.toISOString());
  });

  it("ignores the join day once the join month has passed", () => {
    const later = payDeadline({
      month: "2026-11-01",
      startMonth: "2026-09-01",
      joinedOn: "2026-09-15",
      policy: LISBON,
    });
    // Midnight on 8 November is 00:00Z: Lisbon is back on winter time by then.
    expect(later.toISOString()).toBe("2026-11-08T00:00:00.000Z");
  });

  it("uses the join grace the constant names", () => {
    expect(JOIN_GRACE_DAYS).toBe(7);
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

  it("admits everything but a blocked month", () => {
    expect(monthAdmits("paid")).toBe(true);
    expect(monthAdmits("within-grace")).toBe(true);
    expect(monthAdmits("blocked")).toBe(false);
  });
});

describe("membershipWarning", () => {
  const base = {
    month: "2026-09-01",
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

  it("reads the month in the organization's own zone", () => {
    const warning = membershipWarning({
      ...base,
      month: "2026-12-01",
      verdict: "within-grace",
    });
    expect(warning?.headline).toContain("December 2026");
  });
});

describe("claiming a month", () => {
  it("takes a claim on an unpaid month nobody has claimed", () => {
    expect(canClaimMonth({ paid: false, claimedAt: null })).toBe(true);
  });

  it("refuses a second claim", () => {
    expect(canClaimMonth({ paid: false, claimedAt: new Date() })).toBe(false);
  });

  it("refuses a claim on a month already ticked paid", () => {
    expect(canClaimMonth({ paid: true, claimedAt: null })).toBe(false);
  });
});
