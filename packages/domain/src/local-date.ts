import { fromZonedTime } from "date-fns-tz";

import { dayKey } from "./format";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The local calendar view of a UTC instant in an IANA zone. */
export interface LocalDate {
  /** Whole days since 1970-01-01 in the local zone (calendar-day index). */
  dayNumber: number;
  /** Sunday-aligned week bucket: same value for every day of one local week. */
  weekBucket: number;
  /** Calendar-month bucket: `year * 12 + (month - 1)`. */
  monthBucket: number;
  /** Local weekday, 0 = Sun … 6 = Sat (matches `DAY_LABELS`). */
  weekday: number;
}

/** Project a UTC instant onto its local calendar in `timeZone`. */
export function localDate(instant: Date, timeZone: string): LocalDate {
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

export function academyDay(instant: Date, timeZone: string): string {
  return dayKey(instant, timeZone);
}

function localDayParts(day: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new RangeError("Local day must use YYYY-MM-DD");
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function localMidnight(day: string, timeZone: string): Date {
  return fromZonedTime(`${day}T00:00:00`, timeZone);
}

export function addLocalDays(day: string, days: number): string {
  const [year, month, date] = localDayParts(day);
  return new Date(Date.UTC(year, month - 1, date + days))
    .toISOString()
    .slice(0, 10);
}
