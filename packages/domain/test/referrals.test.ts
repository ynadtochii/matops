import { describe, expect, it } from "vitest";

import {
  academyMonthKey,
  canInitiallyAssignReferral,
  groupMoneyByCurrency,
  isEligibleReferrer,
  isReferralStudent,
  isStudentMembership,
  isValidReferralPair,
} from "../src/referrals";

const membership = (
  memberId: string,
  role: string,
  status: string,
  invitedRole: string | null = null,
) => ({ memberId, role, status, invitedRole });

describe("referral membership eligibility", () => {
  it("accepts pending, active, and suspended students as targets", () => {
    expect(
      isReferralStudent(membership("p", "member", "pending", "student")),
    ).toBe(true);
    expect(isReferralStudent(membership("a", "student", "active"))).toBe(true);
    expect(isReferralStudent(membership("s", "student", "suspended"))).toBe(
      true,
    );
  });

  it("keeps removed students identifiable for history but not assignable", () => {
    const removed = membership("r", "student", "removed");
    expect(isStudentMembership(removed)).toBe(true);
    expect(isReferralStudent(removed)).toBe(false);
  });

  it("does not treat staff or pending instructors as student targets", () => {
    expect(isReferralStudent(membership("o", "owner", "active"))).toBe(false);
    expect(
      isReferralStudent(membership("i", "member", "pending", "instructor")),
    ).toBe(false);
  });

  it("allows retained members of every role and status to be referrers", () => {
    expect(isEligibleReferrer(membership("student", "student", "active"))).toBe(
      true,
    );
    expect(isEligibleReferrer(membership("owner", "owner", "active"))).toBe(
      true,
    );
    expect(
      isEligibleReferrer(membership("removed", "student", "removed")),
    ).toBe(true);
  });
});

describe("referral assignment rules", () => {
  it("rejects self-referral", () => {
    expect(isValidReferralPair("member-1", "member-1")).toBe(false);
    expect(isValidReferralPair("member-1", "member-2")).toBe(true);
  });

  it("permits initial assignment only before a state row exists", () => {
    expect(canInitiallyAssignReferral(false)).toBe(true);
    expect(canInitiallyAssignReferral(true)).toBe(false);
  });
});

describe("groupMoneyByCurrency", () => {
  it("groups and sorts totals without combining currencies", () => {
    expect(
      groupMoneyByCurrency([
        { amountMinor: 5000, currency: "usd" },
        { amountMinor: 3500, currency: "EUR" },
        { amountMinor: 2000, currency: "USD" },
      ]),
    ).toEqual([
      { amountMinor: 3500, currency: "EUR" },
      { amountMinor: 7000, currency: "USD" },
    ]);
  });

  it("returns an empty list when no payments are confirmed", () => {
    expect(groupMoneyByCurrency([])).toEqual([]);
  });
});

describe("academyMonthKey", () => {
  it("uses the academy calendar rather than UTC", () => {
    const instant = new Date("2026-08-01T00:30:00Z");
    expect(academyMonthKey(instant, "Europe/Lisbon")).toBe("2026-08");
    expect(academyMonthKey(instant, "America/Los_Angeles")).toBe("2026-07");
  });
});
