/**
 * Pure QR check-in rules (spec S8, §4; docs/issues/24). No I/O — the check-in
 * resolver calls `resolveCheckInClass` to turn "the academy's classes around
 * now" into the class(es) a scanner can check into. The actual book+attend write
 * lives in the resolver (it reuses the booking write + the attendance write).
 */

/** How early (before start) a student may check in — covers arriving early. */
export const CHECK_IN_EARLY_MINUTES = 60;
const MIN_MS = 60 * 1000;

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
