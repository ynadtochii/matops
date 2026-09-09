/** Pure referral-attribution rules (spec O9, ADR 52). */

interface ReferralMembership {
  memberId: string;
  role: string;
  status: string;
  invitedRole?: string | null;
}

export interface MoneyAmount {
  amountMinor: number;
  currency: string;
}

/** Pending memberships hold their intended role in `invitedRole`. */
export function isStudentMembership(member: ReferralMembership): boolean {
  return (
    member.role === "student" ||
    (member.status === "pending" && member.invitedRole === "student")
  );
}

/** Students that staff may newly attribute. Removed students are history-only. */
export function isReferralStudent(member: ReferralMembership): boolean {
  return (
    isStudentMembership(member) &&
    ["pending", "active", "suspended"].includes(member.status)
  );
}

/** Any retained member row in the academy is eligible to refer somebody. */
export function isEligibleReferrer(member: ReferralMembership): boolean {
  return member.memberId.length > 0;
}

/** A referral must connect two different academy memberships. */
export function isValidReferralPair(
  studentMemberId: string,
  referrerMemberId: string,
): boolean {
  return studentMemberId !== referrerMemberId;
}

/** Initial assignment is available only before any current-state row exists. */
export function canInitiallyAssignReferral(hasReferralRow: boolean): boolean {
  return !hasReferralRow;
}

/** `YYYY-MM` as seen on an academy's local calendar. */
export function academyMonthKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Could not resolve academy month");
  return `${year}-${month}`;
}

/** Sum money without ever combining incompatible currencies. */
export function groupMoneyByCurrency(
  amounts: readonly MoneyAmount[],
): MoneyAmount[] {
  const totals = new Map<string, number>();
  for (const amount of amounts) {
    const currency = amount.currency.toUpperCase();
    totals.set(currency, (totals.get(currency) ?? 0) + amount.amountMinor);
  }
  return [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amountMinor]) => ({ currency, amountMinor }));
}

/**
 * Where a student sits in the referral flow. `cleared` is not `never_assigned`:
 * a row with a null referrer means an owner deliberately removed the credit, and
 * only an owner may set it again (ADR 52).
 */
type ReferralAssignmentState = "assigned" | "cleared" | "never_assigned";

export function referralAssignmentState(
  referral: { referrerMemberId: string | null } | undefined,
): ReferralAssignmentState {
  if (!referral) return "never_assigned";
  return referral.referrerMemberId ? "assigned" : "cleared";
}
