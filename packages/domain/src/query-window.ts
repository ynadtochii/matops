import { ATTENDANCE_BACKFILL_DAYS, UNMARKED_LOOKBACK_DAYS } from "./attendance";
import { DAY_MS } from "./local-date";

export interface QueryWindow {
  from: string;
  to: string;
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

export function attendanceWindow(now: Date): QueryWindow {
  return classQueryWindow(now, {
    backDays: ATTENDANCE_BACKFILL_DAYS + 1,
    forwardDays: 2,
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
