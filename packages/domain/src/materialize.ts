import { fromZonedTime } from "date-fns-tz";

import { DAY_MS } from "./local-date";
import { MINUTES_PER_DAY } from "./schedule";

/**
 * DST-aware materialization math (docs/issues/08, 16). PURE — no DB, no clock
 * reading. Given a recurring template's local definition and a [from, to) window
 * of UTC instants, return each concrete occurrence's UTC start instant.
 *
 * The template stores LOCAL wall-clock (minutes from midnight in `timeZone`).
 * `fromZonedTime(localDate, tz)` converts a wall-clock time in a zone to the
 * correct UTC instant, honouring DST — so an 18:00 class is always 18:00 local,
 * whether that maps to 15:00 or 16:00 UTC across a spring/autumn transition.
 */

export interface RecurrenceSpec {
  /** 0=Sun … 6=Sat. */
  daysOfWeek: number[];
  /** Minutes from LOCAL midnight (0…1439). */
  startsAtMinutes: number;
  /** IANA zone, e.g. "Europe/Kyiv". */
  timeZone: string;
}

/** The calendar date (Y/M/D) seen in `timeZone` at a given UTC instant. */
function localDateParts(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  // en-CA yields YYYY-MM-DD; the zone does the shifting.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * The UTC instant of `startsAtMinutes` local time on the given local calendar
 * date, in `timeZone`. Built from a wall-clock string so date-fns-tz resolves
 * the zone offset (incl. DST) for us. Exported for one-off class create/reschedule
 * (slice 2.3), which need the same local→UTC rule the recurring engine uses.
 */
export function instantFromLocal(
  local: { year: number; month: number; day: number },
  startsAtMinutes: number,
  timeZone: string,
): Date {
  const hour = Math.floor(startsAtMinutes / 60);
  const minute = startsAtMinutes % 60;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  // "YYYY-MM-DDTHH:mm:ss" interpreted as wall-clock in `timeZone`.
  const wallClock = `${pad(local.year, 4)}-${pad(local.month)}-${pad(local.day)}T${pad(hour)}:${pad(minute)}:00`;
  return fromZonedTime(wallClock, timeZone);
}

/** Parse "YYYY-MM-DD" + local minutes-from-midnight → UTC instant in `timeZone`. */
export function instantFromLocalDate(
  dateISO: string,
  startsAtMinutes: number,
  timeZone: string,
): Date {
  const [year, month, day] = dateISO.split("-").map(Number);
  return instantFromLocal(
    { year: year ?? 0, month: month ?? 0, day: day ?? 0 },
    startsAtMinutes,
    timeZone,
  );
}

/**
 * All occurrence start instants in [from, to). `from` inclusive, `to` exclusive.
 *
 * Iterates over LOCAL calendar dates using a noon-UTC anchor: a Date fixed at
 * 12:00:00Z advanced by exactly 24h is pure UTC arithmetic, so it steps one
 * calendar day every time regardless of DST (noon is never near a transition).
 * For each local date whose weekday matches, the wall-clock start is converted
 * to its true UTC instant and kept if it lands in the window. This never drops
 * or doubles a class across a spring-forward / fall-back.
 */
export function computeOccurrences(
  spec: RecurrenceSpec,
  from: Date,
  to: Date,
): Date[] {
  if (spec.startsAtMinutes < 0 || spec.startsAtMinutes >= MINUTES_PER_DAY) {
    return [];
  }
  const days = new Set(spec.daysOfWeek);
  if (days.size === 0 || to <= from) return [];

  // Local calendar date at each end (± a day of slack, since a local date's
  // start instant can fall on the neighbouring UTC day).
  const startLocal = localDateParts(
    new Date(from.getTime() - DAY_MS),
    spec.timeZone,
  );
  const endLocal = localDateParts(
    new Date(to.getTime() + DAY_MS),
    spec.timeZone,
  );

  let cursor = Date.UTC(
    startLocal.year,
    startLocal.month - 1,
    startLocal.day,
    12,
  );
  const end = Date.UTC(endLocal.year, endLocal.month - 1, endLocal.day, 12);

  const result: Date[] = [];
  for (; cursor <= end; cursor += DAY_MS) {
    const anchor = new Date(cursor);
    if (!days.has(anchor.getUTCDay())) continue;
    const instant = instantFromLocal(
      {
        year: anchor.getUTCFullYear(),
        month: anchor.getUTCMonth() + 1,
        day: anchor.getUTCDate(),
      },
      spec.startsAtMinutes,
      spec.timeZone,
    );
    if (instant >= from && instant < to) result.push(instant);
  }
  return result.sort((a, b) => a.getTime() - b.getTime());
}

/** An existing concrete class, reduced to what the rebuild rule compares. */
export interface ExistingClass {
  id: string;
  /** Null for a one-off the owner entered by hand, which no template recreates. */
  templateId: string | null;
  startsAt: Date;
}

/** An instant an active template still produces. */
export interface WantedOccurrence {
  templateId: string;
  startsAt: Date;
}

/**
 * The classes a schedule rebuild removes (ADR 79): every existing row whose
 * (template, instant) pair no active template still produces. This is what
 * clears out a paused or deleted template's leftovers, and what drops the old
 * instants after a template's days or time changed.
 *
 * ONE-OFFS SURVIVE. A class with no `templateId` was entered by hand for a
 * seminar; nothing would recreate it, so nothing removes it either.
 *
 * The caller decides which rows to pass in, and passes only FUTURE ones: a past
 * class carries its attendance on the same `class_participation` row as its
 * booking, so deleting one erases history.
 */
export function staleClassIds(
  existing: ExistingClass[],
  wanted: WantedOccurrence[],
): string[] {
  const keep = new Set(
    wanted.map((w) => `${w.templateId}@${w.startsAt.getTime()}`),
  );
  return existing
    .filter(
      (c) =>
        c.templateId !== null &&
        !keep.has(`${c.templateId}@${c.startsAt.getTime()}`),
    )
    .map((c) => c.id);
}
