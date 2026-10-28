import { describe, expect, it } from "vitest";

import {
  cardPaymentUrl,
  parsePaymentLinkReference,
  paymentLinkReference,
  rowForMonth,
} from "../src/payment-link";

const ASSIGNMENT = "6f1c2d4e-1111-4111-8111-000000000001";

describe("rowForMonth", () => {
  const rows = [
    { effectiveMonth: "2026-01-01", link: "jan" },
    { effectiveMonth: "2026-06-01", link: "jun" },
  ];

  it("picks the latest row at or before the month", () => {
    expect(rowForMonth(rows, "2026-05-01")?.link).toBe("jan");
    expect(rowForMonth(rows, "2026-06-01")?.link).toBe("jun");
    expect(rowForMonth(rows, "2026-09-01")?.link).toBe("jun");
  });

  it("is null before the first row", () => {
    expect(rowForMonth(rows, "2025-12-01")).toBeNull();
  });
});

describe("cardPaymentUrl", () => {
  it("names the membership and the month in a reference Stripe accepts", () => {
    const reference = paymentLinkReference(ASSIGNMENT, "2026-10-01");
    expect(reference).toBe(`${ASSIGNMENT}_2026-10`);
    expect(reference).toMatch(/^[A-Za-z0-9_-]{1,200}$/);
  });

  it("adds the reference and the email to the link", () => {
    expect(
      cardPaymentUrl("https://buy.stripe.com/test_abc", {
        assignmentId: ASSIGNMENT,
        month: "2026-10-01",
        email: "sam+gym@test.local",
      }),
    ).toBe(
      `https://buy.stripe.com/test_abc?client_reference_id=${ASSIGNMENT}_2026-10&prefilled_email=sam%2Bgym%40test.local`,
    );
  });

  it("keeps a query the owner's link already has", () => {
    expect(
      cardPaymentUrl("https://buy.stripe.com/abc?locale=pt", {
        assignmentId: ASSIGNMENT,
        month: "2026-10-01",
      }),
    ).toBe(
      `https://buy.stripe.com/abc?locale=pt&client_reference_id=${ASSIGNMENT}_2026-10`,
    );
  });
});

describe("parsePaymentLinkReference", () => {
  it("reads back the membership and month a link was built with", () => {
    expect(
      parsePaymentLinkReference(paymentLinkReference(ASSIGNMENT, "2026-10-01")),
    ).toEqual({ assignmentId: ASSIGNMENT, month: "2026-10-01" });
  });

  it("refuses anything else", () => {
    for (const value of [
      null,
      undefined,
      "",
      `${ASSIGNMENT}_2026-13`,
      `${ASSIGNMENT}_2026-00`,
      `${ASSIGNMENT}-2026-10`,
      `not-a-uuid_2026-10`,
      `${ASSIGNMENT}_2026-10_extra`,
      `${ASSIGNMENT.toUpperCase()}_2026-10`,
    ]) {
      expect([value, parsePaymentLinkReference(value)]).toEqual([value, null]);
    }
  });
});
