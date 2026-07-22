import { describe, expect, it } from "vitest";

import {
  describeRecurrence,
  formatStartMinutes,
  isValidStartMinutes,
  nextBookableClass,
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

describe("nextBookableClass", () => {
  const now = new Date("2026-07-22T12:00:00Z");
  const mk = (id: string, iso: string, extra = {}) => ({
    id,
    startsAt: new Date(iso),
    status: "scheduled",
    ...extra,
  });

  it("picks the soonest upcoming unbooked class", () => {
    const r = nextBookableClass(
      [
        mk("past", "2026-07-22T10:00:00Z"),
        mk("soon", "2026-07-22T18:00:00Z"),
        mk("later", "2026-07-23T18:00:00Z"),
      ],
      now,
    );
    expect(r?.id).toBe("soon");
  });

  it("skips a class the student already booked", () => {
    const r = nextBookableClass(
      [
        mk("booked", "2026-07-22T18:00:00Z", { myBooking: "booked" }),
        mk("open", "2026-07-23T18:00:00Z"),
      ],
      now,
    );
    expect(r?.id).toBe("open");
  });

  it("falls back to the soonest upcoming when all are booked", () => {
    const r = nextBookableClass(
      [mk("a", "2026-07-22T18:00:00Z", { myBooking: "booked" })],
      now,
    );
    expect(r?.id).toBe("a");
  });

  it("ignores cancelled and past classes; null when nothing upcoming", () => {
    expect(
      nextBookableClass(
        [
          mk("cx", "2026-07-23T18:00:00Z", { status: "cancelled" }),
          mk("past", "2026-07-21T18:00:00Z"),
        ],
        now,
      ),
    ).toBeNull();
  });
});
