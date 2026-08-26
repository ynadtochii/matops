import { describe, expect, it } from "vitest";

import {
  canCheckIn,
  CHECK_IN_EARLY_MINUTES,
  checkInFetchWindow,
  MAX_CLASS_MINUTES,
} from "../src/checkin";

const MIN = 60 * 1000;
const NOW = new Date("2026-08-25T19:00:00Z");

const cls = (startMinutesFromNow: number, durationMinutes = 60) => ({
  id: "cls",
  startsAt: new Date(NOW.getTime() + startMinutesFromNow * MIN),
  durationMinutes,
  status: "scheduled",
});

describe("canCheckIn", () => {
  it("opens exactly CHECK_IN_EARLY_MINUTES before the start", () => {
    expect(canCheckIn(cls(CHECK_IN_EARLY_MINUTES), NOW)).toBe(true);
    expect(canCheckIn(cls(CHECK_IN_EARLY_MINUTES + 1), NOW)).toBe(false);
  });

  it("stays open through the class and closes at the end", () => {
    expect(canCheckIn(cls(-59, 60), NOW)).toBe(true);
    expect(canCheckIn(cls(-60, 60), NOW)).toBe(false);
  });

  it("refuses a cancelled class", () => {
    expect(canCheckIn({ ...cls(0), status: "cancelled" }, NOW)).toBe(false);
  });

  it("refuses a class from last week", () => {
    expect(canCheckIn(cls(-7 * 24 * 60), NOW)).toBe(false);
  });
});

describe("checkInFetchWindow", () => {
  it("reaches back far enough for the longest class still running", () => {
    const { from } = checkInFetchWindow(NOW);
    const longest = cls(-(MAX_CLASS_MINUTES - 1), MAX_CLASS_MINUTES);
    expect(canCheckIn(longest, NOW)).toBe(true);
    expect(longest.startsAt.getTime()).toBeGreaterThanOrEqual(from.getTime());
  });

  it("reaches forward exactly as far as a class with its doors open", () => {
    const { to } = checkInFetchWindow(NOW);
    const opening = cls(CHECK_IN_EARLY_MINUTES);
    expect(canCheckIn(opening, NOW)).toBe(true);
    expect(opening.startsAt.getTime()).toBeLessThanOrEqual(to.getTime());
    expect(cls(CHECK_IN_EARLY_MINUTES + 1).startsAt.getTime()).toBeGreaterThan(
      to.getTime(),
    );
  });

  it("never drops a class that canCheckIn would accept", () => {
    const { from, to } = checkInFetchWindow(NOW);
    for (let start = -MAX_CLASS_MINUTES - 60; start <= 180; start += 7) {
      for (const duration of [5, 60, 90, MAX_CLASS_MINUTES]) {
        const c = cls(start, duration);
        if (!canCheckIn(c, NOW)) continue;
        expect(c.startsAt.getTime()).toBeGreaterThanOrEqual(from.getTime());
        expect(c.startsAt.getTime()).toBeLessThanOrEqual(to.getTime());
      }
    }
  });
});
