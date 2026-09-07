import { describe, expect, it } from "vitest";

import { paymentReference } from "../src/payments";

describe("paymentReference", () => {
  it("upper-cases the name and appends a short id tail", () => {
    expect(paymentReference("Sam Lee", "abcd5t6u")).toBe("SAM LEE 5T6U");
  });

  it("collapses whitespace and strips non-alphanumerics from the id", () => {
    expect(paymentReference("  Ann   Marie  ", "id-99-ZzZz")).toBe(
      "ANN MARIE ZZZZ",
    );
  });

  it("is stable for the same inputs", () => {
    expect(paymentReference("Bo", "xyz")).toBe(paymentReference("Bo", "xyz"));
  });

  it("handles an empty name", () => {
    expect(paymentReference("", "member1234")).toBe("1234");
  });
});
