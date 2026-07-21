/**
 * Pure rules for editing templates and concrete classes (spec §4 edit rules,
 * docs/issues/08, 19). No I/O — the tRPC resolvers call these to decide what to
 * propagate and whom to notify; the actual writes/notifications happen there.
 */

import { normalizeDaysOfWeek } from "./schedule";

export interface TemplateRecurrence {
  daysOfWeek: number[];
  startsAtMinutes: number;
  timeZone: string;
}

/** Same set of weekdays, order-independent. */
function sameDays(a: number[], b: number[]): boolean {
  const na = normalizeDaysOfWeek(a);
  const nb = normalizeDaysOfWeek(b);
  return na.length === nb.length && na.every((d, i) => d === nb[i]);
}

/**
 * Did an edit change WHEN a template's classes fall (days / start / zone)?
 * A timing change moves or adds/removes occurrences, so future non-cancelled
 * instances must be regenerated. Content-only changes (title, discipline,
 * instructor, capacity, duration) can be updated in place instead — preserving
 * the rows (and, from Phase 3, their bookings).
 */
export function templateTimingChanged(
  before: TemplateRecurrence,
  after: TemplateRecurrence,
): boolean {
  return (
    before.startsAtMinutes !== after.startsAtMinutes ||
    before.timeZone !== after.timeZone ||
    !sameDays(before.daysOfWeek, after.daysOfWeek)
  );
}

export interface ClassNotifiable {
  /** UTC start instant. */
  startsAt: Date;
  instructorId: string;
}

export interface ClassChange {
  timeChanged: boolean;
  instructorChanged: boolean;
  /** Booked students are notified when the time OR instructor changes (§4). */
  shouldNotify: boolean;
}

/**
 * What changed on a single class edit, and whether it warrants notifying booked
 * students (Phase 4 sends; this only decides). Time compares the absolute UTC
 * instant, so a no-op re-save does not spam.
 */
export function classChange(
  before: ClassNotifiable,
  after: ClassNotifiable,
): ClassChange {
  const timeChanged = before.startsAt.getTime() !== after.startsAt.getTime();
  const instructorChanged = before.instructorId !== after.instructorId;
  return {
    timeChanged,
    instructorChanged,
    shouldNotify: timeChanged || instructorChanged,
  };
}
