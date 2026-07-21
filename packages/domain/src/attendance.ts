/**
 * Pure attendance rules (spec O5, §4; docs/issues/08, 24). No I/O — the
 * attendance resolvers call these to gate marking to the backfill window and to
 * summarize who's on a class. The unified `class_participation` row carries two
 * orthogonal axes (ticket 08): booking (booked/cancelled/none) and attendance
 * (unmarked/present/absent). A walk-in = booking `none` + attendance `present`.
 */

/** How far back an owner may still fill in attendance (spec O5). */
export const ATTENDANCE_BACKFILL_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Attendance axis — mirrors the `attendance_status` DB enum. */
export type AttendanceStatus = "unmarked" | "present" | "absent";

export interface MarkableClass {
  status: string; // "scheduled" | "cancelled"
  startsAt: Date; // resolved UTC instant
  deletedAt: Date | null;
}

/**
 * Can staff mark attendance on this class right now? Allowed for a live,
 * non-deleted class from **today back to the 14-day backfill window** (spec O5).
 * The forward side allows up to ~a day ahead so tonight's not-yet-started class
 * is markable (someone standing in front of you before class); anything further
 * out is not "today / recent past". Cancelled/deleted classes are never markable.
 */
export function canMarkAttendance(c: MarkableClass, now: Date): boolean {
  if (c.deletedAt) return false;
  if (c.status === "cancelled") return false;
  const delta = c.startsAt.getTime() - now.getTime();
  if (delta > DAY_MS) return false; // too far in the future
  if (
    now.getTime() - c.startsAt.getTime() >
    ATTENDANCE_BACKFILL_DAYS * DAY_MS
  ) {
    return false; // older than the backfill window
  }
  return true;
}

export interface ParticipationRow {
  bookingStatus: string; // "booked" | "cancelled" | "none"
  bookingTier: string; // "confirmed" | "provisional"
  attendanceStatus: string; // "unmarked" | "present" | "absent"
}

export interface AttendanceCounts {
  present: number;
  absent: number;
  unmarked: number;
  /** Confirmed bookings (approved members holding a spot). */
  confirmed: number;
  /** Provisional bookings (pending members, "pending approval"). */
  provisional: number;
  /** Walk-ins — attended without a booking (`booking_status = none`). */
  walkIn: number;
}

/**
 * Summarize the participants on a class for the O5 header. Counts each axis
 * independently — a person is counted once per axis (e.g. a present confirmed
 * booking adds to both `present` and `confirmed`). Cancelled bookings are still
 * rows; they contribute to attendance counts only if actually marked.
 */
export function attendanceCounts(rows: ParticipationRow[]): AttendanceCounts {
  const c: AttendanceCounts = {
    present: 0,
    absent: 0,
    unmarked: 0,
    confirmed: 0,
    provisional: 0,
    walkIn: 0,
  };
  for (const r of rows) {
    if (r.attendanceStatus === "present") c.present++;
    else if (r.attendanceStatus === "absent") c.absent++;
    else c.unmarked++;

    if (r.bookingStatus === "none") c.walkIn++;
    else if (r.bookingStatus === "booked") {
      if (r.bookingTier === "confirmed") c.confirmed++;
      else if (r.bookingTier === "provisional") c.provisional++;
    }
  }
  return c;
}
