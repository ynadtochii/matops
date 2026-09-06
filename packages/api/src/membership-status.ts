import type { SQL, TenantTx } from "@matops/db";
import type { MembershipWarning, Money } from "@matops/domain";
import { and, eq, gt, isNull, lte, or, sql } from "@matops/db";
import {
  accessAssignment,
  accessPlan,
  accessPlanEntity,
  accessPlanPrice,
  entity,
  membershipMonth,
  membershipPolicy,
} from "@matops/db/schema";
import {
  appliesInMonth,
  isFreeMembershipMonth,
  membershipWarning,
  monthOf,
  monthVerdict,
  payDeadline,
  priceForMonth,
  resolveAcademyTimeZone,
} from "@matops/domain";

/**
 * The SQL half of {@link appliesInMonth} for a count that has no month in hand
 * (ADR 129): the assignment has started and has not ended today.
 *
 * `start_month` and `end_month` are first-of-month dates, so comparing them
 * against `current_date` answers the month question without a second lookup.
 * A reader that already knows the month it is judging should filter in
 * TypeScript with `appliesInMonth` instead, which is exact about the zone.
 */
export function assignmentAppliesNow() {
  return assignmentAppliesInMonth(sql`current_date`);
}

/** The same rule against a month the caller has already resolved. */
export function assignmentAppliesInMonth(month: string | SQL) {
  return and(
    lte(accessAssignment.startMonth, month),
    or(isNull(accessAssignment.endMonth), gt(accessAssignment.endMonth, month)),
  );
}

/** The column default, for the read that runs before a policy row exists. */
const DEFAULT_MEMBERSHIP_GRACE_DAYS = 7;

export interface MembershipStanding {
  assignmentId: string;
  planName: string;
  status: string;
  entityIds: string[];
  /**
   * What this month cost, or null while the plan carries no price. Never a
   * statement about money received: `paid` is a tick, and revenue is what the
   * owner confirmed against a bank statement (ADR 40, ADR 127).
   */
  amount: Money | null;
  /** The month being judged, as its first day. */
  month: string;
  paid: boolean;
  paymentRequired: boolean;
  /** The first moment that is too late. */
  deadline: Date;
  /** When the member said they sent the money for this month. */
  claimedAt: Date | null;
  warning: MembershipWarning | null;
}

/**
 * The organization's own calendar settings, with the fallbacks the owner may
 * never have opened the screen to set (ADR 126).
 */
export async function membershipCalendar(
  db: TenantTx,
): Promise<{ graceDays: number; timeZone: string }> {
  const [policy] = await db
    .select({
      graceDays: membershipPolicy.graceDays,
      calendarTimeZone: membershipPolicy.calendarTimeZone,
    })
    .from(membershipPolicy);
  if (policy?.calendarTimeZone) {
    return {
      graceDays: policy.graceDays,
      timeZone: policy.calendarTimeZone,
    };
  }
  const [home] = await db
    .select({ timeZone: entity.timeZone })
    .from(entity)
    .where(and(eq(entity.isDefault, true), isNull(entity.deletedAt)))
    .limit(1);
  return {
    graceDays: policy?.graceDays ?? DEFAULT_MEMBERSHIP_GRACE_DAYS,
    timeZone: resolveAcademyTimeZone(home?.timeZone),
  };
}

/**
 * The gym's bank account (ADR 127). One row for the organization, and an empty
 * string before anybody has set it, so a caller never has to know whether the
 * policy row exists.
 */
export async function membershipBankDetails(db: TenantTx): Promise<string> {
  const [row] = await db
    .select({ bankDetails: membershipPolicy.bankDetails })
    .from(membershipPolicy);
  return row?.bankDetails ?? "";
}

/**
 * Where one person stands on each membership they hold, for a given moment.
 *
 * ONE row per membership, never one per covered branch: the whole point of a
 * shared membership is that it is a single record, so a person covered at a mat
 * and a gym is warned once (ADR 126).
 *
 * A month with no record counts as unpaid. Nothing here writes a row to make
 * the answer tidier, because a helpful default would turn a gap in the tracker
 * into a claim that somebody paid.
 */
export async function membershipStanding(
  db: TenantTx,
  userId: string,
  now: Date,
): Promise<MembershipStanding[]> {
  const calendar = await membershipCalendar(db);
  const month = monthOf(now, calendar.timeZone);

  const rows = await db
    .select({
      id: accessAssignment.id,
      status: accessAssignment.status,
      startMonth: accessAssignment.startMonth,
      endMonth: accessAssignment.endMonth,
      createdAt: accessAssignment.createdAt,
      planId: accessAssignment.planId,
      planName: accessPlan.name,
    })
    .from(accessAssignment)
    .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
    .where(eq(accessAssignment.userId, userId));
  if (rows.length === 0) return [];
  // Only the memberships whose period covers this month (ADR 129). A successor
  // that starts next month owes nothing yet, and the one it replaces still owes
  // this month.
  const applicable = rows.filter((r) => appliesInMonth(r, month));
  if (applicable.length === 0) return [];

  const coverage = await db
    .select({
      planId: accessPlanEntity.planId,
      entityId: accessPlanEntity.entityId,
    })
    .from(accessPlanEntity);
  const months = await db
    .select({
      assignmentId: membershipMonth.assignmentId,
      month: membershipMonth.month,
      paid: membershipMonth.paid,
      claimedAt: membershipMonth.claimedAt,
    })
    .from(membershipMonth)
    .where(eq(membershipMonth.month, month));
  // What each plan cost THIS month, which is not always what it costs now
  // (ADR 128). Resolved from the history rather than copied onto the month, so
  // there is one answer and no second copy to drift from it.
  const prices = await db
    .select({
      planId: accessPlanPrice.planId,
      effectiveMonth: accessPlanPrice.effectiveMonth,
      priceMinor: accessPlanPrice.priceMinor,
      currency: accessPlanPrice.currency,
    })
    .from(accessPlanPrice);

  return applicable.map((r) => {
    const held = months.find((m) => m.assignmentId === r.id);
    const paid = held?.paid ?? false;
    const amount = priceForMonth(
      prices.filter((p) => p.planId === r.planId),
      month,
    );
    const paymentRequired = !isFreeMembershipMonth(amount);
    const shared = {
      month,
      startMonth: r.startMonth,
      // The day they joined only matters in the month they joined, and it is
      // the assignment's own creation day.
      joinedOn: r.createdAt.toISOString().slice(0, 10),
      policy: calendar,
    };
    const deadline = payDeadline(shared);
    return {
      assignmentId: r.id,
      planName: r.planName,
      status: r.status,
      // The amount they were asked for, and nothing about whether it arrived:
      // `paid` is a tick somebody made, never money the gym counted (ADR 127).
      amount,
      paymentRequired,
      entityIds: coverage
        .filter((c) => c.planId === r.planId)
        .map((c) => c.entityId)
        .sort(),
      month,
      paid,
      deadline,
      claimedAt: held?.claimedAt ?? null,
      warning:
        r.status === "active" && paymentRequired
          ? membershipWarning({
              verdict: monthVerdict({ ...shared, paid, now }),
              month,
              deadline,
              planName: r.planName,
              timeZone: calendar.timeZone,
            })
          : null,
    };
  });
}
