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
  const NOW = new Date("2026-07-20T12:00:00Z");
  const base = {
    startsAt: new Date("2026-08-01T15:00:00Z"),
    instructorId: "u1",
  };
  const past = {
    startsAt: new Date("2026-07-14T15:00:00Z"),
    instructorId: "u1",
  };

  it("flags no notification on a no-op edit", () => {
    expect(classChange(base, { ...base }, NOW)).toEqual({
      timeChanged: false,
      instructorChanged: false,
      historyOnly: false,
      shouldNotify: false,
    });
  });

  it("notifies when the time changes", () => {
    const c = classChange(
      base,
      { ...base, startsAt: new Date("2026-08-01T16:00:00Z") },
      NOW,
    );
    expect(c).toMatchObject({ timeChanged: true, shouldNotify: true });
  });

  it("notifies when the instructor changes", () => {
    const c = classChange(base, { ...base, instructorId: "u2" }, NOW);
    expect(c).toMatchObject({ instructorChanged: true, shouldNotify: true });
  });

  it("stays silent when correcting the coach on a class that already happened", () => {
    const c = classChange(past, { ...past, instructorId: "u2" }, NOW);
    expect(c).toMatchObject({
      instructorChanged: true,
      historyOnly: true,
      shouldNotify: false,
    });
  });

  it("notifies when a past class is moved into the future", () => {
    const c = classChange(past, { ...past, startsAt: base.startsAt }, NOW);
    expect(c).toMatchObject({ historyOnly: false, shouldNotify: true });
  });

  it("notifies when an upcoming class is moved into the past", () => {
    const c = classChange(base, { ...base, startsAt: past.startsAt }, NOW);
    expect(c).toMatchObject({ historyOnly: false, shouldNotify: true });
  });
});
