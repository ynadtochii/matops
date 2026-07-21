import { describe, expect, it } from "vitest";

import {
  describeRecurrence,
  formatStartMinutes,
  isValidStartMinutes,
  normalizeDaysOfWeek,
} from "../src/schedule";

describe("normalizeDaysOfWeek", () => {
  it("sorts ascending and drops duplicates", () => {
    expect(normalizeDaysOfWeek([3, 1, 3, 5])).toEqual([1, 3, 5]);
  });

  it("drops out-of-range days", () => {
    expect(normalizeDaysOfWeek([-1, 0, 6, 7])).toEqual([0, 6]);
  });
});

describe("formatStartMinutes", () => {
  it("zero-pads to HH:MM", () => {
    expect(formatStartMinutes(0)).toBe("00:00");
    expect(formatStartMinutes(1080)).toBe("18:00");
    expect(formatStartMinutes(90)).toBe("01:30");
    expect(formatStartMinutes(1439)).toBe("23:59");
  });
});

describe("isValidStartMinutes", () => {
  it("accepts a full day range and rejects the boundaries beyond it", () => {
    expect(isValidStartMinutes(0)).toBe(true);
    expect(isValidStartMinutes(1439)).toBe(true);
    expect(isValidStartMinutes(1440)).toBe(false);
    expect(isValidStartMinutes(-1)).toBe(false);
    expect(isValidStartMinutes(1.5)).toBe(false);
  });
});

describe("describeRecurrence", () => {
  it("renders canonical days + local time", () => {
    expect(describeRecurrence([3, 1], 1080)).toBe("Mon, Wed · 18:00");
  });
});
