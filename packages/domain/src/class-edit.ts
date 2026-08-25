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

export interface TemplateContent {
  title: string;
  discipline: string | null;
  instructorId: string;
  durationMinutes: number;
  capacity: number;
}

/**
 * What an owner's template edit costs. `regenerate` cancels the future
 * instances and re-materializes, reviving the ones the new timing still covers;
 * `update-in-place` rewrites their content and keeps every row; `none` means the
 * save changed nothing, which is worth knowing because both other paths write to
 * every future class the template owns.
 */
export type TemplateEditStrategy = "regenerate" | "update-in-place" | "none";

export function templateContentChanged(
  before: TemplateContent,
  after: TemplateContent,
): boolean {
  return (
    before.title !== after.title ||
    before.discipline !== after.discipline ||
    before.instructorId !== after.instructorId ||
    before.durationMinutes !== after.durationMinutes ||
    before.capacity !== after.capacity
  );
}

export function templateEditStrategy(
  before: TemplateRecurrence & TemplateContent,
  after: TemplateRecurrence & TemplateContent,
): TemplateEditStrategy {
  if (templateTimingChanged(before, after)) return "regenerate";
  return templateContentChanged(before, after) ? "update-in-place" : "none";
}

export interface ClassNotifiable {
  /** UTC start instant. */
  startsAt: Date;
  instructorId: string;
}

export interface ClassChange {
  timeChanged: boolean;
  instructorChanged: boolean;
  /** Both the old and the new start are in the past: this edit rewrites history. */
  historyOnly: boolean;
  /** Booked students are notified when the time OR instructor changes (§4). */
  shouldNotify: boolean;
}

/**
 * What changed on a single class edit, and whether it warrants notifying booked
 * students (Phase 4 sends; this only decides). Time compares the absolute UTC
 * instant, so a no-op re-save does not spam.
 *
 * An edit where BOTH the old and the new start are in the past notifies nobody.
 * Correcting who taught last Tuesday (K.2) is bookkeeping, and pushing "your
 * class changed" for a class that already finished is noise a student cannot act
 * on. `now` is required rather than optional so every call site has to decide.
 */
export function classChange(
  before: ClassNotifiable,
  after: ClassNotifiable,
  now: Date,
): ClassChange {
  const timeChanged = before.startsAt.getTime() !== after.startsAt.getTime();
  const instructorChanged = before.instructorId !== after.instructorId;
  const historyOnly =
    before.startsAt.getTime() <= now.getTime() &&
    after.startsAt.getTime() <= now.getTime();
  return {
    timeChanged,
    instructorChanged,
    historyOnly,
    shouldNotify: (timeChanged || instructorChanged) && !historyOnly,
  };
}
