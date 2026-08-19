import { describe, expect, it } from "vitest";

import { clockParts } from "../src/format";

describe("clockParts", () => {
  it("splits the clock from any AM/PM tail", () => {
    const { clock, period } = clockParts(new Date(2026, 0, 1, 18, 30));
    expect(clock).toMatch(/^\d{1,2}:\d{2}$/);
    expect(period === "" || /^[A-Za-z.]+$/.test(period)).toBe(true);
  });
});
