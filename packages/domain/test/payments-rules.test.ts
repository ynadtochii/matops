import { describe, expect, it } from "vitest";

import { formatMoney } from "../src/payments";

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
