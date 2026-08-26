import { describe, expect, it } from "vitest";

import {
  autoAssignedPlan,
  canAssignPlan,
  canDecideClaim,
  formatMoney,
} from "../src/payments";

const live = { id: "plan_live", deletedAt: null };
const archived = { id: "plan_old", deletedAt: new Date("2026-01-01") };

describe("canAssignPlan", () => {
  it("allows a live plan", () => {
    expect(canAssignPlan(live, null)).toBe(true);
    expect(canAssignPlan(live, "plan_other")).toBe(true);
  });

  it("keeps an archived plan selectable for the member already on it", () => {
    expect(canAssignPlan(archived, "plan_old")).toBe(true);
  });

  it("refuses an archived plan for anyone else", () => {
    expect(canAssignPlan(archived, "plan_live")).toBe(false);
    expect(canAssignPlan(archived, null)).toBe(false);
  });

  it("refuses a plan that is not there", () => {
    expect(canAssignPlan(undefined, "plan_old")).toBe(false);
  });
});

describe("autoAssignedPlan", () => {
  it("picks the plan when the gym has exactly one", () => {
    expect(autoAssignedPlan(["only"])).toBe("only");
  });

  it("picks nothing when the gym has none or a choice", () => {
    expect(autoAssignedPlan([])).toBeUndefined();
    expect(autoAssignedPlan(["a", "b"])).toBeUndefined();
  });
});

describe("canDecideClaim", () => {
  it("allows a pending claim", () => {
    expect(canDecideClaim({ status: "pending" })).toBe(true);
  });

  it("refuses one already confirmed or rejected", () => {
    expect(canDecideClaim({ status: "confirmed" })).toBe(false);
    expect(canDecideClaim({ status: "rejected" })).toBe(false);
  });
});

describe("formatMoney", () => {
  it("reads minor units as a decimal amount", () => {
    expect(formatMoney(8000, "EUR")).toContain("80");
    expect(formatMoney(50, "EUR")).toContain("0.50");
  });

  it("names the currency one way or another", () => {
    const usd = formatMoney(12345, "USD");
    expect(usd).toMatch(/\$|USD/);
    expect(usd).toContain("123.45");
  });

  it("falls back to a plain label when Intl refuses the currency", () => {
    expect(formatMoney(2500, "NOT A CURRENCY")).toBe("NOT A CURRENCY 25.00");
  });

  it("keeps zero readable", () => {
    expect(formatMoney(0, "EUR")).toContain("0");
  });
});
