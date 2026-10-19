/**
 * Shared class-time formatting. Both clients render times in the device's zone,
 * so the rule lives here rather than being copied per screen.
 */

export const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

/** "Mon" */
export const weekdayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
});

/** "21" */
export const dayNumFmt = new Intl.DateTimeFormat(undefined, { day: "numeric" });

/** "Mon, Jul 21" */
export const dayShortFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

/** "Monday, Jul 21" */
export const dayMediumFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
});

/** "Monday, July 21" */
export const dayLongFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

/** "Jul 21, 2026" */
export const dateYearFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** "Jul 2026" */
export const monthYearFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  year: "numeric",
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

/**
 * "Starts in 45 min" for a class in the next 12 hours. Null once it has
 * started or when it is further away, where the day label says more.
 */
export function startsInLabel(startsAt: Date, now: Date): string | null {
  const minutes = Math.ceil((startsAt.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0 || minutes > 12 * 60) return null;
  if (minutes < 60) return `Starts in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `Starts in ${hours} h`
    : `Starts in ${hours} h ${rest} min`;
}
