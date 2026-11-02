import { describe, expect, it } from "vitest";

import {
  PAYMENT_METHOD_KINDS,
  paymentMethodNeedsDetails,
  paymentMethodUsesReference,
} from "../src/payment-method";

describe("payment methods", () => {
  it("needs details and a reference for everything except cash", () => {
    expect(
      PAYMENT_METHOD_KINDS.filter((k) => paymentMethodNeedsDetails(k)),
    ).toEqual(["bank", "mbway", "other"]);
    expect(
      PAYMENT_METHOD_KINDS.filter((k) => paymentMethodUsesReference(k)),
    ).toEqual(["bank", "mbway", "other"]);
  });
});
