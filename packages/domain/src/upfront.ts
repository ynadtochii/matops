import type { MonthKey } from "./membership-month";
import { nextMonth } from "./membership-month";
import { formatMoney } from "./payments";

export const MAX_UPFRONT_MONTHS = 12;
export const MIN_DISCOUNT_FROM_MONTHS = 2;
export const MAX_DISCOUNT_PERCENT = 90;

export interface UpfrontRule {
  fromMonths: number;
  percent: number | null;
  monthMinor: number | null;
}

export interface UpfrontTotal {
  months: number;
  fullMinor: number;
  totalMinor: number;
  savingMinor: number;
}

function discounted(monthlyMinor: number, rule: UpfrontRule, months: number) {
  if (rule.percent !== null) {
    return Math.round((monthlyMinor * months * (100 - rule.percent)) / 100);
  }
  if (rule.monthMinor !== null) return rule.monthMinor * months;
  return monthlyMinor * months;
}

export function upfrontTotal(
  monthlyMinor: number,
  rule: UpfrontRule | null,
  months: number,
): UpfrontTotal {
  const fullMinor = monthlyMinor * months;
  const totalMinor =
    rule && months >= rule.fromMonths
      ? Math.min(fullMinor, discounted(monthlyMinor, rule, months))
      : fullMinor;
  return { months, fullMinor, totalMinor, savingMinor: fullMinor - totalMinor };
}

export function upfrontHint(
  monthlyMinor: number,
  rule: UpfrontRule | null,
  months: number,
): UpfrontRule | null {
  if (!rule || months >= rule.fromMonths) return null;
  const at = upfrontTotal(monthlyMinor, rule, rule.fromMonths);
  return at.savingMinor > 0 ? rule : null;
}

export function splitTotal(totalMinor: number, months: number): number[] {
  const share = Math.floor(totalMinor / months);
  const rest = totalMinor - share * months;
  return Array.from({ length: months }, (_, i) =>
    i === 0 ? share + rest : share,
  );
}

export function monthsFrom(first: MonthKey, count: number): MonthKey[] {
  const months: MonthKey[] = [];
  let month = first;
  for (let i = 0; i < count; i += 1) {
    months.push(month);
    month = nextMonth(month);
  }
  return months;
}

export function upfrontStart(
  currentMonth: MonthKey,
  taken: ReadonlySet<MonthKey>,
): MonthKey {
  let month = currentMonth;
  while (taken.has(month)) month = nextMonth(month);
  return month;
}

export function paidUntil(
  currentMonth: MonthKey,
  paid: ReadonlySet<MonthKey>,
): MonthKey | null {
  if (!paid.has(currentMonth)) return null;
  let last = currentMonth;
  while (paid.has(nextMonth(last))) last = nextMonth(last);
  return last;
}

export type DiscountProblem =
  "from_range" | "pick_one" | "percent_range" | "month_amount" | "no_saving";

export function discountProblem(
  rule: UpfrontRule,
  monthlyMinor: number | null,
): DiscountProblem | null {
  if (
    !Number.isInteger(rule.fromMonths) ||
    rule.fromMonths < MIN_DISCOUNT_FROM_MONTHS ||
    rule.fromMonths > MAX_UPFRONT_MONTHS
  ) {
    return "from_range";
  }
  if ((rule.percent === null) === (rule.monthMinor === null)) return "pick_one";
  if (
    rule.percent !== null &&
    (!Number.isInteger(rule.percent) ||
      rule.percent < 1 ||
      rule.percent > MAX_DISCOUNT_PERCENT)
  ) {
    return "percent_range";
  }
  if (
    rule.monthMinor !== null &&
    (!Number.isInteger(rule.monthMinor) || rule.monthMinor <= 0)
  ) {
    return "month_amount";
  }
  if (
    rule.monthMinor !== null &&
    monthlyMinor !== null &&
    rule.monthMinor >= monthlyMinor
  ) {
    return "no_saving";
  }
  return null;
}

export function upfrontRuleLabel(rule: UpfrontRule, currency: string): string {
  const off =
    rule.percent !== null
      ? `${rule.percent}% off`
      : `${formatMoney(rule.monthMinor ?? 0, currency)} a month`;
  return `From ${rule.fromMonths} months: ${off}`;
}
