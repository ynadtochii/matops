/**
 * Pure QR check-in rules (spec S8, §4; docs/issues/24). No I/O — the check-in
 * resolver calls `resolveCheckInClass` to turn "the academy's classes around
 * now" into the class(es) a scanner can check into. The actual book+attend write
 * lives in the resolver (it reuses the booking write + the attendance write).
 */

/** How early (before start) a student may check in — covers arriving early. */
export const CHECK_IN_EARLY_MINUTES = 60;
const MIN_MS = 60 * 1000;

/**
 * The longest class the schedule validators accept. The fetch window below is
 * derived from it, so a long seminar cannot fall outside the rows a check-in
 * looks at while its own window is still open.
 */
export const MAX_CLASS_MINUTES = 600;

export interface CheckInClass {
  id: string;
  startsAt: Date;
  durationMinutes: number;
  status: string; // "scheduled" | "cancelled"
}

/**
 * The class(es) a person can check into right now (spec S8). A class is a
 * candidate when `now` falls in its check-in window — from
 * `CHECK_IN_EARLY_MINUTES` before it starts through the end of the class — and
 * it is not cancelled. Returns them soonest-first:
 *   - 0 → "No class right now" (the caller shows the empty state).
 *   - 1 → check straight in.
 *   - 2+ → two classes overlap; the caller asks which (docs/issues/24).
 */
export function resolveCheckInClass<T extends CheckInClass>(
  classes: T[],
  now: Date,
): T[] {
  const t = now.getTime();
  return classes
    .filter((c) => {
      if (c.status === "cancelled") return false;
      const start = c.startsAt.getTime();
      const open = start - CHECK_IN_EARLY_MINUTES * MIN_MS;
      const close = start + c.durationMinutes * MIN_MS;
      return t >= open && t < close;
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

interface CheckInWindow {
  from: Date;
  to: Date;
}

/**
 * The rows a check-in has to consider, as a bound for the query that feeds
 * `resolveCheckInClass`. It is the rule widened to whole classes: back far
 * enough that the longest class still running is included, forward only as far
 * as a class whose doors are already open.
 */
export function checkInFetchWindow(now: Date): CheckInWindow {
  return {
    from: new Date(now.getTime() - MAX_CLASS_MINUTES * MIN_MS),
    to: new Date(now.getTime() + CHECK_IN_EARLY_MINUTES * MIN_MS),
  };
}

/** Is this one class checkable into right now? The same rule, for one row. */
export function canCheckIn(c: CheckInClass, now: Date): boolean {
  return resolveCheckInClass([c], now).length === 1;
}
