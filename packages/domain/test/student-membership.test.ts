import { describe, expect, it } from "vitest";

import type { BannerMembership, PlanOffer } from "../src/student-membership";
import {
  canSwapChosenPlan,
  cashPaidOnEarliest,
  cashPaidOnProblem,
  choosablePlans,
  membershipBanner,
  membershipBannerText,
} from "../src/student-membership";

const MAT = "e_mat";
const NOW = new Date("2026-11-03T10:00:00Z");
const LATER = new Date("2026-11-08T00:00:00Z");

const offer = (over: Partial<PlanOffer> & { id: string }): PlanOffer => ({
  archived: false,
  staffOnly: false,
  entityIds: [MAT],
  amount: { priceMinor: 5000, currency: "EUR" },
  cardLink: true,
  waysToPay: 1,
  ...over,
});

describe("choosablePlans", () => {
  it("offers priced, open plans for this academy, cheapest first", () => {
    const plans = [
      offer({ id: "unlimited", amount: { priceMinor: 6500, currency: "EUR" } }),
      offer({ id: "eight" }),
      offer({ id: "family", staffOnly: true }),
      offer({ id: "old", archived: true }),
      offer({ id: "elsewhere", entityIds: ["e_gym"] }),
      offer({ id: "unpriced", amount: null }),
      offer({ id: "free", amount: { priceMinor: 0, currency: "EUR" } }),
    ];
    expect(choosablePlans(plans, { entityId: MAT }).map((p) => p.id)).toEqual([
      "eight",
      "unlimited",
    ]);
  });

  it("needs a card link or a way to pay that is on for the plan", () => {
    const plans = [
      offer({ id: "card", waysToPay: 0 }),
      offer({ id: "cash", cardLink: false, waysToPay: 1 }),
      offer({ id: "none", cardLink: false, waysToPay: 0 }),
    ];
    expect(
      choosablePlans(plans, { entityId: MAT })
        .map((p) => p.id)
        .sort(),
    ).toEqual(["card", "cash"]);
  });
});

const held = (over: Partial<BannerMembership> = {}): BannerMembership => ({
  assignmentId: "a1",
  planName: "Unlimited",
  status: "active",
  covers: true,
  paymentRequired: true,
  paymentStatus: "unpaid",
  held: false,
  awaitingStaff: false,
  firstMonth: true,
  deadline: NOW,
  ...over,
});

const banner = (
  memberships: BannerMembership[],
  over: Partial<Parameters<typeof membershipBanner>[0]> = {},
) =>
  membershipBanner({
    paymentsOn: true,
    activeStudent: true,
    memberships,
    choosable: 2,
    now: NOW,
    ...over,
  })?.kind ?? null;

describe("membershipBanner", () => {
  it("says nothing while payments are off or the student is not approved", () => {
    expect(banner([], { paymentsOn: false })).toBeNull();
    expect(banner([], { activeStudent: false })).toBeNull();
  });

  it("asks a student with no plan to choose one", () => {
    expect(banner([])).toBe("choose_plan");
    expect(banner([held({ covers: false })])).toBe("choose_plan");
    expect(banner([held({ status: "cancelled" })])).toBe("choose_plan");
    expect(banner([], { choosable: 0 })).toBe("no_plans");
  });

  it("tells a student with a paused plan to ask the gym", () => {
    expect(banner([held({ status: "suspended" })])).toBe("paused");
    expect(banner([held({ status: "suspended", covers: false })])).toBe(
      "choose_plan",
    );
    expect(
      banner([
        held({ status: "suspended" }),
        held({ assignmentId: "a2", paymentStatus: "confirmed" }),
      ]),
    ).toBeNull();
  });

  it("asks to finish paying a chosen plan", () => {
    expect(banner([held()])).toBe("finish_payment");
  });

  it("names a payment waiting for staff", () => {
    expect(banner([held({ paymentStatus: "reported" })])).toBe("waiting_check");
    expect(
      banner([held({ paymentStatus: "reported", awaitingStaff: true })]),
    ).toBe("waiting_cash");
    expect(
      banner([
        held({
          paymentStatus: "reported",
          awaitingStaff: true,
          firstMonth: false,
          deadline: LATER,
        }),
      ]),
    ).toBe("waiting_check");
  });

  it("names a declined payment", () => {
    expect(banner([held({ paymentStatus: "rejected" })])).toBe("rejected");
    expect(banner([held({ held: true })])).toBe("rejected");
  });

  it("warns about a renewal in and after the grace days", () => {
    expect(banner([held({ firstMonth: false, deadline: LATER })])).toBe(
      "renew_due",
    );
    expect(banner([held({ firstMonth: false })])).toBe("renew_overdue");
  });

  it("is quiet when the month is paid or free", () => {
    expect(banner([held({ paymentStatus: "confirmed" })])).toBeNull();
    expect(banner([held({ paymentRequired: false })])).toBeNull();
    expect(
      banner([
        held(),
        held({ assignmentId: "a2", paymentStatus: "confirmed" }),
      ]),
    ).toBeNull();
  });
});

describe("canSwapChosenPlan", () => {
  const chosen = {
    chosenBySelf: true,
    firstMonth: true,
    paymentStatus: "unpaid" as const,
    referenced: false,
  };

  it("lets a student swap only an unpaid plan they chose this month", () => {
    expect(canSwapChosenPlan(chosen)).toBe(true);
    expect(canSwapChosenPlan({ ...chosen, chosenBySelf: false })).toBe(false);
    expect(canSwapChosenPlan({ ...chosen, firstMonth: false })).toBe(false);
    expect(canSwapChosenPlan({ ...chosen, paymentStatus: "reported" })).toBe(
      false,
    );
    expect(canSwapChosenPlan({ ...chosen, referenced: true })).toBe(false);
  });
});

describe("membershipBannerText", () => {
  it("names the plan and whether booking is blocked", () => {
    expect(
      membershipBannerText(
        { kind: "finish_payment", planName: "Unlimited", assignmentId: "a1" },
        "Europe/Lisbon",
      ),
    ).toEqual({
      text: "Finish paying for Unlimited to book classes.",
      blocking: true,
      action: "Pay now",
    });
    expect(
      membershipBannerText(
        {
          kind: "renew_due",
          planName: "Unlimited",
          assignmentId: "a1",
          deadline: LATER,
        },
        "Europe/Lisbon",
      ),
    ).toMatchObject({ blocking: false, action: "Pay now" });
    expect(
      membershipBannerText({ kind: "no_plans" }, "Europe/Lisbon").action,
    ).toBeNull();
  });
});

describe("cashPaidOnProblem", () => {
  it("accepts today and recent days", () => {
    expect(cashPaidOnProblem("2026-11-03", "2026-11-03")).toBeNull();
    expect(cashPaidOnProblem("2026-09-02", "2026-11-03")).toBeNull();
  });

  it("refuses a day after today", () => {
    expect(cashPaidOnProblem("2026-11-04", "2026-11-03")).toBe("future");
  });

  it("refuses a day more than 62 days ago", () => {
    expect(cashPaidOnProblem("2026-09-01", "2026-11-03")).toBe("too_old");
  });

  it("gives the earliest day the rule accepts", () => {
    const earliest = cashPaidOnEarliest("2026-11-03");
    expect(earliest).toBe("2026-09-02");
    expect(cashPaidOnProblem(earliest, "2026-11-03")).toBeNull();
  });
});
