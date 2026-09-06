import { describe, expect, it } from "vitest";

import type { PlanPrice } from "../src/plan-price";
import { canPriceFrom, priceForMonth } from "../src/plan-price";

const history: PlanPrice[] = [
  { effectiveMonth: "2026-01-01", priceMinor: 5000, currency: "EUR" },
  { effectiveMonth: "2026-06-01", priceMinor: 6000, currency: "EUR" },
];

describe("priceForMonth", () => {
  it("has no answer for a plan that was never priced", () => {
    expect(priceForMonth([], "2026-09-01")).toBeNull();
  });

  it("has no answer for a month before the first price", () => {
    expect(priceForMonth(history, "2025-12-01")).toBeNull();
  });

  it("uses the price that was in force, not the newest one", () => {
    expect(priceForMonth(history, "2026-02-01")).toEqual({
      priceMinor: 5000,
      currency: "EUR",
    });
  });

  it("applies a change from the month it names", () => {
    expect(priceForMonth(history, "2026-05-01")?.priceMinor).toBe(5000);
    expect(priceForMonth(history, "2026-06-01")?.priceMinor).toBe(6000);
    expect(priceForMonth(history, "2026-07-01")?.priceMinor).toBe(6000);
  });

  it("does not care what order the rows arrive in", () => {
    expect(
      priceForMonth([...history].reverse(), "2026-02-01")?.priceMinor,
    ).toBe(5000);
  });

  it("carries the currency of that month, not of today", () => {
    const moved: PlanPrice[] = [
      { effectiveMonth: "2026-01-01", priceMinor: 5000, currency: "EUR" },
      { effectiveMonth: "2026-06-01", priceMinor: 4500, currency: "GBP" },
    ];
    expect(priceForMonth(moved, "2026-03-01")?.currency).toBe("EUR");
    expect(priceForMonth(moved, "2026-06-01")?.currency).toBe("GBP");
  });
});

describe("canPriceFrom", () => {
  it("refuses the month in progress, which members have already been told", () => {
    expect(canPriceFrom("2026-09-01", "2026-09-01")).toBe(false);
  });

  it("refuses a past month, which is what the history exists to protect", () => {
    expect(canPriceFrom("2026-08-01", "2026-09-01")).toBe(false);
  });

  it("accepts the month after this one, and any month beyond it", () => {
    expect(canPriceFrom("2026-10-01", "2026-09-01")).toBe(true);
    expect(canPriceFrom("2027-01-01", "2026-09-01")).toBe(true);
  });
});
