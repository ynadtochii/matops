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

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Stable "YYYY-MM-DD" key for one local calendar day, in the DEVICE zone. This
 * is the bucket a student's own schedule groups on. Academy-zone statistics use
 * `localDate` instead, which draws its boundaries in the gym's zone (spec §4).
 */
export function dayKey(d: Date): string {
  return dayKeyFmt.format(d);
}

/**
 * Class rows bucketed into local days, keyed by {@link dayKey}. Insertion order
 * is kept, so a list the API already sorted by start time stays sorted inside
 * each day and the days come out in the order they first appear.
 */
export function groupByDay<T extends { startsAt: string | Date }>(
  rows: T[],
): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = dayKey(new Date(row.startsAt));
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()];
}
