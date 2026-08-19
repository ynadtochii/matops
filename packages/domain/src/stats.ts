import { DAY_LABELS } from "./schedule";

/**
 * @matops/domain/stats — attendance-derived personal & gym statistics (v1.2).
 * PURE — no I/O, no DB, no clock reading. The single engine behind the student
 * "My Training" card (B.1), the owner gym insights + "who's drifting" widget
 * (C.1), the drift signal, and the tabbed member-detail totals (C.2).
 *
 * A "session" is one attended class — a `class_participation` row with
 * `attendance_status = 'present'`, joined to its `class` for time/title/
 * discipline. Same basis as the member list's `visitCount`. Bookings without a
 * present mark do NOT count (docs/issues/39).
 *
 * Week and month boundaries are computed in the ACADEMY time zone (passed in),
 * never a per-user zone (spec §4). `class.starts_at` is a UTC instant; the
 * academy carries an IANA zone. Weeks start on Sunday, matching `DAY_LABELS`
 * (0 = Sun … 6 = Sat).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The local calendar view of a UTC instant in an IANA zone. */
interface LocalDate {
  /** Whole days since 1970-01-01 in the local zone (calendar-day index). */
  dayNumber: number;
  /** Sunday-aligned week bucket: same value for every day of one local week. */
  weekBucket: number;
  /** Calendar-month bucket: `year * 12 + (month - 1)`. */
  monthBucket: number;
  /** Local weekday, 0 = Sun … 6 = Sat (matches `DAY_LABELS`). */
  weekday: number;
}

/**
 * Project a UTC instant onto its local calendar in `timeZone`. Uses the same
 * `Intl.DateTimeFormat("en-CA")` part-extraction as `materialize.ts` — the zone
 * does the shifting, then plain UTC arithmetic on the parts gives DST-safe day
 * and week indices (noon is never near a transition, and we only index days).
 */
function localDate(instant: Date, timeZone: string): LocalDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
  return {
    dayNumber,
    // 1970-01-04 (day 3) is a Sunday; +4 aligns bucket edges to Sundays.
    weekBucket: Math.floor((dayNumber + 4) / 7),
    monthBucket: year * 12 + (month - 1),
    // 1970-01-01 (day 0) is a Thursday (weekday 4).
    weekday: ((((dayNumber % 7) + 4) % 7) + 7) % 7,
  };
}

/**
 * Calendar-month index of an instant in `timeZone` (`year * 12 + month - 1`).
 * Consecutive months differ by one, so callers compare growth month over month
 * without any date arithmetic of their own.
 */
export function monthBucket(instant: Date, timeZone: string): number {
  return localDate(instant, timeZone).monthBucket;
}

/** Pick the key with the highest count; ties keep the first-seen key. */
function topKey<K>(counts: Map<K, number>): K | null {
  let best: K | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

/** One attended session — the input to `trainingStats`. */
export interface Session {
  /** UTC instant the class started. */
  startsAt: Date;
  /** Class discipline (e.g. "BJJ"); may be null if the class set none. */
  discipline: string | null;
  /** Class title. */
  title: string;
}

/** The student's personal training summary (B.1, C.2). */
export interface TrainingStats {
  /** Total attended sessions at this academy. */
  total: number;
  /** Attended sessions in the current calendar month (academy zone). */
  thisMonth: number;
  /** Consecutive calendar weeks (ending at the latest attended week) with ≥1 session. */
  streakWeeks: number;
  /** Most-attended discipline, or null if none recorded. */
  favoriteDiscipline: string | null;
  /** Most-attended weekday, 0 = Sun … 6 = Sat (`DAY_LABELS`), or null if no sessions. */
  favoriteWeekday: number | null;
  /** Whole days since the last attended session (academy zone), or null if none. */
  daysSinceLastClass: number | null;
}

/**
 * Summarize a student's attended sessions. Empty input yields an all-zero /
 * null summary (the mobile card shows its empty state instead).
 *
 * Streak = consecutive Sunday-start weeks ending at the most recent attended
 * week. It stays alive only if that most recent week is THIS week or LAST week;
 * an older latest week means the streak already broke (result 0). A mid-week gap
 * never breaks it — one session anywhere in a week keeps that week.
 */
export function trainingStats(
  sessions: Session[],
  now: Date,
  timeZone: string,
): TrainingStats {
  if (sessions.length === 0) {
    return {
      total: 0,
      thisMonth: 0,
      streakWeeks: 0,
      favoriteDiscipline: null,
      favoriteWeekday: null,
      daysSinceLastClass: null,
    };
  }

  const nowLocal = localDate(now, timeZone);
  const attendedWeeks = new Set<number>();
  const disciplineCounts = new Map<string, number>();
  const weekdayCounts = new Map<number, number>();
  let thisMonth = 0;
  let lastDayNumber = -Infinity;

  for (const s of sessions) {
    const local = localDate(s.startsAt, timeZone);
    attendedWeeks.add(local.weekBucket);
    weekdayCounts.set(
      local.weekday,
      (weekdayCounts.get(local.weekday) ?? 0) + 1,
    );
    const discipline = s.discipline?.trim();
    if (discipline) {
      disciplineCounts.set(
        discipline,
        (disciplineCounts.get(discipline) ?? 0) + 1,
      );
    }
    if (local.monthBucket === nowLocal.monthBucket) thisMonth += 1;
    if (local.dayNumber > lastDayNumber) lastDayNumber = local.dayNumber;
  }

  // Streak: only alive if the latest attended week is this week or last week.
  const latestWeek = Math.max(...attendedWeeks);
  let streakWeeks = 0;
  if (latestWeek >= nowLocal.weekBucket - 1) {
    for (let w = latestWeek; attendedWeeks.has(w); w -= 1) streakWeeks += 1;
  }

  return {
    total: sessions.length,
    thisMonth,
    streakWeeks,
    favoriteDiscipline: topKey(disciplineCounts),
    favoriteWeekday: topKey(weekdayCounts),
    daysSinceLastClass: nowLocal.dayNumber - lastDayNumber,
  };
}

/** Attendance-recency band for a member (C.1 "who's drifting", C.2 detail). */
export type DriftStatus = "active" | "cooling" | "at_risk" | "dormant";

/**
 * Lower day-bounds (inclusive) for each drift band, measured from the last
 * attended session. Below `cooling` ⇒ active. Constants live here so the API and
 * both clients agree (docs/issues/39).
 */
export const DRIFT_THRESHOLDS = {
  /** 8–13 days since last class. */
  cooling: 8,
  /** 14–27 days. */
  at_risk: 14,
  /** 28+ days. */
  dormant: 28,
} as const;

/**
 * Band a member by how long since they last attended. A null last-date (never
 * attended) is `dormant`. Uses whole elapsed days (floored), not calendar days —
 * the exact boundary hour does not matter at these week-scale thresholds.
 */
export function classifyDrift(
  lastAttendanceDate: Date | null,
  now: Date,
): DriftStatus {
  if (!lastAttendanceDate) return "dormant";
  const days = Math.floor(
    (now.getTime() - lastAttendanceDate.getTime()) / DAY_MS,
  );
  if (days >= DRIFT_THRESHOLDS.dormant) return "dormant";
  if (days >= DRIFT_THRESHOLDS.at_risk) return "at_risk";
  if (days >= DRIFT_THRESHOLDS.cooling) return "cooling";
  return "active";
}

/** One attendance-marked participation — the input to `gymInsights`. */
export interface MarkedParticipation {
  /** UTC instant the class started. */
  startsAt: Date;
  /** Class title. */
  title: string;
  /** Class discipline, so `busiest` can be read by category (ADR 53). */
  discipline: string | null;
  /** Owner/coach mark. Only these two states feed the rate. */
  status: "present" | "absent";
}

/** A class ranked by attendance (part of `GymInsights`). */
export interface BusiestClass {
  title: string;
  /** First discipline seen for this title — the colour encoder on the O1 list. */
  discipline: string | null;
  count: number;
}

/** The owner's gym-activity summary over the query window (C.1). */
export interface GymInsights {
  /** Present marks in the current week (academy zone). */
  visitsThisWeek: number;
  /**
   * Present marks in the week before this one, counted only up to the **same
   * point** in that week. `visitsThisWeek` is a part-week until Saturday night,
   * so measuring it against a whole previous week reported a collapse every day
   * of the week. Wednesday noon is compared with last Wednesday noon.
   */
  visitsLastWeek: number;
  /** Present marks in the current calendar month (academy zone). */
  visitsThisMonth: number;
  /**
   * present ÷ (present + absent) over the window, or null when no absent marks
   * exist. Many gyms never mark absent, which would force a meaningless 100% —
   * so the UI hides the rate and leads with counts instead.
   */
  attendanceRate: number | null;
  /** Classes by present count, most-attended first. */
  busiest: BusiestClass[];
  /** Present marks per weekday, index 0 = Sun … 6 = Sat (`DAY_LABELS`). */
  byWeekday: number[];
}

/**
 * Summarize a gym's marked attendance. Only `present` marks count as visits;
 * `absent` marks feed only the rate. Busiest and per-weekday breakdowns use
 * present marks. Empty input yields zeros and a null rate.
 */
export function gymInsights(
  marked: MarkedParticipation[],
  now: Date,
  timeZone: string,
): GymInsights {
  const nowLocal = localDate(now, timeZone);
  // The same clock position one week back: last week's visits are counted only
  // this far in, so both sides cover the same slice of a week.
  const samePointLastWeek = now.getTime() - 7 * DAY_MS;
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  const titleCounts = new Map<string, number>();
  const titleDiscipline = new Map<string, string | null>();
  let visitsThisWeek = 0;
  let visitsLastWeek = 0;
  let visitsThisMonth = 0;
  let present = 0;
  let absent = 0;

  for (const m of marked) {
    if (m.status === "absent") {
      absent += 1;
      continue;
    }
    present += 1;
    const local = localDate(m.startsAt, timeZone);
    byWeekday[local.weekday] = (byWeekday[local.weekday] ?? 0) + 1;
    titleCounts.set(m.title, (titleCounts.get(m.title) ?? 0) + 1);
    if (!titleDiscipline.has(m.title))
      titleDiscipline.set(m.title, m.discipline);
    if (local.weekBucket === nowLocal.weekBucket) visitsThisWeek += 1;
    if (
      local.weekBucket === nowLocal.weekBucket - 1 &&
      m.startsAt.getTime() <= samePointLastWeek
    ) {
      visitsLastWeek += 1;
    }
    if (local.monthBucket === nowLocal.monthBucket) visitsThisMonth += 1;
  }

  const busiest = [...titleCounts.entries()]
    .map(([title, count]) => ({
      title,
      discipline: titleDiscipline.get(title) ?? null,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    visitsThisWeek,
    visitsLastWeek,
    visitsThisMonth,
    attendanceRate: absent === 0 ? null : present / (present + absent),
    busiest,
    byWeekday,
  };
}

/** Minimum shape `splitMyClasses` needs; extra fields flow through unchanged. */
interface MyClassRow {
  startsAt: Date;
  bookingStatus: string;
  attendanceStatus: string;
}

/**
 * Split the caller's participations into Upcoming and Past (mobile Training tab,
 * B.2). Upcoming = still booked and not yet started (confirmed + provisional,
 * ascending). Past = actually attended and already started (present, most-recent
 * first). Rows that are neither (e.g. a cancelled future booking) drop out.
 */
export function splitMyClasses<T extends MyClassRow>(
  rows: T[],
  now: Date,
): { upcoming: T[]; past: T[] } {
  const upcoming = rows
    .filter((r) => r.bookingStatus === "booked" && r.startsAt >= now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = rows
    .filter((r) => r.attendanceStatus === "present" && r.startsAt < now)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  return { upcoming, past };
}

/**
 * The earliest still-upcoming class, for the mobile next-class card (C). Filters
 * `startsAt >= now` defensively even though `splitMyClasses` already did. Returns
 * null when nothing is upcoming.
 */
export function nextClass<T extends { startsAt: Date }>(
  upcoming: T[],
  now: Date,
): T | null {
  let next: T | null = null;
  for (const row of upcoming) {
    if (row.startsAt < now) continue;
    if (!next || row.startsAt < next.startsAt) next = row;
  }
  return next;
}

// Re-export so clients can label `favoriteWeekday` / `byWeekday` without a
// second import path.
export { DAY_LABELS };
