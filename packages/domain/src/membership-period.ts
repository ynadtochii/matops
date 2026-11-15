import type { AssignmentStatus } from "./access-plan";
import { appliesInMonth } from "./access-plan";

export type PeriodKey = string;

// After a payment date change, the period that began on `periodAnchorFrom`
// ends on `periodAnchor`, and later periods count from `periodAnchor`.
export interface PeriodSchedule {
  startMonth: string;
  endMonth: string | null;
  periodAnchor: string | null;
  periodAnchorFrom: string | null;
}

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

// Every start counts from the anchor, not the previous period, so the 31st
// comes back after February instead of drifting to the 28th.
export function periodStart(anchor: string, index: number): PeriodKey {
  const [y, m, d] = parts(anchor);
  const total = y * 12 + (m - 1) + index;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return iso(year, month, Math.min(d, daysInMonth(year, month)));
}

function anchorIndex(date: string, anchor: string): number {
  const [y, m] = parts(date);
  const [ay, am] = parts(anchor);
  const guess = (y - ay) * 12 + (m - am);
  return periodStart(anchor, guess) <= date ? guess : guess - 1;
}

export function periodOf(date: string, s: PeriodSchedule): PeriodKey {
  if (s.periodAnchor !== null && date >= s.periodAnchor) {
    return periodStart(s.periodAnchor, anchorIndex(date, s.periodAnchor));
  }
  if (s.periodAnchorFrom !== null && date >= s.periodAnchorFrom) {
    return s.periodAnchorFrom;
  }
  return periodStart(s.startMonth, anchorIndex(date, s.startMonth));
}

export function nextPeriod(start: PeriodKey, s: PeriodSchedule): PeriodKey {
  if (s.periodAnchor !== null && start >= s.periodAnchor) {
    return periodStart(s.periodAnchor, anchorIndex(start, s.periodAnchor) + 1);
  }
  if (s.periodAnchor !== null && s.periodAnchorFrom !== null) {
    if (start >= s.periodAnchorFrom) return s.periodAnchor;
  }
  return periodStart(s.startMonth, anchorIndex(start, s.startMonth) + 1);
}

export function isPeriodStart(date: string, s: PeriodSchedule): boolean {
  return periodOf(date, s) === date;
}

export function periodsFrom(
  first: PeriodKey,
  s: PeriodSchedule,
  count: number,
): PeriodKey[] {
  const periods: PeriodKey[] = [];
  let start = first;
  for (let i = 0; i < count; i += 1) {
    periods.push(start);
    start = nextPeriod(start, s);
  }
  return periods;
}

export function periodBoundary(start: PeriodKey, s: PeriodSchedule): string {
  const next = nextPeriod(start, s);
  return s.endMonth !== null && s.endMonth < next ? s.endMonth : next;
}

export function periodLastDay(start: PeriodKey, s: PeriodSchedule): string {
  return addDays(periodBoundary(start, s), -1);
}

export function currentPeriod(
  today: string,
  s: PeriodSchedule,
): PeriodKey | null {
  return appliesInMonth(s, today) ? periodOf(today, s) : null;
}

export function runningOn<T extends PeriodSchedule>(
  day: string,
  rows: readonly T[],
): (T & { month: PeriodKey })[] {
  return rows.flatMap((row) => {
    const month = currentPeriod(day, row);
    return month ? [{ ...row, month }] : [];
  });
}

export function paymentDay(s: PeriodSchedule): string {
  return s.periodAnchor ?? s.startMonth;
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

export function earliestKey(keys: readonly string[], fallback: string): string {
  return keys.reduce((min, key) => (key < min ? key : min), fallback);
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

export function periodLabel(start: PeriodKey, s: PeriodSchedule): string {
  return formatPeriod(start, periodLastDay(start, s));
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
  status: AssignmentStatus;
  endMonth: string | null;
  currentStart: PeriodKey | null;
  takenAfterCurrent: readonly PeriodKey[];
  changePending: boolean;
  declined: boolean;
}): PaymentDateProblem | null {
  if (input.status !== "active") return "inactive";
  if (input.endMonth !== null || input.currentStart === null) return "ended";
  if (input.changePending) return "change_pending";
  if (input.declined) return "payment_declined";
  if (input.nextPaymentOn <= input.today) return "not_after_today";
  if (input.takenAfterCurrent.length > 0) return "paid_ahead";
  return null;
}
