import { describe, expect, it } from "vitest";

import {
  ReorderPaymentMethodsSchema,
  SavePaymentMethodSchema,
} from "../src/access-plan";

const ID = "6f1c2d4e-1111-4111-8111-000000000001";

describe("SavePaymentMethodSchema", () => {
  it("accepts cash with no details", () => {
    expect(
      SavePaymentMethodSchema.safeParse({
        kind: "cash",
        label: "Cash",
        details: "",
        enabled: true,
      }).success,
    ).toBe(true);
  });

  it("refuses a bank, MB WAY or other method with no details", () => {
    for (const kind of ["bank", "mbway", "other"]) {
      expect(
        SavePaymentMethodSchema.safeParse({
          kind,
          label: "Pay",
          details: "   ",
          enabled: true,
        }).success,
      ).toBe(false);
    }
  });

  it("refuses card, an unknown kind and an empty label", () => {
    for (const input of [
      { kind: "card", label: "Card", details: "x", enabled: true },
      { kind: "bank", label: " ", details: "PT50", enabled: true },
    ]) {
      expect(SavePaymentMethodSchema.safeParse(input).success).toBe(false);
    }
  });
});

describe("ReorderPaymentMethodsSchema", () => {
  it("refuses the same method twice", () => {
    expect(ReorderPaymentMethodsSchema.safeParse({ ids: [ID] }).success).toBe(
      true,
    );
    expect(
      ReorderPaymentMethodsSchema.safeParse({ ids: [ID, ID] }).success,
    ).toBe(false);
  });
});
