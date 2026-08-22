/**
 * Schedule formatting for the mobile screens. The cross-client rules (time
 * split, spots-left, fill) live in `@matops/domain` so web and mobile cannot
 * drift; only the mobile-only day formats are local.
 */

export {
  clockParts,
  dayKey,
  fillLabel,
  groupByDay,
  spotsLeftLabel,
  timeFmt,
} from "@matops/domain";

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
