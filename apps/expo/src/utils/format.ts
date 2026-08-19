/**
 * Schedule formatting for the mobile screens. The cross-client rules (time
 * split, spots-left, fill) live in `@matops/domain` so web and mobile cannot
 * drift; only the mobile-only day formats are local.
 */

export { clockParts, fillLabel, spotsLeftLabel, timeFmt } from "@matops/domain";

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
