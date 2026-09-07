import { describe, expect, it } from "vitest";

import type {
  AttendanceCandidate,
  BulkMarkRow,
  ParticipationRow,
} from "../src/attendance";
import {
  attendanceCounts,
  attendanceReview,
  attendanceReviewError,
  attendanceWriteAccess,
  bulkMarkTargets,
  canMarkAttendance,
  needsAttendance,
  visibleAttendees,
} from "../src/attendance";

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

describe("attendanceWriteAccess", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  const recent = {
    status: "scheduled",
    deletedAt: null,
    startsAt: new Date("2026-08-10T12:00:00Z"),
  };
  const old = {
    status: "scheduled",
    deletedAt: null,
    startsAt: new Date("2026-07-10T12:00:00Z"),
  };

  it("allows recent attendance for all staff", () => {
    expect(attendanceWriteAccess(recent, now, false)).toBe("allowed");
  });

  it("requires a reason when managers correct old attendance", () => {
    expect(attendanceWriteAccess(old, now, true)).toBe("reason-required");
  });

  it("keeps old attendance closed to instructors", () => {
    expect(attendanceWriteAccess(old, now, false)).toBe("closed");
  });

  it("keeps cancelled and future classes closed", () => {
    expect(
      attendanceWriteAccess({ ...recent, status: "cancelled" }, now, true),
    ).toBe("closed");
    expect(
      attendanceWriteAccess(
        { ...recent, startsAt: new Date("2026-08-18T12:00:00Z") },
        now,
        true,
      ),
    ).toBe("closed");
  });
});

describe("attendanceCounts", () => {
  it("counts each axis independently", () => {
    const rows: ParticipationRow[] = [
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

describe("bulkMarkTargets", () => {
  it("returns booked+unmarked students, leaving absents and walk-ins", () => {
    const rows: BulkMarkRow[] = [
      { studentId: "a", bookingStatus: "booked", attendanceStatus: "unmarked" },
      { studentId: "b", bookingStatus: "booked", attendanceStatus: "present" }, // already
      { studentId: "c", bookingStatus: "booked", attendanceStatus: "absent" }, // explicit
      { studentId: "d", bookingStatus: "none", attendanceStatus: "present" }, // walk-in
      {
        studentId: "e",
        bookingStatus: "cancelled",
        attendanceStatus: "unmarked",
      },
    ];
    expect(bulkMarkTargets(rows).sort()).toEqual(["a"]);
  });

  it("is empty when everyone is already marked (idempotent)", () => {
    const rows: BulkMarkRow[] = [
      { studentId: "a", bookingStatus: "booked", attendanceStatus: "present" },
      { studentId: "b", bookingStatus: "booked", attendanceStatus: "absent" },
    ];
    expect(bulkMarkTargets(rows)).toEqual([]);
  });

  it("is empty for no rows", () => {
    expect(bulkMarkTargets([])).toEqual([]);
  });
});

describe("visibleAttendees", () => {
  const attendee = (
    studentId: string,
    name: string | null,
    bookingStatus = "booked",
  ) => ({ studentId, name, bookingStatus });

  const me = { id: "me", approved: true };

  it("names booked members alphabetically, never the viewer", () => {
    const v = visibleAttendees(
      [
        attendee("u2", "Carla Mota"),
        attendee("me", "My Self"),
        attendee("u1", "Alex Silva"),
      ],
      0,
      me,
    );
    expect(v.names).toEqual(["Alex Silva", "Carla Mota"]);
    expect(v.othersCount).toBe(0);
    expect(v.namesHidden).toBe(false);
  });

  it("names pending members too, and counts drop-ins", () => {
    const v = visibleAttendees(
      [
        attendee("u1", "Alex Silva"),
        attendee("u2", "Pending Pete"),
        attendee("u3", "Pending Pam"),
      ],
      2,
      me,
    );
    expect(v.names).toEqual(["Alex Silva", "Pending Pam", "Pending Pete"]);
    expect(v.othersCount).toBe(2);
  });

  it("counts an attendee with no name rather than naming them", () => {
    const v = visibleAttendees(
      [attendee("u1", null), attendee("u2", "   ")],
      0,
      me,
    );
    expect(v.names).toEqual([]);
    expect(v.othersCount).toBe(2);
  });

  it("gives a pending viewer counts only, and says names are hidden", () => {
    const v = visibleAttendees(
      [attendee("u1", "Alex Silva"), attendee("u2", "Bruno Reis")],
      1,
      { id: "me", approved: false },
    );
    expect(v.names).toEqual([]);
    expect(v.othersCount).toBe(3);
    expect(v.namesHidden).toBe(true);
  });

  it("does not claim names are hidden when nobody else is on the class", () => {
    const v = visibleAttendees([attendee("me", "My Self")], 0, {
      id: "me",
      approved: false,
    });
    expect(v.othersCount).toBe(0);
    expect(v.namesHidden).toBe(false);
  });

  it("ignores cancelled bookings", () => {
    const v = visibleAttendees(
      [attendee("u1", "Alex Silva", "cancelled"), attendee("u2", "Bruno Reis")],
      0,
      me,
    );
    expect(v.names).toEqual(["Bruno Reis"]);
    expect(v.othersCount).toBe(0);
  });
});

describe("needsAttendance", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  const ended = (
    over: Partial<AttendanceCandidate> = {},
  ): AttendanceCandidate => ({
    status: "scheduled",
    startsAt: new Date("2026-08-15T09:00:00Z"),
    durationMinutes: 60,
    bookingCount: 4,
    pendingCount: 0,
    markedCount: 0,
    ...over,
  });

  it("flags a finished class nobody marked", () => {
    expect(needsAttendance(ended(), now)).toBe(true);
  });

  it("counts a provisional booking as somebody to mark", () => {
    expect(
      needsAttendance(ended({ bookingCount: 0, pendingCount: 1 }), now),
    ).toBe(true);
  });

  it("skips a class nobody booked — an empty register can never be marked", () => {
    expect(
      needsAttendance(ended({ bookingCount: 0, pendingCount: 0 }), now),
    ).toBe(false);
  });

  it("skips a partly marked class — no-shows are normally left unmarked", () => {
    expect(needsAttendance(ended({ markedCount: 1 }), now)).toBe(false);
  });

  it("skips a cancelled class", () => {
    expect(needsAttendance(ended({ status: "cancelled" }), now)).toBe(false);
  });

  it("skips a class that has not finished yet", () => {
    const running = ended({
      startsAt: new Date("2026-08-15T11:30:00Z"),
      durationMinutes: 60,
    });
    expect(needsAttendance(running, now)).toBe(false);
  });

  it("flags a class the moment it ends", () => {
    const justEnded = ended({
      startsAt: new Date("2026-08-15T11:00:00Z"),
      durationMinutes: 60,
    });
    expect(needsAttendance(justEnded, now)).toBe(true);
  });

  it("drops a class older than the 7-day look-back", () => {
    expect(
      needsAttendance(
        ended({ startsAt: new Date("2026-08-08T09:00:00Z") }),
        now,
      ),
    ).toBe(false);
  });

  it("keeps a class right at the edge of the look-back", () => {
    expect(
      needsAttendance(
        ended({ startsAt: new Date("2026-08-08T11:00:00Z") }),
        now,
      ),
    ).toBe(true);
  });
});

describe("attendance review", () => {
  const snapshot = {
    fingerprint: "current",
    unmarked: 0,
    present: 1,
    absent: 2,
    total: 3,
  };
  it("requires an explicit matching review", () => {
    expect(attendanceReview(snapshot, null, null).reviewed).toBe(false);
    expect(attendanceReview(snapshot, "current", new Date()).reviewed).toBe(
      true,
    );
    expect(attendanceReview(snapshot, "old", new Date()).reviewed).toBe(false);
  });
  it("refuses a stale roster and unfinished attendance", () => {
    expect(attendanceReviewError(snapshot, "old", false)).toContain("changed");
    expect(
      attendanceReviewError({ ...snapshot, unmarked: 1 }, "current", false),
    ).toContain("everyone");
  });
  it("requires explicit confirmation when nobody attended", () => {
    const empty = { ...snapshot, present: 0, absent: 0, total: 0 };
    expect(attendanceReviewError(empty, "current", false)).toContain("nobody");
    expect(attendanceReviewError(empty, "current", true)).toBeNull();
    expect(attendanceReviewError(snapshot, "current", true)).toContain(
      "present",
    );
  });
});
