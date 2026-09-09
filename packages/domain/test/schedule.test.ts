import { describe, expect, it } from "vitest";

import {
  describeRecurrence,
  disciplineTone,
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

describe("disciplineTone", () => {
  it("folds mma in with nogi", () => {
    expect(disciplineTone("nogi")).toBe("nogi");
    expect(disciplineTone("mma")).toBe("nogi");
  });

  it("keeps open mat neutral", () => {
    expect(disciplineTone("other")).toBe("other");
  });

  it("treats every gi discipline, and no discipline at all, as gi", () => {
    expect(disciplineTone("bjj")).toBe("gi");
    expect(disciplineTone("judo")).toBe("gi");
    expect(disciplineTone(null)).toBe("gi");
    expect(disciplineTone("wrestling")).toBe("gi");
  });
});
