import { describe, expect, it } from "vitest";

import { canSubmitDropIn, normalizePhone } from "../src/dropin";

describe("normalizePhone", () => {
  it("collapses formatting but keeps the country marker", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("+15551234567");
  });
  it("matches two formats of the same number", () => {
    expect(normalizePhone("555 123 4567")).toBe(normalizePhone("5551234567"));
    expect(normalizePhone("+351 912 345 678")).toBe(
      normalizePhone("+351-912-345-678"),
    );
  });
  it("leaves a number typed without a country code alone", () => {
    expect(normalizePhone("912 345 678")).toBe("912345678");
  });
});

describe("canSubmitDropIn", () => {
  const ok = {
    consent: true,
    phone: "555 123 4567",
    firstName: "Sam",
    lastName: "Lee",
    email: "sam@example.com",
  };

  it("accepts a complete, consented drop-in", () => {
    expect(canSubmitDropIn(ok)).toEqual({ ok: true });
  });

  it("rejects without consent", () => {
    expect(canSubmitDropIn({ ...ok, consent: false })).toEqual({
      ok: false,
      reason: "no-consent",
    });
  });

  it("rejects an unusable phone", () => {
    expect(canSubmitDropIn({ ...ok, phone: "--" })).toEqual({
      ok: false,
      reason: "no-phone",
    });
  });

  it("rejects a missing name", () => {
    expect(canSubmitDropIn({ ...ok, lastName: "  " })).toEqual({
      ok: false,
      reason: "no-name",
    });
  });

  it("rejects a missing email, the address a member account is made from", () => {
    expect(canSubmitDropIn({ ...ok, email: " " })).toEqual({
      ok: false,
      reason: "no-email",
    });
  });
});
