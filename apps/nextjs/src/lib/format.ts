/**
 * Every date and time the web app prints, in one place. The shapes both
 * clients print come from `@matops/domain` so the web and the phone app cannot
 * drift; the rest are the web's own.
 *
 * All of these render in the DEVICE zone. Anything measured in the academy's
 * zone is computed server-side (spec §4).
 */

export {
  clockParts,
  dateYearFmt,
  dayKey,
  dayLongFmt,
  dayMediumFmt,
  dayNumFmt,
  dayShortFmt,
  monthYearFmt,
  timeFmt,
  weekdayFmt,
} from "@matops/domain";

/** "14:05" forced to a 24-hour clock, so grid rows line up whatever the locale. */
export const time24Fmt = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "Jul 21" */
export const monthDayFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

/** "Mon, Jul 21, 2026" */
export const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
