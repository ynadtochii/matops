import { describe, expect, it } from "vitest";

import { clockParts, dayKey, groupByDay, startsInLabel } from "../src/format";

describe("clockParts", () => {
  it("splits the clock from any AM/PM tail", () => {
    const { clock, period } = clockParts(new Date(2026, 0, 1, 18, 30));
    expect(clock).toMatch(/^\d{1,2}:\d{2}$/);
    expect(period === "" || /^[A-Za-z.]+$/.test(period)).toBe(true);
  });
});

describe("dayKey", () => {
  it("is the local calendar day, zero-padded", () => {
    expect(dayKey(new Date(2026, 6, 5, 0, 30))).toBe("2026-07-05");
    expect(dayKey(new Date(2026, 6, 5, 23, 59))).toBe("2026-07-05");
  });

  it("rolls at local midnight, not UTC midnight", () => {
    const lateNight = new Date(2026, 6, 5, 23, 59);
    const justAfter = new Date(2026, 6, 6, 0, 1);
    expect(dayKey(lateNight)).not.toBe(dayKey(justAfter));
  });
});

describe("groupByDay", () => {
  const row = (startsAt: string) => ({ id: startsAt, startsAt });

  it("buckets rows into local days", () => {
    const morning = row(new Date(2026, 6, 5, 9, 0).toISOString());
    const evening = row(new Date(2026, 6, 5, 18, 0).toISOString());
    const nextDay = row(new Date(2026, 6, 6, 9, 0).toISOString());

    expect(groupByDay([morning, evening, nextDay])).toEqual([
      ["2026-07-05", [morning, evening]],
      ["2026-07-06", [nextDay]],
    ]);
  });

  it("keeps the order the rows arrived in", () => {
    const late = row(new Date(2026, 6, 5, 18, 0).toISOString());
    const early = row(new Date(2026, 6, 5, 9, 0).toISOString());
    expect(groupByDay([late, early])[0]?.[1]).toEqual([late, early]);
  });

  it("accepts a Date as well as an ISO string", () => {
    const d = { startsAt: new Date(2026, 6, 5, 9, 0) };
    expect(groupByDay([d])).toEqual([["2026-07-05", [d]]]);
  });

  it("has no days for no rows", () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe("startsInLabel", () => {
  const now = new Date(2026, 6, 5, 12, 0);
  const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

  it("counts minutes inside the hour", () => {
    expect(startsInLabel(at(45), now)).toBe("Starts in 45 min");
  });

  it("rounds a part minute up", () => {
    expect(startsInLabel(new Date(now.getTime() + 30_000), now)).toBe(
      "Starts in 1 min",
    );
  });

  it("shows hours and minutes", () => {
    expect(startsInLabel(at(135), now)).toBe("Starts in 2 h 15 min");
    expect(startsInLabel(at(180), now)).toBe("Starts in 3 h");
  });

  it("is null once started or more than 12 hours away", () => {
    expect(startsInLabel(at(0), now)).toBeNull();
    expect(startsInLabel(at(-10), now)).toBeNull();
    expect(startsInLabel(at(12 * 60), now)).toBe("Starts in 12 h");
    expect(startsInLabel(at(12 * 60 + 1), now)).toBeNull();
  });
});
