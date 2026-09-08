import { describe, expect, it } from "vitest";

import {
  BOOKING_CUTOFF_MINUTES,
  isPubliclyBookable,
  publicClassView,
  publicInstant,
} from "../src/public-api";

const NOW = new Date("2026-09-01T10:00:00.000Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

describe("isPubliclyBookable", () => {
  it("is open well before the class", () => {
    expect(isPubliclyBookable(minutes(120), NOW)).toBe(true);
  });

  it("closes inside the cut-off", () => {
    expect(isPubliclyBookable(minutes(BOOKING_CUTOFF_MINUTES), NOW)).toBe(
      false,
    );
    expect(isPubliclyBookable(minutes(BOOKING_CUTOFF_MINUTES + 1), NOW)).toBe(
      true,
    );
  });

  it("closes once the class has started", () => {
    expect(isPubliclyBookable(minutes(-5), NOW)).toBe(false);
  });
});

describe("publicClassView", () => {
  const cls = {
    id: "c1",
    title: "Fundamentals gi",
    discipline: "bjj",
    startsAt: new Date("2026-09-01T17:30:00.000Z"),
    durationMinutes: 60,
  };

  it("returns the class in the academy's own zone with its offset", () => {
    expect(publicClassView(cls, "Europe/Lisbon", NOW).startsAt).toBe(
      "2026-09-01T18:30:00+01:00",
    );
  });

  it("returns only the five published fields plus bookable", () => {
    expect(
      Object.keys(publicClassView(cls, "Europe/Lisbon", NOW)).sort(),
    ).toEqual([
      "bookable",
      "discipline",
      "durationMinutes",
      "id",
      "startsAt",
      "title",
    ]);
  });

  it("never reports a class as unbookable for being full", () => {
    expect(publicClassView(cls, "Europe/Lisbon", NOW).bookable).toBe(true);
  });
});

describe("publicInstant", () => {
  it("keeps the winter offset for the same zone", () => {
    expect(
      publicInstant(new Date("2026-01-15T18:30:00.000Z"), "Europe/Lisbon"),
    ).toBe("2026-01-15T18:30:00Z");
  });
});
