/**
 * Shared class-time formatting. Both clients render times in the device's zone,
 * so the rule lives here rather than being copied per screen.
 */

export const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Clock split into the numerals and the AM/PM tail, so a column of times lines
 * up on the digits. The separator can be a narrow no-break space, so split on
 * any whitespace.
 */
export function clockParts(d: Date): { clock: string; period: string } {
  const [clock = "", period = ""] = timeFmt.format(d).split(/\s+/);
  return { clock, period };
}

const DAY_KEY_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
};

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", DAY_KEY_OPTIONS);
const zonedDayKeyFmt = new Map<string, Intl.DateTimeFormat>();

function dayKeyFormatter(timeZone?: string): Intl.DateTimeFormat {
  if (!timeZone) return dayKeyFmt;
  let fmt = zonedDayKeyFmt.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", { ...DAY_KEY_OPTIONS, timeZone });
    zonedDayKeyFmt.set(timeZone, fmt);
  }
  return fmt;
}

/**
 * Stable "YYYY-MM-DD" key for one calendar day. With no zone it draws the day
 * in the DEVICE zone, which is the bucket a student's own schedule groups on.
 * Pass one where the screen shows a gym's own clock rather than the reader's:
 * a visitor abroad reading the booking page must see a 09:00 class under the
 * day it falls on at the gym, not the day it falls on where they are standing.
 * Academy-zone statistics use `localDate` instead (spec §4).
 */
export function dayKey(d: Date, timeZone?: string): string {
  return dayKeyFormatter(timeZone).format(d);
}

/**
 * Class rows bucketed into calendar days, keyed by {@link dayKey}. Insertion
 * order is kept, so a list the API already sorted by start time stays sorted
 * inside each day and the days come out in the order they first appear.
 */
export function groupByDay<T extends { startsAt: string | Date }>(
  rows: T[],
  timeZone?: string,
): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = dayKey(new Date(row.startsAt), timeZone);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()];
}
