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

interface CheckInClass {
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

const CHECK_IN_LINK = /\/checkin\/([A-Za-z0-9_-]{1,64})\/?(?:[?#].*)?$/;

/**
 * The academy id inside a scanned check-in QR, or `null` for anything else.
 * Accepts both `https://<host>/checkin/<id>` and `matops://checkin/<id>`. A regex
 * rather than `new URL()`: Hermes does not parse custom schemes.
 */
export function parseCheckInLink(value: string): string | null {
  return CHECK_IN_LINK.exec(value.trim())?.[1] ?? null;
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

const VISITOR_LOOKAHEAD_MINUTES = 24 * 60;
export const VISITOR_UPCOMING_LIMIT = 6;

export function visitorFetchWindow(now: Date): CheckInWindow {
  return {
    from: checkInFetchWindow(now).from,
    to: new Date(now.getTime() + VISITOR_LOOKAHEAD_MINUTES * MIN_MS),
  };
}

interface VisitorClassChoices<T extends CheckInClass> {
  now: T[];
  upcoming: T[];
}

/**
 * What a visitor at the gym QR may pick. `now` is the check-in set, so picking
 * one means they are here and get marked present. `upcoming` is everything
 * later they could book instead, for someone who walks in between classes.
 *
 * A class starting within the next hour is in the check-in window already, so
 * it is dropped from `upcoming` by id: offering the same class twice, once to
 * attend and once to book, is a choice nobody can answer.
 */
export function visitorClassChoices<T extends CheckInClass>(
  classes: T[],
  now: Date,
): VisitorClassChoices<T> {
  const open = resolveCheckInClass(classes, now);
  const openIds = new Set(open.map((c) => c.id));
  const upcoming = classes
    .filter(
      (c) =>
        c.status !== "cancelled" &&
        !openIds.has(c.id) &&
        c.startsAt.getTime() > now.getTime(),
    )
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, VISITOR_UPCOMING_LIMIT);
  return { now: open, upcoming };
}
