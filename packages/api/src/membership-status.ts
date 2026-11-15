import type { SQL, TenantTx } from "@matops/db";
import type { MembershipWarning, Money } from "@matops/domain";
import { and, asc, eq, gt, isNull, lte, or, sql } from "@matops/db";
import {
  accessAssignment,
  accessPlan,
  accessPlanEntity,
  accessPlanMethodOff,
  accessPlanPrice,
  entity,
  membershipMonth,
  membershipPolicy,
  paymentMethod,
} from "@matops/db/schema";
import {
  currentPeriod,
  formatPeriod,
  isFreeMembershipMonth,
  isJoinPeriod,
  localDateISO,
  membershipWarning,
  monthVerdict,
  payDeadline,
  periodBoundary,
  periodLastDay,
  priceForMonth,
  resolveAcademyTimeZone,
} from "@matops/domain";

/**
 * The SQL half of {@link appliesInMonth} for a count that has no period in
 * hand (ADR 129, ADR 163): the assignment has started and has not ended today.
 * A reader that already knows the day it is judging should filter in
 * TypeScript with `currentPeriod` instead, which is exact about the zone.
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

interface MembershipStanding {
  assignmentId: string;
  planId: string;
  planName: string;
  status: string;
  entityIds: string[];
  /**
   * What this month cost, or null while the plan carries no price. Never a
   * statement about money received: `paid` is a tick, and revenue is what the
   * owner confirmed against a bank statement (ADR 40, ADR 127).
   */
  amount: Money | null;
  /** The period being judged, as its start date. */
  month: string;
  periodLabel: string;
  startMonth: string;
  startsOn: string;
  endMonth: string | null;
  nextPaymentOn: string;
  paid: boolean;
  paymentStatus: string;
  version: number;
  paymentRequired: boolean;
  /** The first moment that is too late. */
  deadline: Date;
  deadlineMoved: boolean;
  /** When the member said they sent the money for this month. */
  reportedAt: Date | null;
  awaitingStaff: boolean;
  firstMonth: boolean;
  chosenBySelf: boolean;
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

export async function enabledPaymentMethods(db: TenantTx) {
  const methods = await db
    .select({
      id: paymentMethod.id,
      kind: paymentMethod.kind,
      label: paymentMethod.label,
      details: paymentMethod.details,
    })
    .from(paymentMethod)
    .where(eq(paymentMethod.enabled, true))
    .orderBy(asc(paymentMethod.position), asc(paymentMethod.createdAt));
  const off = await db
    .select({
      planId: accessPlanMethodOff.planId,
      methodId: accessPlanMethodOff.paymentMethodId,
    })
    .from(accessPlanMethodOff);
  return methods.map((m) => ({
    ...m,
    offPlanIds: off.filter((o) => o.methodId === m.id).map((o) => o.planId),
  }));
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
  subject: { personId: string | null; accountUserId: string | null },
  now: Date,
): Promise<MembershipStanding[]> {
  const calendar = await membershipCalendar(db);
  const today = localDateISO(now, calendar.timeZone);

  const rows = await db
    .select({
      id: accessAssignment.id,
      status: accessAssignment.status,
      startMonth: accessAssignment.startMonth,
      endMonth: accessAssignment.endMonth,
      createdAt: accessAssignment.createdAt,
      startsOn: accessAssignment.startsOn,
      assignedBy: accessAssignment.assignedBy,
      planId: accessAssignment.planId,
      planName: accessPlan.name,
    })
    .from(accessAssignment)
    .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
    .where(
      subject.personId
        ? eq(accessAssignment.personId, subject.personId)
        : sql`false`,
    );
  if (rows.length === 0) return [];
  // Only the memberships running today (ADR 129). A successor that starts later
  // owes nothing yet, and the one it replaces still owes its current period.
  const applicable = rows.flatMap((r) => {
    const month = currentPeriod(today, r);
    return month ? [{ ...r, month }] : [];
  });
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
      status: membershipMonth.status,
      version: membershipMonth.version,
      priceMinor: membershipMonth.priceMinor,
      currency: membershipMonth.currency,
      deadline: membershipMonth.deadline,
      reportedAt: membershipMonth.reportedAt,
      cashPaidToName: membershipMonth.cashPaidToName,
    })
    .from(membershipMonth)
    .where(
      or(
        ...applicable.map((r) =>
          and(
            eq(membershipMonth.assignmentId, r.id),
            eq(membershipMonth.month, r.month),
          ),
        ),
      ),
    );
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
    const month = r.month;
    const held = months.find((m) => m.assignmentId === r.id);
    const paymentStatus = held?.status ?? "unpaid";
    const paid = paymentStatus === "confirmed";
    const currentAmount = priceForMonth(
      prices.filter((p) => p.planId === r.planId),
      month,
    );
    const amount =
      held?.priceMinor !== null &&
      held?.priceMinor !== undefined &&
      held.currency
        ? { priceMinor: held.priceMinor, currency: held.currency }
        : currentAmount;
    const paymentRequired = !isFreeMembershipMonth(amount);
    const shared = {
      month,
      startMonth: r.startMonth,
      joinedOn: r.startsOn,
      policy: calendar,
    };
    const computed = payDeadline(shared);
    const deadline = held?.deadline ?? computed;
    const periodLabel = formatPeriod(month, periodLastDay(month, r));
    return {
      assignmentId: r.id,
      planId: r.planId,
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
      periodLabel,
      startMonth: r.startMonth,
      startsOn: r.startsOn,
      endMonth: r.endMonth,
      nextPaymentOn: periodBoundary(month, r),
      paid,
      paymentStatus,
      version: held?.version ?? 0,
      deadline,
      deadlineMoved:
        held?.deadline != null &&
        held.deadline.getTime() !== computed.getTime(),
      reportedAt: held?.reportedAt ?? null,
      awaitingStaff: held?.cashPaidToName != null,
      firstMonth: isJoinPeriod(month, r),
      chosenBySelf:
        subject.accountUserId !== null &&
        r.assignedBy === subject.accountUserId,
      warning:
        r.status === "active" && paymentRequired
          ? membershipWarning({
              verdict: monthVerdict({
                ...shared,
                paid: paid || paymentStatus === "reported",
                now,
              }),
              periodLabel,
              deadline,
              planName: r.planName,
              timeZone: calendar.timeZone,
            })
          : null,
    };
  });
}
