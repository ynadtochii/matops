import { describe, expect, it } from "vitest";

import {
  canMoveClaimStart,
  claimStartDay,
  claimStartProblem,
} from "../src/claim-confirm";

const schedule = {
  startMonth: "2026-11-15",
  endMonth: null,
  periodAnchor: null,
  periodAnchorFrom: null,
};

describe("claimStartDay", () => {
  it("uses the day they paid, or else the day they said so", () => {
    expect(
      claimStartDay({ cashPaidOn: "2026-11-12", reportedOn: "2026-11-16" }),
    ).toBe("2026-11-12");
    expect(claimStartDay({ cashPaidOn: null, reportedOn: "2026-11-16" })).toBe(
      "2026-11-16",
    );
  });
});

describe("canMoveClaimStart", () => {
  it("allows it only on the first payment of an untouched membership", () => {
    const ok = {
      claimFirstMonth: "2026-11-15",
      schedule,
      anyConfirmed: false,
    };
    expect(canMoveClaimStart(ok)).toBe(true);
    expect(canMoveClaimStart({ ...ok, claimFirstMonth: "2026-12-15" })).toBe(
      false,
    );
    expect(canMoveClaimStart({ ...ok, anyConfirmed: true })).toBe(false);
    expect(
      canMoveClaimStart({
        ...ok,
        schedule: {
          ...schedule,
          periodAnchor: "2026-12-10",
          periodAnchorFrom: "2026-11-15",
        },
      }),
    ).toBe(false);
  });
});

describe("claimStartProblem", () => {
  const ok = {
    startsOn: "2026-11-12",
    today: "2026-11-16",
    reportedOn: "2026-11-16",
  };

  it("accepts a day from a month before the claim up to today", () => {
    expect(claimStartProblem(ok)).toBeNull();
    expect(claimStartProblem({ ...ok, startsOn: "2026-10-16" })).toBeNull();
    expect(claimStartProblem({ ...ok, startsOn: "2026-11-16" })).toBeNull();
  });

  it("refuses a future day and one more than a month before the claim", () => {
    expect(claimStartProblem({ ...ok, startsOn: "2026-11-17" })).toBe(
      "after_today",
    );
    expect(claimStartProblem({ ...ok, startsOn: "2026-10-15" })).toBe(
      "too_early",
    );
  });
});
