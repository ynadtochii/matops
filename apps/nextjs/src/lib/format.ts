/**
 * Every date and time the web app prints, in one place. The cross-client rules
 * (`timeFmt`, `clockParts`, `dayKey`) come from `@matops/domain` so the web and
 * the phone app cannot drift; the rest are the web's own day and date shapes.
 * `apps/expo/src/utils/format.ts` is the same idea for mobile.
 *
 * All of these render in the DEVICE zone. Anything measured in the academy's
 * zone is computed server-side (spec §4).
 */

export { clockParts, dayKey, timeFmt } from "@matops/domain";

/** "14:05" forced to a 24-hour clock, so grid rows line up whatever the locale. */
export const time24Fmt = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "Mon" */
export const weekdayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
});

/** "21" */
export const dayNumFmt = new Intl.DateTimeFormat(undefined, { day: "numeric" });

/** "Jul 21" */
export const monthDayFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

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

/** "Mon, Jul 21, 2026" */
export const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
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
