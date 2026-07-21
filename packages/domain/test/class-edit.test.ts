import { describe, expect, it } from "vitest";

import { classChange, templateTimingChanged } from "../src/class-edit";

const rec = (over = {}) => ({
  daysOfWeek: [1, 3],
  startsAtMinutes: 1080,
  timeZone: "Europe/Kyiv",
  ...over,
});

describe("templateTimingChanged", () => {
  it("is false when timing is identical (day order aside)", () => {
    expect(templateTimingChanged(rec(), rec({ daysOfWeek: [3, 1] }))).toBe(
      false,
    );
  });

  it("is true when the start minute changes", () => {
    expect(templateTimingChanged(rec(), rec({ startsAtMinutes: 1140 }))).toBe(
      true,
    );
  });

  it("is true when a day is added or removed", () => {
    expect(templateTimingChanged(rec(), rec({ daysOfWeek: [1, 3, 5] }))).toBe(
      true,
    );
  });

  it("is true when the time zone changes", () => {
    expect(templateTimingChanged(rec(), rec({ timeZone: "UTC" }))).toBe(true);
  });
});

describe("classChange", () => {
  const base = {
    startsAt: new Date("2026-08-01T15:00:00Z"),
    instructorId: "u1",
  };

  it("flags no notification on a no-op edit", () => {
    expect(classChange(base, { ...base })).toEqual({
      timeChanged: false,
      instructorChanged: false,
      shouldNotify: false,
    });
  });

  it("notifies when the time changes", () => {
    const c = classChange(base, {
      ...base,
      startsAt: new Date("2026-08-01T16:00:00Z"),
    });
    expect(c).toMatchObject({ timeChanged: true, shouldNotify: true });
  });

  it("notifies when the instructor changes", () => {
    const c = classChange(base, { ...base, instructorId: "u2" });
    expect(c).toMatchObject({ instructorChanged: true, shouldNotify: true });
  });
});
