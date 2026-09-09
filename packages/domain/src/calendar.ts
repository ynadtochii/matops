export function startOfDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function onSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

interface DayWindow {
  from: Date;
  to: Date;
}

export function dayWindow(
  now: Date,
  opts: { backDays?: number; aheadDays: number },
): DayWindow {
  const from = startOfDay(now);
  from.setDate(from.getDate() - (opts.backDays ?? 0));
  const to = startOfDay(now);
  to.setDate(to.getDate() + opts.aheadDays);
  return { from, to };
}

/** 0 = Sunday, 1 = Monday. See ADR 96 for why the app uses both. */
type WeekStartsOn = 0 | 1;

export const GRID_WEEK_STARTS_ON: WeekStartsOn = 1;

export function calendarWeekStart(
  now: Date,
  offsetWeeks: number,
  startsOn: WeekStartsOn,
): Date {
  const d = startOfDay(now);
  const shift = (d.getDay() - startsOn + 7) % 7;
  d.setDate(d.getDate() - shift + offsetWeeks * 7);
  return d;
}
