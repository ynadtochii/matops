import { describe, expect, it } from "vitest";

import {
  isStripePaymentLink,
  SetAccessPlanPriceSchema,
  SetPlanPaymentLinkSchema,
} from "../src/access-plan";

const PLAN = "6f1c2d4e-1111-4111-8111-000000000001";

describe("Stripe payment link", () => {
  it("accepts live and test links", () => {
    expect(isStripePaymentLink("https://buy.stripe.com/aEU8wP2")).toBe(true);
    expect(isStripePaymentLink("https://buy.stripe.com/test_aEU8wP2")).toBe(
      true,
    );
  });

  it("refuses other hosts, plain http and look-alikes", () => {
    for (const value of [
      "http://buy.stripe.com/aEU8wP2",
      "https://buy.stripe.com/",
      "https://buy.stripe.com.evil.test/aEU8wP2",
      "https://evil.test/buy.stripe.com/aEU8wP2",
      "https://evil.test\\@buy.stripe.com/aEU8wP2",
      "https://user:pass@buy.stripe.com/aEU8wP2",
      "https://buy.stripe.com:8443/aEU8wP2",
      "https://buy.stripe.com/aEU8wP2#x",
      "javascript:alert(1)",
      "not a url",
      `https://buy.stripe.com/${"a".repeat(500)}`,
    ]) {
      expect([value, isStripePaymentLink(value)]).toEqual([value, false]);
    }
  });

  it("trims the pasted link and lets the owner clear it", () => {
    expect(
      SetPlanPaymentLinkSchema.parse({
        planId: PLAN,
        paymentLinkUrl: "  https://buy.stripe.com/abc  ",
      }).paymentLinkUrl,
    ).toBe("https://buy.stripe.com/abc");
    expect(
      SetPlanPaymentLinkSchema.parse({ planId: PLAN, paymentLinkUrl: null })
        .paymentLinkUrl,
    ).toBeNull();
  });

  it("keeps the link optional on a price change", () => {
    const base = {
      id: PLAN,
      priceMinor: 4500,
      currency: "EUR",
      effectiveMonth: "2026-11-01",
    };
    expect(SetAccessPlanPriceSchema.safeParse(base).success).toBe(true);
    expect(
      SetAccessPlanPriceSchema.safeParse({
        ...base,
        paymentLinkUrl: "https://evil.test/pay",
      }).success,
    ).toBe(false);
  });
});
