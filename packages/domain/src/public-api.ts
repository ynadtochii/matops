import { formatInTimeZone } from "date-fns-tz";

import { DAY_MS } from "./local-date";

/**
 * Pure rules for the public booking API (ADR 115). The wire shape, the window
 * caps and the booking cut-off live here so the route handlers stay thin and
 * every rule has a test that does not need a database.
 *
 * The projection is the deny list made executable: `publicClassView` returns the
 * five fields the plan allows and has no way to reach capacity, counts, coach
 * or template, because it is never handed them.
 */

export const PUBLIC_API_BASE = "/api/public/v1";

/** How far ahead a caller may ask for, and how many classes come back. */
export const PUBLIC_RANGE_MAX_DAYS = 31;
export const PUBLIC_RANGE_DEFAULT_DAYS = 7;
export const PUBLIC_CLASS_LIMIT = 200;

/**
 * A booking is refused once the class is closer than this. Not a capacity rule:
 * it stops a stranger booking a class already on the mat, where nobody will see
 * the roster change. Someone at the door is a walk-in and the gym QR handles it.
 */
export const BOOKING_CUTOFF_MINUTES = 60;

export type WindowResult =
  | { ok: true; from: Date; to: Date }
  | { ok: false; field: "from" | "to"; message: string };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(value: string): Date | null {
  if (!DATE_ONLY.test(value)) return null;
  const at = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Resolve `?from=&to=` into a window. `from` defaults to now, `to` to seven days
 * after `from`, and the range is capped at 31 days so one call can never ask the
 * database to walk a year.
 */
export function publicClassWindow(
  params: { from?: string | null; to?: string | null },
  now: Date,
): WindowResult {
  let from = now;
  if (params.from) {
    const parsed = parseDay(params.from);
    if (!parsed) {
      return {
        ok: false,
        field: "from",
        message: "Use the date form YYYY-MM-DD",
      };
    }
    from = parsed;
  }
  let to = new Date(from.getTime() + PUBLIC_RANGE_DEFAULT_DAYS * DAY_MS);
  if (params.to) {
    const parsed = parseDay(params.to);
    if (!parsed) {
      return {
        ok: false,
        field: "to",
        message: "Use the date form YYYY-MM-DD",
      };
    }
    to = parsed;
  }
  if (to.getTime() <= from.getTime()) {
    return {
      ok: false,
      field: "to",
      message: "The end date must be after the start",
    };
  }
  if (to.getTime() - from.getTime() > PUBLIC_RANGE_MAX_DAYS * DAY_MS) {
    return {
      ok: false,
      field: "to",
      message: `Ask for at most ${PUBLIC_RANGE_MAX_DAYS} days at a time`,
    };
  }
  return { ok: true, from, to };
}

/**
 * Can this class still be booked? False only inside the cut-off or after the
 * class has started. Never false because a class is full: full is not a concept
 * this API has.
 */
export function isPubliclyBookable(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() - now.getTime() > BOOKING_CUTOFF_MINUTES * 60_000;
}

export interface PublicClassInput {
  id: string;
  title: string;
  discipline: string | null;
  startsAt: Date;
  durationMinutes: number;
}

export interface PublicClassView {
  id: string;
  title: string;
  discipline: string | null;
  startsAt: string;
  durationMinutes: number;
  bookable: boolean;
}

/** The academy's own zone, in the shape "2026-09-01T18:30:00+01:00". */
export function publicInstant(at: Date, timeZone: string): string {
  return formatInTimeZone(at, timeZone, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

export function publicClassView(
  cls: PublicClassInput,
  timeZone: string,
  now: Date,
): PublicClassView {
  return {
    id: cls.id,
    title: cls.title,
    discipline: cls.discipline,
    startsAt: publicInstant(cls.startsAt, timeZone),
    durationMinutes: cls.durationMinutes,
    bookable: isPubliclyBookable(cls.startsAt, now),
  };
}

/**
 * CORS: an empty allowlist means any origin, because a server-rendered page
 * sends no origin at all and a gym that has not set one should still work. A
 * non-empty list is matched exactly, scheme and port included.
 */
export function originAllowed(
  origin: string | null,
  allowlist: string[],
): boolean {
  if (allowlist.length === 0) return true;
  if (!origin) return true;
  return allowlist.includes(origin);
}

export const PUBLIC_ERROR_CODES = [
  "invalid_key",
  "origin_not_allowed",
  "public_api_disabled",
  "class_not_found",
  "class_cancelled",
  "class_closed",
  "validation_error",
  "rate_limited",
  "server_error",
] as const;
export type PublicErrorCode = (typeof PUBLIC_ERROR_CODES)[number];

export const PUBLIC_ERROR_STATUS: Record<PublicErrorCode, number> = {
  invalid_key: 401,
  origin_not_allowed: 403,
  public_api_disabled: 403,
  class_not_found: 404,
  class_cancelled: 409,
  class_closed: 409,
  validation_error: 422,
  rate_limited: 429,
  server_error: 500,
};
