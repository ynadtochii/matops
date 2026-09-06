import type { MonthKey } from "./membership-month";

/**
 * What a plan costs, and what it cost then (ADR 128, spec FP6).
 *
 * A price change names the month it starts. Every month resolves to the latest
 * price at or before it, so raising a price in March leaves February reading
 * what February's members were actually asked for.
 */
export interface Money {
  priceMinor: number;
  currency: string;
}

export interface PlanPrice extends Money {
  effectiveMonth: MonthKey;
}

/**
 * The amount that applied to one month, or null when the plan had no price yet.
 *
 * A null is a real answer rather than a failure: a plan can be made before it is
 * priced, and a month before the first price is a month nobody was asked for
 * money. The caller decides what to do about it, which for the owner's board is
 * to show the gap and for readiness to refuse the branch.
 */
export function priceForMonth(
  history: readonly PlanPrice[],
  month: MonthKey,
): Money | null {
  let best: PlanPrice | null = null;
  for (const row of history) {
    if (row.effectiveMonth > month) continue;
    if (!best || row.effectiveMonth > best.effectiveMonth) best = row;
  }
  return best ? { priceMinor: best.priceMinor, currency: best.currency } : null;
}

/**
 * May this price change be recorded for this month?
 *
 * A change reaches members from a month they have not been billed for yet, so
 * the earliest it may name is the month after the current one. Rewriting the
 * month in progress would move the amount somebody has already been told, and
 * rewriting a past month is what the history exists to prevent.
 */
export function canPriceFrom(month: MonthKey, currentMonth: MonthKey): boolean {
  return month > currentMonth;
}

export function isFreeMembershipMonth(amount: Money | null): boolean {
  return amount?.priceMinor === 0;
}
