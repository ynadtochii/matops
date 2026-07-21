/**
 * Shared class-schedule formatting (spec S4/S5). Times render in the device's
 * zone, matching how the web schedule renders (apps/nextjs .../schedule.tsx).
 */

export const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

/** "Mon, Jul 21" — the schedule day header. */
export const dayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

/** "Monday, July 21" — the class-detail day line. */
export const dayLongFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Stable local-day key ("YYYY-MM-DD") for grouping classes by day. */
export function dayKey(d: Date): string {
  return dayKeyFmt.format(d);
}

/**
 * "N spots left" for the schedule row (spec S4). Capacity 0 means no cap (the
 * web treats 0 as uncapped), so it never reads as full.
 */
export function spotsLeftLabel(capacity: number, bookingCount: number): string {
  if (capacity <= 0) return "Open";
  const left = capacity - bookingCount;
  if (left <= 0) return "Full";
  return `${left} spot${left === 1 ? "" : "s"} left`;
}
