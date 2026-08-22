/**
 * @matops/domain/payments — manual bank-transfer dues (v1.3, ADR 40).
 * PURE — no I/O, no DB, no clock reading. The single engine behind the owner
 * member-list status dots (P.2), the student dues line + "I paid" claim (P.3), and
 * the dues reminders (R.1).
 *
 * There is NO card processor. A payment is a two-sided confirm loop: the student
 * transfers money in their own bank app and raises a `payment_claim`; the owner
 * confirms it, which rolls the member's `next_due_at` forward by the plan cycle.
 *
 * Payment status is DERIVED, never a stored column that can go stale: the stored
 * facts are `next_due_at` + the confirmed claims; `paymentStatus` computes the
 * dot from `next_due_at` vs. today. Same idea as `class.status` deriving "past"
 * from `starts_at` (docs/issues/19, 40).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Derived money status shown on the member list and the student dues line (ADR 40). */
export type PaymentStatus = "paid" | "due_soon" | "overdue";

/**
 * How many days before the due date the status flips to `due_soon` — the amber
 * band, and the window the reminder sweep (R.1) fires the "3 days before" nudge.
 */
export const DUE_SOON_DAYS = 3;

/** Billing cadence a plan charges on. v1.3 ships monthly only (ADR 40). */
export type BillingCycle = "monthly";

/** The UTC calendar-day index of an instant (days since 1970-01-01, UTC). */
function utcDayNumber(d: Date): number {
  return Math.floor(d.getTime() / DAY_MS);
}

/**
 * Derive the money status from the member's next-due date. Compared at
 * whole-day (UTC calendar-day) granularity, so the time-of-day of `nextDueAt`
 * never matters:
 *   - `overdue`  — the due day has already passed (days-until-due < 0).
 *   - `due_soon` — due today or within the next {@link DUE_SOON_DAYS} days.
 *   - `paid`     — due further out than the due-soon window.
 * A member with no dues set (no `next_due_at`) has no status — the caller shows
 * no dot rather than passing a date here.
 */
export function paymentStatus(nextDueAt: Date, today: Date): PaymentStatus {
  const daysUntilDue = utcDayNumber(nextDueAt) - utcDayNumber(today);
  if (daysUntilDue < 0) return "overdue";
  if (daysUntilDue <= DUE_SOON_DAYS) return "due_soon";
  return "paid";
}

/**
 * The next due date when a claim is confirmed — one plan cycle after the current
 * due date. Rolling from `currentDue` (not from "today") keeps the billing
 * anchor fixed: a member who pays a few days late still owes on the same day of
 * the month. v1.3 supports the monthly cycle only (ADR 40).
 */
export function rollNextDue(currentDue: Date, cycle: BillingCycle): Date {
  // v1.3 has one cycle (monthly). Named so a future cadence (weekly, …) slots in.
  const monthsPerCycle: Record<BillingCycle, number> = { monthly: 1 };
  const targetMonthIndex = currentDue.getUTCMonth() + monthsPerCycle[cycle];
  const targetYear =
    currentDue.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  // Clamp the day so Jan 31 → Feb 28, never spilling into the next month.
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  const day = Math.min(currentDue.getUTCDate(), lastDayOfTargetMonth);
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      day,
      currentDue.getUTCHours(),
      currentDue.getUTCMinutes(),
      currentDue.getUTCSeconds(),
      currentDue.getUTCMilliseconds(),
    ),
  );
}

/**
 * The billing period key for a due date — `"YYYY-MM"` in UTC. One claim per
 * member per period (the dedupe unit); also the human-readable "period" stored
 * on a `payment_claim`.
 */
export function paymentPeriod(dueDate: Date): string {
  const year = dueDate.getUTCFullYear();
  const month = String(dueDate.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * The dedupe key for an open claim: one pending "I paid" per member per period.
 * The API enforces this (a unique index / pre-insert check); the key keeps the
 * definition of "the same claim" in one pure place.
 */
export function claimDedupeKey(memberId: string, period: string): string {
  return `${memberId}:${period}`;
}

/**
 * The fixed reference code the student puts in the bank-transfer note (ADR 40 —
 * the load-bearing detail of the manual flow). It lets the owner match an
 * incoming bank line to a person in seconds: the person's name plus a short,
 * stable id tail. Derived, never stored (recomputed wherever the requisites card
 * is shown). Example: `"SAM LEE 5T6U"`.
 */
export function paymentReference(name: string, memberId: string): string {
  const cleanName = name.trim().replace(/\s+/g, " ").toUpperCase();
  const shortId = memberId
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-4)
    .toUpperCase();
  return [cleanName, shortId].filter(Boolean).join(" ");
}

/** The member facts that gate raising a new "I paid" claim. */
export interface ClaimableMember {
  /** Dues are set up for this member (a plan is assigned). */
  hasPlan: boolean;
  /** A pending claim already exists for the period (one open claim per period). */
  hasOpenClaim: boolean;
}

/**
 * Can the student raise an "I paid" claim now? Only when dues are set up and no
 * claim for this period is already awaiting the owner's confirm. Rejecting when
 * a claim is already open is what makes "I paid" idempotent from the student's
 * side (docs/issues/40).
 */
export function canClaim(m: ClaimableMember): boolean {
  return m.hasPlan && !m.hasOpenClaim;
}

/**
 * What every client calls each status. The tone (colour) is per-client, the
 * words are not: the phone app and the web must say the same thing (ADR 40).
 */
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: "Paid",
  due_soon: "Due soon",
  overdue: "Overdue",
};
