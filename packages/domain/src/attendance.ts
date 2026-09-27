import type { BookingTier } from "./booking";
import { classEndsAt } from "./dashboard";
import { DAY_MS } from "./local-date";

/**
 * Pure attendance rules (spec O5, §4; docs/issues/08, 24). No I/O — the
 * attendance resolvers call these to gate marking to the backfill window and to
 * summarize who's on a class. The unified `class_participation` row carries two
 * orthogonal axes (ticket 08): booking (booked/cancelled/none) and attendance
 * (unmarked/present/absent). A walk-in = booking `none` + attendance `present`.
 */

/** How far back an owner may still fill in attendance (spec O5). */
const ATTENDANCE_BACKFILL_DAYS = 14;

/** Attendance axis — mirrors the `attendance_status` DB enum. */
type AttendanceStatus = "unmarked" | "present" | "absent";

/** Booking axis — mirrors the `booking_status` DB enum. */
type BookingStatus = "booked" | "cancelled" | "none";

interface MarkableClass {
  status: string; // "scheduled" | "cancelled"
  startsAt: Date; // resolved UTC instant
  deletedAt: Date | null;
}

type AttendanceWriteAccess = "allowed" | "reason-required" | "closed";

export function attendanceWriteAccess(
  c: MarkableClass,
  now: Date,
  mayCorrectHistory: boolean,
): AttendanceWriteAccess {
  if (c.deletedAt || c.status === "cancelled") return "closed";
  const delta = c.startsAt.getTime() - now.getTime();
  if (delta > DAY_MS) return "closed";
  if (
    now.getTime() - c.startsAt.getTime() <=
    ATTENDANCE_BACKFILL_DAYS * DAY_MS
  ) {
    return "allowed";
  }
  return mayCorrectHistory ? "reason-required" : "closed";
}

/** How far back the dashboard hunts for classes nobody ever marked. */
export const UNMARKED_LOOKBACK_DAYS = 7;

export interface AttendanceCandidate {
  status: string; // "scheduled" | "cancelled"
  startsAt: Date; // resolved UTC instant
  durationMinutes: number;
  bookingCount: number; // confirmed bookings
  pendingCount: number; // provisional bookings (a pending member's)
  markedCount: number; // participations already marked present or absent
}

/**
 * Did this class finish without anyone marking the register (spec O1)? Every
 * later number the gym reads — visits, attendance rate, the drift bands that
 * decide who gets chased — is built on marks, so a forgotten class quietly
 * corrupts all of them.
 *
 * A class only counts as unmarked once it has **ended**, is live, and somebody
 * had actually booked it. A class nobody booked is skipped on purpose: there is
 * no way to mark an empty register, so flagging it would leave an item in the
 * dashboard queue that can never be cleared, and an owner who learns the queue
 * lies stops reading it. A partly marked class is skipped too — leaving the
 * no-shows unmarked is how coaches normally work.
 */
export function needsAttendance(c: AttendanceCandidate, now: Date): boolean {
  if (c.status === "cancelled") return false;
  if (c.markedCount > 0) return false;
  if (c.bookingCount + c.pendingCount === 0) return false;
  const endedAt = classEndsAt(c);
  if (endedAt > now.getTime()) return false;
  return now.getTime() - endedAt <= UNMARKED_LOOKBACK_DAYS * DAY_MS;
}

export interface ParticipationRow {
  bookingStatus: BookingStatus;
  bookingTier: BookingTier;
  attendanceStatus: AttendanceStatus;
}

/** A participation row reduced to what bulk marking needs (F.2). */
export interface BulkMarkRow {
  studentId: string; // user.id
  bookingStatus: BookingStatus;
  attendanceStatus: AttendanceStatus;
}

/**
 * The student ids to flip to `present` for a "mark all present" bulk action
 * (v1.3, F.2 — spec O5). Targets are the **booked but still unmarked** rows: the
 * people who reserved a spot and haven't been marked yet. Deliberately leaves
 * explicit **absent** marks alone (the staff set those on purpose) and never
 * touches walk-ins (booking `none`, already present) or already-present rows.
 * Idempotent: re-running after everyone is marked returns an empty list.
 */
export function bulkMarkTargets(rows: BulkMarkRow[]): string[] {
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.bookingStatus === "booked" && r.attendanceStatus === "unmarked") {
      ids.add(r.studentId);
    }
  }
  return [...ids];
}

interface AttendanceCounts {
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
    else if (r.bookingStatus === "booked") c[r.bookingTier]++;
  }
  return c;
}

export interface AttendanceReviewSnapshot {
  fingerprint: string;
  unmarked: number;
  present: number;
  absent: number;
  total: number;
}

export function attendanceReview(
  snapshot: AttendanceReviewSnapshot,
  savedFingerprint: string | null,
  reviewedAt: Date | null,
) {
  const reviewed =
    reviewedAt !== null && savedFingerprint === snapshot.fingerprint;
  return { ...snapshot, reviewed, reviewedAt: reviewed ? reviewedAt : null };
}

export function attendanceReviewError(
  snapshot: AttendanceReviewSnapshot,
  expectedFingerprint: string,
  nobodyAttended: boolean,
): string | null {
  if (snapshot.fingerprint !== expectedFingerprint)
    return "Attendance changed. Review the latest list and try again.";
  if (snapshot.unmarked > 0)
    return "Mark everyone present or absent before finishing attendance.";
  if (nobodyAttended && snapshot.present > 0)
    return "Someone is marked present. Correct their attendance first.";
  if (!nobodyAttended && snapshot.present === 0)
    return "Confirm that nobody attended this class.";
  return null;
}
