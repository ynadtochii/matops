import { UNMARKED_LOOKBACK_DAYS } from "./attendance";
import { academyDay, addLocalDays, DAY_MS, localMidnight } from "./local-date";

interface QueryWindow {
  from: string;
  to: string;
}

interface SelfServiceWindowRule {
  bookingWindowDays: number;
  timeZone: string;
}

export function selfServiceWindow(
  now: Date,
  rule: SelfServiceWindowRule,
): QueryWindow {
  if (
    !Number.isInteger(rule.bookingWindowDays) ||
    rule.bookingWindowDays < 1 ||
    rule.bookingWindowDays > 90
  ) {
    throw new RangeError("Booking window days must be an integer from 1 to 90");
  }
  const firstDay = academyDay(now, rule.timeZone);
  const afterLastDay = addLocalDays(firstDay, rule.bookingWindowDays);
  return {
    from: localMidnight(firstDay, rule.timeZone).toISOString(),
    to: localMidnight(afterLastDay, rule.timeZone).toISOString(),
  };
}

export function utcDayStart(now: Date): number {
  return Math.floor(now.getTime() / DAY_MS) * DAY_MS;
}

export function classQueryWindow(
  now: Date,
  opts: { backDays: number; forwardDays: number },
): QueryWindow {
  const start = utcDayStart(now);
  return {
    from: new Date(start - opts.backDays * DAY_MS).toISOString(),
    to: new Date(start + opts.forwardDays * DAY_MS).toISOString(),
  };
}

export function dashboardWeekWindow(now: Date): QueryWindow {
  return classQueryWindow(now, {
    backDays: UNMARKED_LOOKBACK_DAYS + 2,
    forwardDays: 8,
  });
}

export function studentWeekWindow(now: Date): QueryWindow {
  return classQueryWindow(now, { backDays: 1, forwardDays: 8 });
}

export function scheduleWeekWindow(
  now: Date,
  offsetWeeks: number,
): QueryWindow {
  const day = utcDayStart(now) / DAY_MS;
  const monday = day - ((day + 3) % 7) + offsetWeeks * 7;
  return {
    from: new Date((monday - 1) * DAY_MS).toISOString(),
    to: new Date((monday + 8) * DAY_MS).toISOString(),
  };
}
