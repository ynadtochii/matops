import { describe, expect, it } from "vitest";

import {
  bookingAccess,
  bookingAccessMessage,
  canClaim,
  claimDedupeKey,
  DUE_SOON_DAYS,
  firstDueAt,
  paymentPeriod,
  paymentReference,
  paymentStatus,
  rollNextDue,
} from "../src/payments";

describe("paymentStatus", () => {
  const today = new Date("2026-07-15T12:00:00Z");

  it("is paid when due further out than the due-soon window", () => {
    expect(paymentStatus(new Date("2026-07-19T00:00:00Z"), today)).toBe("paid");
    expect(paymentStatus(new Date("2026-08-15T00:00:00Z"), today)).toBe("paid");
  });

  it("is due_soon exactly on the due day", () => {
    expect(paymentStatus(new Date("2026-07-15T23:59:00Z"), today)).toBe(
      "due_soon",
    );
  });

  it("is due_soon on the last day of the window", () => {
    // today + DUE_SOON_DAYS is still due_soon...
    expect(paymentStatus(new Date("2026-07-18T00:00:00Z"), today)).toBe(
      "due_soon",
    );
    // ...one day further out is paid.
    expect(paymentStatus(new Date("2026-07-19T00:00:00Z"), today)).toBe("paid");
    expect(DUE_SOON_DAYS).toBe(3);
  });

  it("is overdue the day after the due date", () => {
    expect(paymentStatus(new Date("2026-07-14T23:59:00Z"), today)).toBe(
      "overdue",
    );
    expect(paymentStatus(new Date("2026-06-15T00:00:00Z"), today)).toBe(
      "overdue",
    );
  });

  it("compares by whole calendar day, ignoring time of day", () => {
    // Due earlier in the same UTC day as `today` (00:01 vs 12:00) is not overdue.
    expect(paymentStatus(new Date("2026-07-15T00:01:00Z"), today)).toBe(
      "due_soon",
    );
  });
});

describe("rollNextDue", () => {
  it("adds one month, keeping the day-of-month anchor", () => {
    expect(rollNextDue(new Date("2026-07-10T00:00:00Z"), "monthly")).toEqual(
      new Date("2026-08-10T00:00:00Z"),
    );
  });

  it("rolls from the current due date, not from today (stays anchored)", () => {
    // A member due on the 1st stays due on the 1st after a late confirm.
    expect(rollNextDue(new Date("2026-01-01T00:00:00Z"), "monthly")).toEqual(
      new Date("2026-02-01T00:00:00Z"),
    );
  });

  it("clamps to the last day of a shorter month (Jan 31 → Feb 28)", () => {
    expect(rollNextDue(new Date("2026-01-31T00:00:00Z"), "monthly")).toEqual(
      new Date("2026-02-28T00:00:00Z"),
    );
  });
});

describe("paymentPeriod", () => {
  it("formats YYYY-MM in UTC, zero-padded", () => {
    expect(paymentPeriod(new Date("2026-07-15T00:00:00Z"))).toBe("2026-07");
    expect(paymentPeriod(new Date("2026-12-01T00:00:00Z"))).toBe("2026-12");
    expect(paymentPeriod(new Date("2026-01-31T00:00:00Z"))).toBe("2026-01");
  });
});

describe("claimDedupeKey", () => {
  it("is one key per member per period", () => {
    expect(claimDedupeKey("m1", "2026-07")).toBe("m1:2026-07");
    expect(claimDedupeKey("m1", "2026-07")).toBe(
      claimDedupeKey("m1", "2026-07"),
    );
    expect(claimDedupeKey("m1", "2026-08")).not.toBe(
      claimDedupeKey("m1", "2026-07"),
    );
    expect(claimDedupeKey("m2", "2026-07")).not.toBe(
      claimDedupeKey("m1", "2026-07"),
    );
  });
});

describe("paymentReference", () => {
  it("upper-cases the name and appends a short id tail", () => {
    expect(paymentReference("Sam Lee", "abcd5t6u")).toBe("SAM LEE 5T6U");
  });

  it("collapses whitespace and strips non-alphanumerics from the id", () => {
    expect(paymentReference("  Ann   Marie  ", "id-99-ZzZz")).toBe(
      "ANN MARIE ZZZZ",
    );
  });

  it("is stable for the same inputs (owner can match it)", () => {
    expect(paymentReference("Bo", "xyz")).toBe(paymentReference("Bo", "xyz"));
  });

  it("handles an empty name", () => {
    expect(paymentReference("", "member1234")).toBe("1234");
  });
});

describe("canClaim", () => {
  it("allows a claim when dues are set up and no claim is open", () => {
    expect(canClaim({ hasPlan: true, hasOpenClaim: false })).toBe(true);
  });

  it("blocks a second claim while one is already open (idempotent)", () => {
    expect(canClaim({ hasPlan: true, hasOpenClaim: true })).toBe(false);
  });

  it("blocks a claim when the member has no plan/dues set", () => {
    expect(canClaim({ hasPlan: false, hasOpenClaim: false })).toBe(false);
  });
});

describe("firstDueAt", () => {
  it("is the 1st of the next month at UTC midnight", () => {
    expect(firstDueAt(new Date("2026-07-15T18:30:00Z"))).toEqual(
      new Date("2026-08-01T00:00:00Z"),
    );
  });

  it("rolls the year over from December", () => {
    expect(firstDueAt(new Date("2026-12-31T23:59:00Z"))).toEqual(
      new Date("2027-01-01T00:00:00Z"),
    );
  });

  it("joining on the 1st still starts the following month", () => {
    expect(firstDueAt(new Date("2026-07-01T00:00:00Z"))).toEqual(
      new Date("2026-08-01T00:00:00Z"),
    );
  });

  it("keeps later rolls anchored on the 1st", () => {
    const first = firstDueAt(new Date("2026-07-15T12:00:00Z"));
    expect(rollNextDue(first, "monthly")).toEqual(
      new Date("2026-09-01T00:00:00Z"),
    );
  });
});

describe("bookingAccess", () => {
  const today = new Date("2026-07-15T12:00:00Z");
  const base = {
    enforcedAt: new Date("2026-01-01T00:00:00Z"),
    graceDays: 7,
    memberSince: new Date("2026-01-10T00:00:00Z"),
    hasOpenClaim: false,
  };

  it("is ok whenever enforcement is off", () => {
    for (const enforcedAt of [null, undefined]) {
      expect(
        bookingAccess(
          { ...base, enforcedAt, nextDueAt: new Date("2020-01-01T00:00:00Z") },
          today,
        ),
      ).toEqual({ state: "ok", reason: null, daysUntilLock: null });
    }
  });

  it("an open claim unblocks immediately, even deep past the grace window", () => {
    expect(
      bookingAccess(
        {
          ...base,
          hasOpenClaim: true,
          nextDueAt: new Date("2026-01-01T00:00:00Z"),
        },
        today,
      ).state,
    ).toBe("ok");
  });

  it("is ok up to and including the due day", () => {
    expect(
      bookingAccess(
        { ...base, nextDueAt: new Date("2026-08-01T00:00:00Z") },
        today,
      ).state,
    ).toBe("ok");
    expect(
      bookingAccess(
        { ...base, nextDueAt: new Date("2026-07-15T00:00:00Z") },
        today,
      ).state,
    ).toBe("ok");
  });

  it("enters grace the day after the due day, counting down to the lock", () => {
    const access = bookingAccess(
      { ...base, nextDueAt: new Date("2026-07-14T00:00:00Z") },
      today,
    );
    expect(access).toEqual({
      state: "grace",
      reason: "unpaid",
      daysUntilLock: 7,
    });
  });

  it("still books on the last grace day, locks the day after", () => {
    const lastDay = bookingAccess(
      { ...base, nextDueAt: new Date("2026-07-08T00:00:00Z") },
      today,
    );
    expect(lastDay).toEqual({
      state: "grace",
      reason: "unpaid",
      daysUntilLock: 1,
    });
    const locked = bookingAccess(
      { ...base, nextDueAt: new Date("2026-07-07T00:00:00Z") },
      today,
    );
    expect(locked).toEqual({
      state: "locked",
      reason: "unpaid",
      daysUntilLock: null,
    });
  });

  it("grace 0 allows the due day only", () => {
    expect(
      bookingAccess(
        {
          ...base,
          graceDays: 0,
          nextDueAt: new Date("2026-07-15T00:00:00Z"),
        },
        today,
      ).state,
    ).toBe("ok");
    expect(
      bookingAccess(
        {
          ...base,
          graceDays: 0,
          nextDueAt: new Date("2026-07-14T00:00:00Z"),
        },
        today,
      ).state,
    ).toBe("locked");
  });

  it("no plan: a fresh member books through the grace window from joining", () => {
    const access = bookingAccess(
      {
        ...base,
        memberSince: new Date("2026-07-15T09:00:00Z"),
        nextDueAt: null,
      },
      today,
    );
    expect(access).toEqual({
      state: "no_plan",
      reason: "no_plan",
      daysUntilLock: 8,
    });
  });

  it("no plan: locks once the window from joining runs out", () => {
    expect(
      bookingAccess(
        {
          ...base,
          memberSince: new Date("2026-07-07T00:00:00Z"),
          nextDueAt: null,
        },
        today,
      ),
    ).toEqual({ state: "locked", reason: "no_plan", daysUntilLock: null });
  });

  it("no plan: turning enforcement on grants the full window to an old member", () => {
    const access = bookingAccess(
      {
        ...base,
        enforcedAt: new Date("2026-07-14T00:00:00Z"),
        memberSince: new Date("2025-01-01T00:00:00Z"),
        nextDueAt: null,
      },
      today,
    );
    expect(access).toEqual({
      state: "no_plan",
      reason: "no_plan",
      daysUntilLock: 7,
    });
  });
});

describe("bookingAccessMessage", () => {
  it("says nothing while access is ok", () => {
    expect(
      bookingAccessMessage({ state: "ok", reason: null, daysUntilLock: null }),
    ).toBeNull();
  });

  it("counts down in days and says tomorrow on the last day", () => {
    expect(
      bookingAccessMessage({
        state: "grace",
        reason: "unpaid",
        daysUntilLock: 3,
      }),
    ).toBe(
      "Payment overdue. Booking locks in 3 days. Pay and claim to keep booking.",
    );
    expect(
      bookingAccessMessage({
        state: "no_plan",
        reason: "no_plan",
        daysUntilLock: 1,
      }),
    ).toBe("Choose your membership. Booking locks tomorrow.");
  });

  it("names the fix for each locked reason", () => {
    expect(
      bookingAccessMessage({
        state: "locked",
        reason: "unpaid",
        daysUntilLock: null,
      }),
    ).toBe("Booking is locked. Pay and claim your payment to book again.");
    expect(
      bookingAccessMessage({
        state: "locked",
        reason: "no_plan",
        daysUntilLock: null,
      }),
    ).toBe("Booking is locked. Choose your membership to book again.");
  });
});
