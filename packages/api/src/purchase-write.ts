import { TRPCError } from "@trpc/server";

import type { DbExec, TenantTx } from "@matops/db";
import type { MonthKey, UpfrontRule } from "@matops/domain";
import { and, eq, gte, inArray, ne, sql } from "@matops/db";
import {
  accessPlan,
  accessPlanEntity,
  accessPlanPrice,
  membershipAccessHold,
  membershipMonth,
  membershipPurchase,
} from "@matops/db/schema";
import {
  appliesInMonth,
  formatMonth,
  monthsFrom,
  priceForMonth,
  splitTotal,
  upfrontStart,
  upfrontTotal,
} from "@matops/domain";

import type { loadAssignment, MonthStatus } from "./month-write";
import {
  appendMonthAudit,
  lockMembershipMonth,
  monthEvidence,
  promotePaidBookings,
} from "./month-write";

type Assignment = Awaited<ReturnType<typeof loadAssignment>>;

export function planRule(plan: {
  discountFromMonths: number | null;
  discountPercent: number | null;
  discountMonthMinor: number | null;
}): UpfrontRule | null {
  if (plan.discountFromMonths === null) return null;
  return {
    fromMonths: plan.discountFromMonths,
    percent: plan.discountPercent,
    monthMinor: plan.discountMonthMinor,
  };
}

export async function takenMonths(
  db: TenantTx,
  assignmentIds: string[],
  fromMonth: MonthKey,
) {
  if (assignmentIds.length === 0) return [];
  return db
    .select({
      assignmentId: membershipMonth.assignmentId,
      month: membershipMonth.month,
      status: membershipMonth.status,
    })
    .from(membershipMonth)
    .where(
      and(
        inArray(membershipMonth.assignmentId, assignmentIds),
        gte(membershipMonth.month, fromMonth),
        ne(membershipMonth.status, "unpaid"),
      ),
    );
}

export async function quotePurchase(
  db: TenantTx,
  assignment: Assignment,
  months: number,
  currentMonth: MonthKey,
) {
  const taken = await takenMonths(db, [assignment.id], currentMonth);
  const firstMonth = upfrontStart(
    currentMonth,
    new Set(taken.map((row) => row.month)),
  );
  const covered = monthsFrom(firstMonth, months);
  if (!covered.every((month) => appliesInMonth(assignment, month))) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This membership ends before the last of those months.",
    });
  }
  const [plan] = await db
    .select({
      discountFromMonths: accessPlan.discountFromMonths,
      discountPercent: accessPlan.discountPercent,
      discountMonthMinor: accessPlan.discountMonthMinor,
    })
    .from(accessPlan)
    .where(eq(accessPlan.id, assignment.planId));
  const prices = await db
    .select({
      effectiveMonth: accessPlanPrice.effectiveMonth,
      priceMinor: accessPlanPrice.priceMinor,
      currency: accessPlanPrice.currency,
    })
    .from(accessPlanPrice)
    .where(eq(accessPlanPrice.planId, assignment.planId));
  const amount = priceForMonth(prices, firstMonth);
  if (!amount) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This membership has no price for that month.",
    });
  }
  const rule = plan ? planRule(plan) : null;
  return {
    firstMonth,
    covered,
    monthlyMinor: amount.priceMinor,
    currency: amount.currency,
    rule,
    ...upfrontTotal(amount.priceMinor, rule, months),
  };
}

export type PurchaseQuote = Awaited<ReturnType<typeof quotePurchase>>;

interface PaymentFields {
  paymentMethodId: string | null;
  cashPaidTo: string | null;
  cashPaidToName: string | null;
  cashPaidOn: string | null;
  paymentNote: string | null;
  proofFileId: string | null;
}

export async function writePurchase(
  db: TenantTx,
  input: {
    organizationId: string;
    assignment: Assignment;
    quote: PurchaseQuote;
    totalMinor: number;
    status: "reported" | "confirmed";
    payment: PaymentFields;
    actorId: string;
    event: string;
    timeZone: string;
    now: Date;
  },
): Promise<{
  purchaseId: string;
  promote: ((exec: DbExec) => Promise<void>) | null;
}> {
  const { assignment, quote, status, now } = input;
  const held = [];
  for (const month of quote.covered) {
    const row = await lockMembershipMonth(db, assignment.id, month);
    if (row && row.status !== "unpaid") {
      throw new TRPCError({
        code: "CONFLICT",
        message: `${formatMonth(month, input.timeZone)} is already paid or waiting for a check. Refresh and try again.`,
      });
    }
    held.push(row);
  }

  const [purchase] = await db
    .insert(membershipPurchase)
    .values({
      organizationId: input.organizationId,
      assignmentId: assignment.id,
      firstMonth: quote.firstMonth,
      months: quote.months,
      totalMinor: input.totalMinor,
      currency: quote.currency,
      discountFromMonths: quote.rule?.fromMonths ?? null,
      discountPercent: quote.rule?.percent ?? null,
      discountMonthMinor: quote.rule?.monthMinor ?? null,
      recordedBy: input.actorId,
    })
    .returning({ id: membershipPurchase.id });
  if (!purchase) throw new Error("membership_purchase insert returned no row");

  const shares = splitTotal(input.totalMinor, quote.months);
  const claim =
    status === "reported"
      ? { claimedBy: input.actorId, reportedAt: now }
      : { reviewedBy: input.actorId, reviewedAt: now, reportedAt: null };

  for (const [i, month] of quote.covered.entries()) {
    const evidence = {
      ...(await monthEvidence(db, assignment, month)),
      priceMinor: shares[i] ?? 0,
      currency: quote.currency,
    };
    const fields = {
      status,
      purchaseId: purchase.id,
      priceMinor: evidence.priceMinor,
      currency: evidence.currency,
      deadline: evidence.deadline,
      calendarTimeZone: evidence.calendarTimeZone,
      ...claim,
      ...input.payment,
    };
    await db
      .insert(membershipMonth)
      .values({
        organizationId: input.organizationId,
        assignmentId: assignment.id,
        month,
        version: 1,
        ...fields,
      })
      .onConflictDoUpdate({
        target: [membershipMonth.assignmentId, membershipMonth.month],
        set: { ...fields, version: sql`${membershipMonth.version} + 1` },
      });
    await appendMonthAudit(db, {
      organizationId: input.organizationId,
      assignmentId: assignment.id,
      month,
      event: input.event,
      beforeStatus: held[i] ? (held[i].status as MonthStatus) : null,
      afterStatus: status,
      evidence,
      actorId: input.actorId,
    });
  }

  if (status !== "confirmed") return { purchaseId: purchase.id, promote: null };
  const coverage = await db
    .select({ entityId: accessPlanEntity.entityId })
    .from(accessPlanEntity)
    .where(eq(accessPlanEntity.planId, assignment.planId));
  return {
    purchaseId: purchase.id,
    promote: async (exec) => {
      for (const month of quote.covered) {
        await promotePaidBookings(
          exec,
          input.organizationId,
          coverage.map((row) => row.entityId),
          assignment.personId,
          month,
          input.timeZone,
        );
      }
    },
  };
}

export async function purchaseRows(db: TenantTx, purchaseId: string) {
  return db
    .select({
      id: membershipMonth.id,
      month: membershipMonth.month,
      status: membershipMonth.status,
    })
    .from(membershipMonth)
    .where(eq(membershipMonth.purchaseId, purchaseId))
    .orderBy(membershipMonth.month);
}

async function heldEvidence(
  db: TenantTx,
  assignment: Assignment,
  held: NonNullable<Awaited<ReturnType<typeof lockMembershipMonth>>>,
) {
  const evidence = await monthEvidence(db, assignment, held.month);
  return {
    priceMinor: held.priceMinor ?? evidence.priceMinor,
    currency: held.currency ?? evidence.currency,
    deadline: held.deadline ?? evidence.deadline,
    calendarTimeZone: held.calendarTimeZone ?? evidence.calendarTimeZone,
  };
}

export async function dropPurchaseMonths(
  db: TenantTx,
  input: {
    organizationId: string;
    assignment: Assignment;
    rows: { id: string; month: string; status: string }[];
    actorId: string;
    event: string;
    reason?: string;
  },
): Promise<number> {
  if (input.rows.length === 0) return 0;
  const holds = await db
    .select({ monthId: membershipAccessHold.membershipMonthId })
    .from(membershipAccessHold)
    .where(
      inArray(
        membershipAccessHold.membershipMonthId,
        input.rows.map((row) => row.id),
      ),
    );
  const kept = new Set(holds.map((h) => h.monthId));
  let dropped = 0;
  for (const row of input.rows) {
    if (kept.has(row.id)) continue;
    const held = await lockMembershipMonth(db, input.assignment.id, row.month);
    if (!held) continue;
    await db.delete(membershipMonth).where(eq(membershipMonth.id, held.id));
    await appendMonthAudit(db, {
      organizationId: input.organizationId,
      assignmentId: input.assignment.id,
      month: row.month,
      event: input.event,
      beforeStatus: held.status as MonthStatus,
      afterStatus: "unpaid",
      reason: input.reason,
      evidence: await heldEvidence(db, input.assignment, held),
      actorId: input.actorId,
    });
    dropped += 1;
  }
  return dropped;
}
