import { describe, expect, it } from "vitest";

import { DAY_MS, localDate } from "../src/local-date";

const LISBON = "Europe/Lisbon";
const UTC = "UTC";
const AUCKLAND = "Pacific/Auckland";

describe("localDate", () => {
  it("draws the day boundary in the academy's zone, not UTC", () => {
    const lateNight = new Date("2026-06-15T23:30:00Z");
    expect(localDate(lateNight, UTC).dayNumber).toBe(
      localDate(new Date("2026-06-15T12:00:00Z"), UTC).dayNumber,
    );
    expect(localDate(lateNight, AUCKLAND).dayNumber).toBe(
      localDate(new Date("2026-06-16T12:00:00Z"), UTC).dayNumber,
    );
  });

  it("keeps every hour of one local day on the same day number", () => {
    const day = new Date("2026-06-15T00:30:00Z");
    const numbers = [0, 6, 12, 18, 23].map(
      (h) =>
        localDate(
          new Date(`2026-06-15T${String(h).padStart(2, "0")}:30:00Z`),
          UTC,
        ).dayNumber,
    );
    expect(new Set(numbers).size).toBe(1);
    expect(numbers[0]).toBe(localDate(day, UTC).dayNumber);
  });

  it("counts weekdays from Sunday, matching DAY_LABELS", () => {
    expect(localDate(new Date("2026-06-14T12:00:00Z"), UTC).weekday).toBe(0);
    expect(localDate(new Date("2026-06-15T12:00:00Z"), UTC).weekday).toBe(1);
    expect(localDate(new Date("2026-06-20T12:00:00Z"), UTC).weekday).toBe(6);
  });

  it("puts a Sunday-to-Saturday run in one week bucket", () => {
    const buckets = [14, 15, 16, 17, 18, 19, 20].map(
      (d) => localDate(new Date(`2026-06-${d}T12:00:00Z`), UTC).weekBucket,
    );
    expect(new Set(buckets).size).toBe(1);
  });

  it("starts a new week bucket on the next Sunday", () => {
    const sat = localDate(new Date("2026-06-20T12:00:00Z"), UTC).weekBucket;
    const sun = localDate(new Date("2026-06-21T12:00:00Z"), UTC).weekBucket;
    expect(sun).toBe(sat + 1);
  });

  it("buckets months so consecutive months are consecutive numbers", () => {
    const dec = localDate(new Date("2026-12-15T12:00:00Z"), UTC).monthBucket;
    const jan = localDate(new Date("2027-01-15T12:00:00Z"), UTC).monthBucket;
    expect(jan).toBe(dec + 1);
  });

  it("survives a daylight-saving jump without losing or repeating a day", () => {
    const before = localDate(new Date("2026-03-28T12:00:00Z"), LISBON);
    const after = localDate(new Date("2026-03-29T12:00:00Z"), LISBON);
    const later = localDate(new Date("2026-03-30T12:00:00Z"), LISBON);
    expect(after.dayNumber).toBe(before.dayNumber + 1);
    expect(later.dayNumber).toBe(after.dayNumber + 1);
  });

  it("keeps a whole DST day inside one day number", () => {
    const hours = [0, 3, 12, 22].map(
      (h) =>
        localDate(
          new Date(`2026-03-29T${String(h).padStart(2, "0")}:30:00Z`),
          LISBON,
        ).dayNumber,
    );
    expect(new Set(hours).size).toBe(1);
  });

  it("counts a day as exactly DAY_MS of calendar index", () => {
    const a = new Date("2026-06-15T12:00:00Z");
    const b = new Date(a.getTime() + DAY_MS);
    expect(localDate(b, UTC).dayNumber).toBe(localDate(a, UTC).dayNumber + 1);
  });
});
