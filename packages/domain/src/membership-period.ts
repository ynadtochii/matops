// Every start counts from the anchor, not the previous period, so the 31st
// comes back after February instead of drifting to the 28th.
export type PeriodKey = string;

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y ?? 0, m ?? 1, d ?? 1];
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function iso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function periodStart(anchor: string, index: number): PeriodKey {
  const [y, m, d] = parts(anchor);
  const total = y * 12 + (m - 1) + index;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return iso(year, month, Math.min(d, daysInMonth(year, month)));
}

function periodIndex(date: string, anchor: string): number {
  const [y, m] = parts(date);
  const [ay, am] = parts(anchor);
  const guess = (y - ay) * 12 + (m - am);
  return periodStart(anchor, guess) <= date ? guess : guess - 1;
}

export function periodOf(date: string, anchor: string): PeriodKey {
  return periodStart(anchor, periodIndex(date, anchor));
}

export function isPeriodStart(date: string, anchor: string): boolean {
  return periodOf(date, anchor) === date;
}

export function nextPeriod(start: PeriodKey, anchor: string): PeriodKey {
  return periodStart(anchor, periodIndex(start, anchor) + 1);
}

export function periodsFrom(
  first: PeriodKey,
  anchor: string,
  count: number,
): PeriodKey[] {
  const index = periodIndex(first, anchor);
  return Array.from({ length: count }, (_, i) =>
    periodStart(anchor, index + i),
  );
}

interface Held {
  startMonth: string;
  endMonth: string | null;
}

export function periodBoundary(start: PeriodKey, held: Held): string {
  const next = nextPeriod(start, held.startMonth);
  return held.endMonth !== null && held.endMonth < next ? held.endMonth : next;
}

export function periodLastDay(start: PeriodKey, held: Held): string {
  return addDays(periodBoundary(start, held), -1);
}

export function currentPeriod(today: string, held: Held): PeriodKey | null {
  if (today < held.startMonth) return null;
  if (held.endMonth !== null && today >= held.endMonth) return null;
  return periodOf(today, held.startMonth);
}

const DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});
const DAY_YEAR = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function noon(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

export function formatDay(date: string): string {
  return DAY_YEAR.format(noon(date));
}

export function formatPeriod(start: PeriodKey, lastDay: string): string {
  const sameYear = start.slice(0, 4) === lastDay.slice(0, 4);
  const from = (sameYear ? DAY : DAY_YEAR).format(noon(start));
  return `${from} to ${DAY_YEAR.format(noon(lastDay))}`;
}

export function paymentDayLabel(anchor: string): string {
  const day = parts(anchor)[2];
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  const label = `the ${day}${suffix}`;
  return day >= 29 ? `${label}, or the last day of shorter months` : label;
}

export type PaymentDateProblem =
  | "not_after_today"
  | "inactive"
  | "ended"
  | "paid_ahead"
  | "change_pending"
  | "payment_declined";

export function paymentDateProblem(input: {
  nextPaymentOn: string;
  today: string;
  status: string;
  endMonth: string | null;
  currentStart: PeriodKey | null;
  takenAfterCurrent: readonly PeriodKey[];
  changePending: boolean;
  held: boolean;
}): PaymentDateProblem | null {
  if (input.status !== "active") return "inactive";
  if (input.endMonth !== null || input.currentStart === null) return "ended";
  if (input.changePending) return "change_pending";
  if (input.held) return "payment_declined";
  if (input.nextPaymentOn <= input.today) return "not_after_today";
  if (input.takenAfterCurrent.length > 0) return "paid_ahead";
  return null;
}

export function isJoinPeriod(
  month: PeriodKey,
  held: { startMonth: string; startsOn: string | null },
): boolean {
  return (
    month === held.startMonth &&
    held.startsOn !== null &&
    held.startsOn >= held.startMonth
  );
}
