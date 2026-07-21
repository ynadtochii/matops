import { describe, expect, it } from "vitest";

import { attendanceCounts, canMarkAttendance } from "../src/attendance";

describe("canMarkAttendance", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  const live = { status: "scheduled", deletedAt: null };

  it("allows today's class", () => {
    expect(
      canMarkAttendance(
        { ...live, startsAt: new Date("2026-08-15T18:00:00Z") },
        now,
      ),
    ).toBe(true);
  });

  it("allows a class inside the 14-day backfill window", () => {
    expect(
      canMarkAttendance(
        { ...live, startsAt: new Date("2026-08-05T18:00:00Z") },
        now,
      ),
    ).toBe(true);
  });

  it("rejects a class older than the backfill window", () => {
    expect(
      canMarkAttendance(
        { ...live, startsAt: new Date("2026-07-20T18:00:00Z") },
        now,
      ),
    ).toBe(false);
  });

  it("rejects a class more than a day in the future", () => {
    expect(
      canMarkAttendance(
        { ...live, startsAt: new Date("2026-08-18T18:00:00Z") },
        now,
      ),
    ).toBe(false);
  });

  it("rejects a cancelled class", () => {
    expect(
      canMarkAttendance(
        { status: "cancelled", deletedAt: null, startsAt: now },
        now,
      ),
    ).toBe(false);
  });

  it("rejects a soft-deleted class", () => {
    expect(
      canMarkAttendance(
        { status: "scheduled", deletedAt: new Date(), startsAt: now },
        now,
      ),
    ).toBe(false);
  });
});

describe("attendanceCounts", () => {
  it("counts each axis independently", () => {
    const rows = [
      {
        bookingStatus: "booked",
        bookingTier: "confirmed",
        attendanceStatus: "present",
      },
      {
        bookingStatus: "booked",
        bookingTier: "provisional",
        attendanceStatus: "unmarked",
      },
      {
        bookingStatus: "none",
        bookingTier: "confirmed",
        attendanceStatus: "present",
      }, // walk-in
      {
        bookingStatus: "booked",
        bookingTier: "confirmed",
        attendanceStatus: "absent",
      },
    ];
    expect(attendanceCounts(rows)).toEqual({
      present: 2,
      absent: 1,
      unmarked: 1,
      confirmed: 2,
      provisional: 1,
      walkIn: 1,
    });
  });

  it("is all zero for no rows", () => {
    expect(attendanceCounts([])).toEqual({
      present: 0,
      absent: 0,
      unmarked: 0,
      confirmed: 0,
      provisional: 0,
      walkIn: 0,
    });
  });
});
