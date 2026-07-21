import { describe, expect, it } from "vitest";

import { computeOccurrences } from "../src/materialize";

const iso = (dates: Date[]) => dates.map((d) => d.toISOString());

describe("computeOccurrences", () => {
  it("generates weekly occurrences at the right UTC instant (no DST in window)", () => {
    // Europe/Kyiv is UTC+2 in January → 18:00 local = 16:00 UTC.
    const got = computeOccurrences(
      { daysOfWeek: [1, 3], startsAtMinutes: 1080, timeZone: "Europe/Kyiv" },
      new Date("2024-01-08T00:00:00Z"),
      new Date("2024-01-18T00:00:00Z"),
    );
    expect(iso(got)).toEqual([
      "2024-01-08T16:00:00.000Z", // Mon
      "2024-01-10T16:00:00.000Z", // Wed
      "2024-01-15T16:00:00.000Z", // Mon
      "2024-01-17T16:00:00.000Z", // Wed
    ]);
  });

  it("keeps local wall-clock across a spring-forward (America/New_York)", () => {
    // DST starts 2024-03-10. Fri 18:00 is EST(-5)=23:00Z before, EDT(-4)=22:00Z after.
    const got = computeOccurrences(
      {
        daysOfWeek: [5],
        startsAtMinutes: 1080,
        timeZone: "America/New_York",
      },
      new Date("2024-03-08T00:00:00Z"),
      new Date("2024-03-16T00:00:00Z"),
    );
    expect(iso(got)).toEqual([
      "2024-03-08T23:00:00.000Z", // EST
      "2024-03-15T22:00:00.000Z", // EDT — still 18:00 local
    ]);
  });

  it("keeps local wall-clock across a fall-back (America/New_York)", () => {
    // DST ends 2024-11-03. Sat 18:00 is EDT(-4)=22:00Z before, EST(-5)=23:00Z after.
    const got = computeOccurrences(
      {
        daysOfWeek: [6],
        startsAtMinutes: 1080,
        timeZone: "America/New_York",
      },
      new Date("2024-11-02T00:00:00Z"),
      new Date("2024-11-10T00:00:00Z"),
    );
    expect(iso(got)).toEqual([
      "2024-11-02T22:00:00.000Z", // EDT
      "2024-11-09T23:00:00.000Z", // EST — still 18:00 local
    ]);
  });

  it("is inclusive of `from` and exclusive of `to`", () => {
    const spec = {
      daysOfWeek: [1],
      startsAtMinutes: 0, // 00:00 local
      timeZone: "UTC",
    };
    // A Monday-00:00 class exactly at `from` is included…
    const inclusive = computeOccurrences(
      spec,
      new Date("2024-01-08T00:00:00Z"),
      new Date("2024-01-15T00:00:00Z"),
    );
    expect(iso(inclusive)).toEqual(["2024-01-08T00:00:00.000Z"]);
    // …and one exactly at `to` is excluded.
    expect(
      inclusive.some((d) => d.toISOString() === "2024-01-15T00:00:00.000Z"),
    ).toBe(false);
  });

  it("returns nothing for an empty day set or an inverted window", () => {
    const base = { startsAtMinutes: 600, timeZone: "UTC" };
    expect(
      computeOccurrences(
        { ...base, daysOfWeek: [] },
        new Date("2024-01-01T00:00:00Z"),
        new Date("2024-02-01T00:00:00Z"),
      ),
    ).toEqual([]);
    expect(
      computeOccurrences(
        { ...base, daysOfWeek: [1] },
        new Date("2024-02-01T00:00:00Z"),
        new Date("2024-01-01T00:00:00Z"),
      ),
    ).toEqual([]);
  });
});
