import { describe, expect, it } from "vitest";

import {
  describeRecurrence,
  disciplineHue,
  formatStartMinutes,
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
describe("describeRecurrence", () => {
  it("renders canonical days + local time", () => {
    expect(describeRecurrence([3, 1], 1080)).toBe("Mon, Wed · 18:00");
  });
});

describe("disciplineHue", () => {
  const order = ["Gi", "NoGi", "Open mat", "Kids", "Wrestling", "Judo"];

  it("follows the academy's list order", () => {
    expect(disciplineHue("Gi", order)).toBe(0);
    expect(disciplineHue("NoGi", order)).toBe(1);
    expect(disciplineHue("Wrestling", order)).toBe(4);
  });

  it("matches names without case", () => {
    expect(disciplineHue("nogi", order)).toBe(1);
  });

  it("keeps unset, unlisted and past-the-fifth disciplines neutral", () => {
    expect(disciplineHue(null, order)).toBeNull();
    expect(disciplineHue("Sambo", order)).toBeNull();
    expect(disciplineHue("Judo", order)).toBeNull();
    expect(disciplineHue("Gi", [])).toBeNull();
  });
});
