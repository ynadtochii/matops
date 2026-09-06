import { describe, expect, it } from "vitest";

import {
  CreateAccessPlanSchema,
  SetAccessPlanPriceSchema,
} from "../src/access-plan";

const base = { name: "BJJ + Gym", entityIds: [] };

describe("CreateAccessPlanSchema pricing", () => {
  it("accepts a plan with no price, which is how setup starts", () => {
    const parsed = CreateAccessPlanSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.priceMinor).toBeUndefined();
      expect(parsed.data.currency).toBeUndefined();
    }
  });

  it("accepts a price with its currency, upper-cased", () => {
    const parsed = CreateAccessPlanSchema.safeParse({
      ...base,
      priceMinor: 5000,
      currency: "eur",
    });
    expect(parsed.success && parsed.data.currency).toBe("EUR");
  });

  it("refuses an amount with no currency, which means nothing", () => {
    expect(
      CreateAccessPlanSchema.safeParse({ ...base, priceMinor: 5000 }).success,
    ).toBe(false);
  });

  it("refuses a currency with no amount", () => {
    expect(
      CreateAccessPlanSchema.safeParse({ ...base, currency: "EUR" }).success,
    ).toBe(false);
  });

  it("refuses a negative price and a fractional minor unit", () => {
    for (const priceMinor of [-1, 12.5]) {
      expect([
        priceMinor,
        CreateAccessPlanSchema.safeParse({
          ...base,
          priceMinor,
          currency: "EUR",
        }).success,
      ]).toEqual([priceMinor, false]);
    }
  });

  it("refuses a currency that is not three letters", () => {
    for (const currency of ["EU", "EURO", "12€"]) {
      expect([
        currency,
        CreateAccessPlanSchema.safeParse({ ...base, priceMinor: 1, currency })
          .success,
      ]).toEqual([currency, false]);
    }
  });
});

describe("SetAccessPlanPriceSchema", () => {
  const id = "11111111-1111-4111-8111-000000000001";

  it("takes a plan, an amount, a currency and the month it starts", () => {
    const parsed = SetAccessPlanPriceSchema.safeParse({
      id,
      priceMinor: 6000,
      currency: "gbp",
      effectiveMonth: "2026-10-01",
    });
    expect(parsed.success && parsed.data).toMatchObject({
      priceMinor: 6000,
      currency: "GBP",
      effectiveMonth: "2026-10-01",
    });
  });

  it("refuses a month addressed by any day but its first", () => {
    expect(
      SetAccessPlanPriceSchema.safeParse({
        id,
        priceMinor: 6000,
        currency: "EUR",
        effectiveMonth: "2026-10-15",
      }).success,
    ).toBe(false);
  });

  it("requires the price and the currency, unlike creation", () => {
    expect(
      SetAccessPlanPriceSchema.safeParse({ id, effectiveMonth: "2026-10-01" })
        .success,
    ).toBe(false);
  });
});
