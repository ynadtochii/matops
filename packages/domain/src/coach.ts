import type { Membership } from "./access";
import type { LocalDate } from "./local-date";
import { isOwner, isStaff } from "./access";
import { DAY_MS, localDate } from "./local-date";
import { instantFromLocalDate } from "./materialize";

/**
 * @matops/domain/coach — per-coach workload & coverage (v2.5, spec O10).
 * PURE — no I/O, no DB, no clock reading. The engine behind the O10 Coaches
 * screen. The O1 "classes to mark" queue is NOT here: it runs on
 * `needsAttendance` in `attendance.ts`, and there is only one definition of
 * "unmarked" (ADR 62, Consequences).
 *
 * Credit is automatic and read-time: a class counts for whoever sits in its
 * `instructor_id` right now. There is no separate "did you teach this" mark, so
 * reassigning a past class moves its history to the new coach — the same rule
 * ADR 52 chose for referral corrections.
 *
 * Definitions the whole feature agrees on:
 *   - LED    — not cancelled, not soft-deleted, and already ENDED
 *              (`starts_at + duration <= now`).
 *   - MARKED — the class carries at least one attendance mark, present or absent.
 *   - VISIT  — a `present` participation, the same basis as `stats.ts` and the
 *              roster `visitCount` (ADR 39), so O10 never disagrees with O5.
 *              Drop-ins are NOT visits: they have no participation row.
 *
 * Averages divide by MARKED classes, never by all led classes. A gym that
 * forgets to take attendance would otherwise see every coach's headcount decay
 * toward zero, which reads as a broken screen rather than a missing mark.
 */

/** One class in the read window, in whatever state it ended up. */
export interface CoachClass {
  id: string;
  /** Who is credited — `class.instructor_id` as it stands now. */
  instructorId: string;
  /** UTC instant the class started. */
  startsAt: Date;
  durationMinutes: number;
  title: string;
  discipline: string | null;
  cancelled: boolean;
}

/** One attendance-marked participation, joined to its class. */
export interface ClassMark {
  classId: string;
  studentId: string;
  status: "present" | "absent";
}

/** A resolved window of instants, `from` inclusive and `to` exclusive. */
export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * The window the O10 screen offers. Calendar months are resolved in the academy
 * zone; rolling days are a plain instant subtraction and need no zone.
 */
export type CoachWindow =
  { kind: "month"; monthsBack: number } | { kind: "rollingDays"; days: number };

/** The three windows the O10 screen offers, as stable keys both clients use. */
export type CoachWindowKey = "this_month" | "last_month" | "last_90_days";

/**
 * Key → window. Lives here so the API and the screen cannot disagree about what
 * "last 90 days" means.
 */
export const COACH_WINDOWS: Record<CoachWindowKey, CoachWindow> = {
  this_month: { kind: "month", monthsBack: 0 },
  last_month: { kind: "month", monthsBack: 1 },
  last_90_days: { kind: "rollingDays", days: 90 },
};

/** The rows and window every aggregate reads. */
export interface CoachInput {
  classes: CoachClass[];
  marks: ClassMark[];
  now: Date;
  range: DateRange;
}

/** `CoachInput` plus the staff roster the whole-gym roster view needs. */
export interface CoachRosterInput extends CoachInput {
  /**
   * Active staff, in the order the caller wants them back. Every id gets a row
   * even with no classes, so the screen shows a coach who taught nothing.
   */
  instructorIds: string[];
}

/** One coach's totals over the window (O10 roster card). */
export interface CoachWorkload {
  instructorId: string;
  classesLed: number;
  minutesLed: number;
  markedClasses: number;
  visitsTaught: number;
  distinctStudents: number;
  /** Visits ÷ MARKED classes, or null when nothing was marked. */
  avgHeadcount: number | null;
  /** Marked ÷ led, or null when nothing was led. The data-hygiene signal. */
  markedRate: number | null;
  /** Classes cancelled whose slot has already passed. */
  cancelled: number;
}

/** One class title a coach taught, in the per-coach breakdown. */
export interface CoachClassGroup {
  title: string;
  /** First discipline seen for this title, matching the `gymInsights` rule. */
  discipline: string | null;
  classesLed: number;
  markedClasses: number;
  visitsTaught: number;
  avgHeadcount: number | null;
}

/** One led class in the per-coach recent list. */
export interface CoachClassSummary {
  classId: string;
  startsAt: Date;
  title: string;
  discipline: string | null;
  durationMinutes: number;
  headcount: number;
  marked: boolean;
}

/** The per-coach detail behind a roster card. */
export interface CoachBreakdown {
  byClass: CoachClassGroup[];
  /** Classes led per weekday, index 0 = Sun … 6 = Sat (`DAY_LABELS`). */
  byWeekday: number[];
  /** Contiguous Sunday-start weeks across the window, oldest first. */
  byWeek: { weekBucket: number; classesLed: number }[];
  /** Led classes, most recent first. */
  recent: CoachClassSummary[];
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** First instant of a calendar-month bucket, in the academy zone. */
function monthStart(bucket: number, timeZone: string): Date {
  const year = Math.floor(bucket / 12);
  const month = (bucket % 12) + 1;
  return instantFromLocalDate(
    `${pad(year, 4)}-${pad(month, 2)}-01`,
    0,
    timeZone,
  );
}

/**
 * Resolve a window selection into instants the SQL layer and the aggregates can
 * both use. `monthsBack: 0` is the current month, `1` the one before it.
 */
export function coachWindowRange(
  window: CoachWindow,
  now: Date,
  timeZone: string,
): DateRange {
  if (window.kind === "rollingDays") {
    return { from: new Date(now.getTime() - window.days * DAY_MS), to: now };
  }
  const bucket = localDate(now, timeZone).monthBucket - window.monthsBack;
  return {
    from: monthStart(bucket, timeZone),
    to: monthStart(bucket + 1, timeZone),
  };
}

interface ClassMarkSummary {
  present: number;
  marked: number;
  students: string[];
}

function summarizeMarks(marks: ClassMark[]): Map<string, ClassMarkSummary> {
  const byClass = new Map<string, ClassMarkSummary>();
  for (const m of marks) {
    let summary = byClass.get(m.classId);
    if (!summary) {
      summary = { present: 0, marked: 0, students: [] };
      byClass.set(m.classId, summary);
    }
    summary.marked += 1;
    if (m.status === "present") {
      summary.present += 1;
      summary.students.push(m.studentId);
    }
  }
  return byClass;
}

function inRange(instant: Date, range: DateRange): boolean {
  const t = instant.getTime();
  return t >= range.from.getTime() && t < range.to.getTime();
}

function hasEnded(c: CoachClass, now: Date): boolean {
  return c.startsAt.getTime() + c.durationMinutes * 60_000 <= now.getTime();
}

/** A class that counts as led: in window, not cancelled, already finished. */
function isLed(c: CoachClass, now: Date, range: DateRange): boolean {
  return inRange(c.startsAt, range) && !c.cancelled && hasEnded(c, now);
}

const ratio = (numerator: number, denominator: number) =>
  denominator === 0 ? null : numerator / denominator;

/** One coach's totals; the single place a coach's numbers are computed. */
function summarize(
  instructorId: string,
  classes: CoachClass[],
  markSummary: Map<string, ClassMarkSummary>,
  now: Date,
  range: DateRange,
): CoachWorkload {
  const students = new Set<string>();
  let classesLed = 0;
  let minutesLed = 0;
  let markedClasses = 0;
  let visitsTaught = 0;
  let cancelled = 0;

  for (const c of classes) {
    if (c.instructorId !== instructorId) continue;
    if (!inRange(c.startsAt, range)) continue;
    if (c.cancelled) {
      if (c.startsAt.getTime() < now.getTime()) cancelled += 1;
      continue;
    }
    if (!hasEnded(c, now)) continue;
    classesLed += 1;
    minutesLed += c.durationMinutes;
    const summary = markSummary.get(c.id);
    if (!summary || summary.marked === 0) continue;
    markedClasses += 1;
    visitsTaught += summary.present;
    for (const s of summary.students) students.add(s);
  }

  return {
    instructorId,
    classesLed,
    minutesLed,
    markedClasses,
    visitsTaught,
    distinctStudents: students.size,
    avgHeadcount: ratio(visitsTaught, markedClasses),
    markedRate: ratio(markedClasses, classesLed),
    cancelled,
  };
}

/**
 * Totals per coach over the window. Rows come back in `instructorIds` order,
 * followed by any coach who appears on a class but is no longer on the roster —
 * dropping those would make the per-coach figures stop adding up to the gym's.
 */
export function coachWorkload(input: CoachRosterInput): CoachWorkload[] {
  const markSummary = summarizeMarks(input.marks);
  const rostered = new Set(input.instructorIds);
  const extras = [
    ...new Set(
      input.classes
        .filter(
          (c) =>
            inRange(c.startsAt, input.range) && !rostered.has(c.instructorId),
        )
        .map((c) => c.instructorId),
    ),
  ].sort();
  return [...input.instructorIds, ...extras].map((id) =>
    summarize(id, input.classes, markSummary, input.now, input.range),
  );
}

/** One coach's totals, without inventing a roster to ask for them. */
export function coachWorkloadFor(
  input: CoachInput,
  instructorId: string,
): CoachWorkload {
  return summarize(
    instructorId,
    input.classes,
    summarizeMarks(input.marks),
    input.now,
    input.range,
  );
}

/**
 * One coach's detail. `byWeek` is contiguous — every week the window touches is
 * present, zeros included, so a trend line never closes a gap it should show.
 * The series stops at `now`: a month window runs past today, and weeks that have
 * not happened yet are not zero-attendance weeks.
 *
 * `range.to` is EXCLUSIVE, so the last bucket is read one millisecond before it.
 * A month whose successor starts on a Sunday would otherwise add a trailing week
 * the window never touched.
 */
export function coachBreakdown(
  input: CoachInput & { instructorId: string; timeZone: string },
): CoachBreakdown {
  const { classes, marks, instructorId, now, range, timeZone } = input;
  const markSummary = summarizeMarks(marks);
  const led = classes
    .filter((c) => c.instructorId === instructorId && isLed(c, now, range))
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());

  const groups = new Map<string, CoachClassGroup>();
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  const weekCounts = new Map<number, number>();
  const recent: CoachClassSummary[] = [];

  for (const c of led) {
    const summary = markSummary.get(c.id);
    const marked = (summary?.marked ?? 0) > 0;
    const present = summary?.present ?? 0;
    let group = groups.get(c.title);
    if (!group) {
      group = {
        title: c.title,
        discipline: c.discipline,
        classesLed: 0,
        markedClasses: 0,
        visitsTaught: 0,
        avgHeadcount: null,
      };
      groups.set(c.title, group);
    }
    group.classesLed += 1;
    if (marked) {
      group.markedClasses += 1;
      group.visitsTaught += present;
    }
    const local: LocalDate = localDate(c.startsAt, timeZone);
    byWeekday[local.weekday] = (byWeekday[local.weekday] ?? 0) + 1;
    weekCounts.set(
      local.weekBucket,
      (weekCounts.get(local.weekBucket) ?? 0) + 1,
    );
    recent.push({
      classId: c.id,
      startsAt: c.startsAt,
      title: c.title,
      discipline: c.discipline,
      durationMinutes: c.durationMinutes,
      headcount: present,
      marked,
    });
  }

  const seriesEnd = new Date(Math.min(range.to.getTime(), now.getTime()));
  const firstWeek = localDate(range.from, timeZone).weekBucket;
  const lastWeek = localDate(
    new Date(Math.max(seriesEnd.getTime() - 1, range.from.getTime())),
    timeZone,
  ).weekBucket;
  const byWeek: { weekBucket: number; classesLed: number }[] = [];
  for (let w = firstWeek; w <= lastWeek; w += 1) {
    byWeek.push({ weekBucket: w, classesLed: weekCounts.get(w) ?? 0 });
  }

  return {
    byClass: [...groups.values()]
      .map((g) => ({
        ...g,
        avgHeadcount: ratio(g.visitsTaught, g.markedClasses),
      }))
      .sort(
        (a, b) => b.classesLed - a.classesLed || a.title.localeCompare(b.title),
      ),
    byWeekday,
    byWeek,
    recent,
  };
}

/** Minutes on the mat as "3h 30m" / "2h" / "45m". Zero reads as "0m". */
export function formatMatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/**
 * May this member change who is credited for a class (K.2)?
 *
 * Scheduling is already a staff job, so any staff member may set the coach on a
 * class that has not started. Once it has started the field is reported history,
 * and changing it silently moves last month's numbers — so that is owner-only,
 * mirroring the ADR 52 rule where any staff records a referral but only an owner
 * corrects one.
 */
export function canReassignCoach(
  membership: Membership,
  classStartsAt: Date,
  now: Date,
): boolean {
  if (!isStaff(membership)) return false;
  if (classStartsAt.getTime() > now.getTime()) return true;
  return isOwner(membership);
}
