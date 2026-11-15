import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { TenantTx } from "@matops/db";
import type { StorageClient } from "@matops/storage";
import {
  and,
  asc,
  eq,
  getStoredFile,
  gte,
  inArray,
  isNull,
  sql,
  withScope,
} from "@matops/db";
import {
  accessAssignment,
  accessPlan,
  accessPlanEntity,
  accessPlanMethodOff,
  accessPlanPrice,
  membershipAccessHold,
  membershipMonth,
  membershipPurchase,
  paymentMethod,
  person,
} from "@matops/db/schema";
import {
  canMoveClaimStart,
  cardPaymentUrl,
  CASH_PAID_ON_MAX_DAYS,
  cashPaidOnProblem,
  claimStartDay,
  claimStartProblem,
  currentPeriod,
  earliestKey,
  formatDay,
  formatDeadline,
  formatMoney,
  instantFromLocalDate,
  isActiveMember,
  isFreeMembershipMonth,
  isOwner,
  isStaff,
  localDateISO,
  MAX_UPFRONT_MONTHS,
  membershipBanner,
  membershipBannerText,
  monthOf,
  paidUntil,
  payDeadline,
  paymentDay,
  paymentDayLabel,
  paymentReference,
  periodLabel,
  periodLastDay,
  periodsFrom,
  periodsOverlap,
  periodStart,
  priceForMonth,
  RECEIPT_READ_SECONDS,
  rowForMonth,
  runningOn,
  upcomingDueDates,
  upfrontStart,
} from "@matops/domain";
import {
  ClaimMembershipMonthSchema,
  ConfirmClaimSchema,
  DiscardPurchaseSchema,
  MarkMembershipMonthSchema,
  MembershipMonthRefSchema,
  RecordPurchaseSchema,
  RejectMembershipClaimSchema,
  SetDueDateSchema,
} from "@matops/validators";

import type { MonthStatus } from "../../month-write";
import { staffOf } from "../../members";
import {
  assignmentAppliesInMonth,
  enabledPaymentMethods,
  membershipCalendar,
  membershipStanding,
} from "../../membership-status";
import {
  appendMonthAudit,
  ASSIGNMENT_NOT_FOUND,
  loadAssignment,
  lockMembershipMonth,
  monthEvidence,
  requireCurrentPeriod,
  writeMonthDecision,
} from "../../month-write";
import { readOrganizationEntities } from "../../organization-read";
import {
  dropPurchaseMonths,
  planRule,
  purchaseRows,
  quotePurchase,
  takenMonths,
  writePurchase,
} from "../../purchase-write";
import { loadChoosablePlans } from "../../student-plans";
import {
  enrolledProcedure,
  organizationManagerIdentityProcedure,
  organizationManagerProcedure,
  organizationOwnerProcedure,
} from "../../trpc";
import { lockAssignmentsOf } from "./holders";
import { coverageOf, currentMonthOf, pendingChanges } from "./shared";

const MEMBERSHIP_NOT_ACTIVE =
  "That membership is not active, so there is nothing to pay for.";

async function requireProof(
  ctx: {
    db: TenantTx;
    entity: { id: string };
    session: { user: { id: string } };
    storage: StorageClient | null;
  },
  proofFileId: string | undefined,
): Promise<string | null> {
  if (!proofFileId) {
    if (!ctx.storage) return null;
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Add a photo or PDF of your payment.",
    });
  }
  const file = await getStoredFile(
    { academyId: ctx.entity.id, id: proofFileId },
    ctx.db,
  );
  if (
    file?.kind !== "payment_receipt" ||
    file.status !== "ready" ||
    file.uploadedBy !== ctx.session.user.id
  ) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That proof is gone. Upload it again.",
    });
  }
  return file.id;
}

async function claimedPayment(
  ctx: {
    db: TenantTx;
    entity: { id: string };
    session: { user: { id: string } };
    storage: StorageClient | null;
  },
  input: {
    methodId?: string;
    cashPaidTo?: string;
    cashPaidToName?: string;
    cashPaidOn?: string;
    note?: string;
    proofFileId?: string;
  },
  timeZone: string,
  planId: string,
) {
  const none = {
    paymentMethodId: null,
    cashPaidTo: null,
    cashPaidToName: null,
    cashPaidOn: null as string | null,
    paymentNote: input.note?.trim() ? input.note.trim() : null,
    proofFileId: null as string | null,
  };
  if (!input.methodId) {
    return { ...none, proofFileId: await requireProof(ctx, input.proofFileId) };
  }
  const [method] = await ctx.db
    .select({ id: paymentMethod.id, kind: paymentMethod.kind })
    .from(paymentMethod)
    .where(
      and(
        eq(paymentMethod.id, input.methodId),
        eq(paymentMethod.enabled, true),
      ),
    );
  if (!method) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That way to pay is gone. Refresh and pick again.",
    });
  }
  const [off] = await ctx.db
    .select({ planId: accessPlanMethodOff.planId })
    .from(accessPlanMethodOff)
    .where(
      and(
        eq(accessPlanMethodOff.planId, planId),
        eq(accessPlanMethodOff.paymentMethodId, method.id),
      ),
    );
  if (off) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Your gym does not take this way to pay for your plan. Pick another one.",
    });
  }
  if (method.kind !== "cash") {
    return {
      ...none,
      paymentMethodId: method.id,
      proofFileId: await requireProof(ctx, input.proofFileId),
    };
  }

  const staff = input.cashPaidTo
    ? (await staffOf({ academyId: ctx.entity.id, db: ctx.db })).find(
        (s) => s.accountUserId === input.cashPaidTo,
      )
    : undefined;
  if (input.cashPaidTo && !staff) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Pick someone from the list, or write who you paid.",
    });
  }
  const name = staff?.name ?? input.cashPaidToName?.trim();
  if (!name) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Say who you paid, so the gym can check.",
    });
  }
  if (!input.cashPaidOn) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Say on which day you paid.",
    });
  }
  const dateProblem = cashPaidOnProblem(
    input.cashPaidOn,
    localDateISO(new Date(), timeZone),
  );
  if (dateProblem) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        dateProblem === "future"
          ? "The day you paid can't be in the future."
          : `Pick a day in the last ${CASH_PAID_ON_MAX_DAYS} days, or ask the gym.`,
    });
  }
  return {
    ...none,
    paymentMethodId: method.id,
    cashPaidTo: staff?.accountUserId ?? null,
    cashPaidToName: name,
    cashPaidOn: input.cashPaidOn,
  };
}

async function requireNoOpenHold(db: TenantTx, assignmentId: string) {
  const [openHold] = await db
    .select({ id: membershipAccessHold.id })
    .from(membershipAccessHold)
    .where(
      and(
        eq(membershipAccessHold.assignmentId, assignmentId),
        isNull(membershipAccessHold.resolvedAt),
      ),
    )
    .limit(1);
  if (openHold) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "An owner must resolve the rejected payment before you can report again.",
    });
  }
}

function requireMonthVersion(
  current: { version: number } | undefined,
  expectedVersion: number | undefined,
) {
  if (expectedVersion !== undefined && expectedVersion !== current?.version) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "This payment changed while you were looking. Refresh and try again.",
    });
  }
}

export const monthPaymentProcedures = {
  /**
   * Tick one month of one shared membership paid or unpaid.
   *
   * ONE record per membership per month, never one per covered branch: a
   * membership covering a mat and a gym is paid once, so marking it from either
   * branch reaches the same row.
   *
   * Idempotent. Marking a month paid twice writes the row once and reports
   * `changed: false` the second time, so a double click, a retry and a stale
   * form all land on the same state. Only a real change writes an audit row,
   * which is what keeps the history readable: it says what was corrected, not
   * how many times somebody pressed the button.
   */
  markMonth: organizationManagerProcedure
    .input(MarkMembershipMonthSchema)
    .mutation(async ({ ctx, input }) => {
      const assignment = await loadAssignment(ctx.db, input.assignmentId);
      const held = await lockMembershipMonth(
        ctx.db,
        input.assignmentId,
        input.month,
      );
      requireMonthVersion(held, input.expectedVersion);
      const nextStatus: MonthStatus = input.paid ? "confirmed" : "unpaid";
      const currentStatus = (held?.status ?? "unpaid") as MonthStatus;
      if (input.paid && held?.purchaseId && held.status === "reported") {
        let version = held.version;
        for (const row of await purchaseRows(ctx.db, held.purchaseId)) {
          if (row.status !== "reported") continue;
          const rowHeld =
            row.month === input.month
              ? held
              : await lockMembershipMonth(ctx.db, assignment.id, row.month);
          const written = await writeMonthDecision(ctx.db, {
            organizationId: ctx.organizationId,
            assignment,
            month: row.month,
            held: rowHeld,
            nextStatus: "confirmed",
            evidence: await monthEvidence(ctx.db, assignment, row.month),
            actorId: ctx.session.user.id,
            event: "confirmed",
            reason: input.reason,
            now: new Date(),
          });
          if (written.promote) ctx.afterCommit(written.promote);
          if (row.month === input.month) version = written.version;
        }
        return {
          changed: true,
          paid: true,
          status: "confirmed" as const,
          version,
        };
      }
      if (currentStatus === nextStatus) {
        return {
          changed: false,
          paid: input.paid,
          status: nextStatus,
          version: held?.version ?? 0,
        };
      }
      const evidence = await monthEvidence(ctx.db, assignment, input.month);
      const now = new Date();
      const written = await writeMonthDecision(ctx.db, {
        organizationId: ctx.organizationId,
        assignment,
        month: input.month,
        held,
        nextStatus,
        evidence,
        actorId: ctx.session.user.id,
        event: input.paid ? "confirmed" : "corrected",
        reason: input.reason,
        now,
      });
      if (written.promote) ctx.afterCommit(written.promote);
      if (input.paid && input.resolveHoldReason && held) {
        await ctx.db
          .update(membershipAccessHold)
          .set({
            resolvedBy: ctx.session.user.id,
            resolutionReason: input.resolveHoldReason,
            resolvedAt: now,
          })
          .where(
            and(
              eq(membershipAccessHold.assignmentId, input.assignmentId),
              eq(membershipAccessHold.membershipMonthId, held.id),
              isNull(membershipAccessHold.resolvedAt),
            ),
          );
      }
      return {
        changed: true,
        paid: input.paid,
        status: nextStatus,
        version: written.version,
      };
    }),

  /**
   * Every active membership this month, so the owner can tick a batch of them.
   *
   * The same record the member profile ticks, read the other way round: the
   * profile answers "did this person pay", the board answers "who has not". An
   * owner confirming a month works from a bank statement, one pass, so making
   * them walk to each branch and open each person would be the wrong shape for
   * the job.
   *
   * A month with no row is unpaid, and nothing here writes one to tidy the
   * list up.
   */
  monthBoard: organizationManagerProcedure.query(async ({ ctx }) => {
    const calendar = await membershipCalendar(ctx.db);
    const today = localDateISO(new Date(), calendar.timeZone);

    const running = await ctx.db
      .select({
        id: accessAssignment.id,
        userId: accessAssignment.personId,
        name: person.name,
        email: person.email,
        planId: accessAssignment.planId,
        planName: accessPlan.name,
        startMonth: accessAssignment.startMonth,
        startsOn: accessAssignment.startsOn,
        endMonth: accessAssignment.endMonth,
        periodAnchor: accessAssignment.periodAnchor,
        periodAnchorFrom: accessAssignment.periodAnchorFrom,
        createdAt: accessAssignment.createdAt,
      })
      .from(accessAssignment)
      .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
      .innerJoin(person, eq(person.id, accessAssignment.personId))
      .where(
        and(
          eq(accessAssignment.status, "active"),
          // The board is today's bill, so a membership that ended and one that
          // has not started are both off it (ADR 129).
          assignmentAppliesInMonth(today),
        ),
      )
      .orderBy(asc(person.name));
    const held = runningOn(today, running);

    const coverage = held.length
      ? await ctx.db
          .select({
            planId: accessPlanEntity.planId,
            entityId: accessPlanEntity.entityId,
          })
          .from(accessPlanEntity)
      : [];
    const months = held.length
      ? await ctx.db
          .select({
            assignmentId: membershipMonth.assignmentId,
            month: membershipMonth.month,
            status: membershipMonth.status,
            deadline: membershipMonth.deadline,
          })
          .from(membershipMonth)
          .where(
            and(
              inArray(
                membershipMonth.assignmentId,
                held.map((a) => a.id),
              ),
              gte(
                membershipMonth.month,
                earliestKey(
                  held.map((a) => a.month),
                  today,
                ),
              ),
            ),
          )
      : [];

    const prices = held.length
      ? await ctx.db
          .select({
            planId: accessPlanPrice.planId,
            effectiveMonth: accessPlanPrice.effectiveMonth,
            priceMinor: accessPlanPrice.priceMinor,
            currency: accessPlanPrice.currency,
          })
          .from(accessPlanPrice)
      : [];

    const ahead = await takenMonths(
      ctx.db,
      held.map((a) => a.id),
      earliestKey(
        held.map((a) => a.month),
        today,
      ),
    );
    const rows = held.map((a) => {
      const month = a.month;
      const record = months.find(
        (m) => m.assignmentId === a.id && m.month === month,
      );
      const until = paidUntil(
        month,
        new Set(
          ahead
            .filter((m) => m.assignmentId === a.id && m.status === "confirmed")
            .map((m) => m.month),
        ),
        a,
      );
      const amount = priceForMonth(
        prices.filter((p) => p.planId === a.planId),
        month,
      );
      const paymentRequired = !isFreeMembershipMonth(amount);
      const computedDeadline = payDeadline({
        month,
        startMonth: a.startMonth,
        joinedOn: a.startsOn,
        policy: calendar,
      });
      const deadline = record?.deadline ?? computedDeadline;
      return {
        assignmentId: a.id,
        userId: a.userId,
        name: a.name,
        email: a.email,
        planName: a.planName,
        entityIds: coverage
          .filter((c) => c.planId === a.planId)
          .map((c) => c.entityId)
          .sort(),
        month,
        periodLabel: periodLabel(month, a),
        paid: record?.status === "confirmed",
        paidUntilLabel:
          until && until !== month ? formatDay(periodLastDay(until, a)) : null,
        // What THIS period cost, which a later price change must not rewrite.
        amount,
        paymentRequired,
        deadline,
        deadlineMoved:
          record?.deadline != null &&
          record.deadline.getTime() !== computedDeadline.getTime(),
        deadlineLabel: formatDeadline(deadline, calendar.timeZone),
        deadlineOn: localDateISO(deadline, calendar.timeZone),
        dueDates: upcomingDueDates({
          current: month,
          schedule: a,
          recorded: months.filter((m) => m.assignmentId === a.id),
          policy: calendar,
        }),
        overdue: paymentRequired && deadline.getTime() <= Date.now(),
      };
    });

    return {
      month: monthOf(new Date(), calendar.timeZone),
      timeZone: calendar.timeZone,
      paidCount: rows.filter((r) => r.paid).length,
      // Plans an owner has not priced yet. Named rather than counted into a
      // total, because a missing price is a gap to fix and not a zero.
      unpriced: rows.filter((r) => r.amount === null).length,
      rows,
    };
  }),

  /**
   * A member says they sent the transfer for the month they are being judged on.
   *
   * The server picks the period, never the caller: it is the assignment's
   * current period in the organization's own calendar zone, which is the same
   * period `mine` shows them, join period included. A claim that could name a month would need a rule about
   * which months are claimable, and that rule would be a second opinion about
   * something `membershipStanding` already decides.
   *
   * Idempotent: a second press finds the claim and reports `claimed: false`.
   */
  claimMonth: enrolledProcedure
    .input(ClaimMembershipMonthSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.membership.personId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Your account is not linked to a person record.",
        });
      }
      const [assignment] = await ctx.db
        .select({
          id: accessAssignment.id,
          personId: accessAssignment.personId,
          planId: accessAssignment.planId,
          status: accessAssignment.status,
          startMonth: accessAssignment.startMonth,
          startsOn: accessAssignment.startsOn,
          endMonth: accessAssignment.endMonth,
          periodAnchor: accessAssignment.periodAnchor,
          periodAnchorFrom: accessAssignment.periodAnchorFrom,
          assigningEntityId: accessAssignment.assigningEntityId,
          accountUserId: person.accountUserId,
          userId: accessAssignment.personId,
        })
        .from(accessAssignment)
        .innerJoin(person, eq(person.id, accessAssignment.personId))
        .where(
          and(
            eq(accessAssignment.id, input.assignmentId),
            eq(accessAssignment.personId, ctx.membership.personId),
          ),
        );
      if (!assignment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: ASSIGNMENT_NOT_FOUND,
        });
      }
      if (assignment.status !== "active") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: MEMBERSHIP_NOT_ACTIVE,
        });
      }

      const calendar = await membershipCalendar(ctx.db);
      const month = requireCurrentPeriod(assignment, calendar.timeZone);
      if (input.months !== undefined) {
        const quote = await quotePurchase(
          ctx.db,
          assignment,
          input.months,
          month,
        );
        if (input.months > 1 || quote.firstMonth !== month) {
          await requireNoOpenHold(ctx.db, assignment.id);
          if (!input.methodId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Pay for more than this period by cash or bank transfer.",
            });
          }
          if (
            input.priceMinor !== undefined &&
            (input.priceMinor !== quote.totalMinor ||
              input.currency !== quote.currency)
          ) {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "The membership price changed. Refresh before reporting payment.",
            });
          }
          const payment = await claimedPayment(
            ctx,
            input,
            calendar.timeZone,
            assignment.planId,
          );
          await writePurchase(ctx.db, {
            organizationId: ctx.organizationId,
            assignment,
            quote,
            totalMinor: quote.totalMinor,
            status: "reported",
            payment,
            actorId: ctx.session.user.id,
            event: "reported",
            timeZone: calendar.timeZone,
            now: new Date(),
          });
          return {
            claimed: true,
            month: quote.firstMonth,
            status: "reported" as const,
            version: 1,
          };
        }
      }
      const held = await lockMembershipMonth(ctx.db, assignment.id, month);
      requireMonthVersion(held, input.expectedVersion);
      const currentStatus = (held?.status ?? "unpaid") as MonthStatus;
      if (currentStatus !== "unpaid") {
        return {
          claimed: false,
          month,
          status: currentStatus,
          version: held?.version ?? 0,
        };
      }
      await requireNoOpenHold(ctx.db, assignment.id);
      const evidence = await monthEvidence(ctx.db, assignment, month);
      if (evidence.priceMinor === 0) {
        return { claimed: false, month, status: "unpaid" as const, version: 0 };
      }
      if (
        input.priceMinor !== undefined &&
        (input.priceMinor !== evidence.priceMinor ||
          input.currency !== evidence.currency)
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "The membership price changed. Refresh before reporting payment.",
        });
      }
      const payment = await claimedPayment(
        ctx,
        input,
        calendar.timeZone,
        assignment.planId,
      );
      const now = new Date();
      const [saved] = await ctx.db
        .insert(membershipMonth)
        .values({
          organizationId: ctx.organizationId,
          assignmentId: input.assignmentId,
          month,
          status: "reported",
          version: 1,
          claimedBy: ctx.session.user.id,
          priceMinor: evidence.priceMinor,
          currency: evidence.currency,
          deadline: evidence.deadline,
          calendarTimeZone: evidence.calendarTimeZone,
          reportedAt: now,
          ...payment,
        })
        .onConflictDoUpdate({
          target: [membershipMonth.assignmentId, membershipMonth.month],
          set: {
            status: "reported",
            version: sql`${membershipMonth.version} + 1`,
            claimedBy: ctx.session.user.id,
            reportedAt: now,
            ...payment,
            priceMinor: held?.priceMinor ?? evidence.priceMinor,
            currency: held?.currency ?? evidence.currency,
            deadline: held?.deadline ?? evidence.deadline,
            calendarTimeZone:
              held?.calendarTimeZone ?? evidence.calendarTimeZone,
          },
        })
        .returning({ version: membershipMonth.version });
      await appendMonthAudit(ctx.db, {
        organizationId: ctx.organizationId,
        assignmentId: input.assignmentId,
        month,
        event: "reported",
        beforeStatus: held ? currentStatus : null,
        afterStatus: "reported",
        evidence,
        actorId: ctx.session.user.id,
      });
      return {
        claimed: true,
        month,
        status: "reported" as const,
        version: saved?.version ?? 1,
      };
    }),

  /**
   * Claims waiting for the owner, oldest first, because the queue is a to-do
   * list rather than a feed.
   */
  claims: organizationManagerProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        assignmentId: membershipMonth.assignmentId,
        month: membershipMonth.month,
        version: membershipMonth.version,
        priceMinor: membershipMonth.priceMinor,
        currency: membershipMonth.currency,
        reportedAt: membershipMonth.reportedAt,
        planId: accessAssignment.planId,
        startsOn: accessAssignment.startsOn,
        discountFromMonths: accessPlan.discountFromMonths,
        discountPercent: accessPlan.discountPercent,
        discountMonthMinor: accessPlan.discountMonthMinor,
        personId: accessAssignment.personId,
        userId: accessAssignment.personId,
        startMonth: accessAssignment.startMonth,
        endMonth: accessAssignment.endMonth,
        periodAnchor: accessAssignment.periodAnchor,
        periodAnchorFrom: accessAssignment.periodAnchorFrom,
        name: person.name,
        email: person.email,
        planName: accessPlan.name,
        methodLabel: paymentMethod.label,
        methodKind: paymentMethod.kind,
        cashPaidToName: membershipMonth.cashPaidToName,
        cashPaidOn: membershipMonth.cashPaidOn,
        note: membershipMonth.paymentNote,
        hasProof: sql<boolean>`${membershipMonth.proofFileId} is not null`,
        purchaseId: membershipMonth.purchaseId,
        purchaseMonths: membershipPurchase.months,
        purchaseTotalMinor: membershipPurchase.totalMinor,
        purchaseCurrency: membershipPurchase.currency,
      })
      .from(membershipMonth)
      .leftJoin(
        membershipPurchase,
        eq(membershipPurchase.id, membershipMonth.purchaseId),
      )
      .innerJoin(
        accessAssignment,
        eq(accessAssignment.id, membershipMonth.assignmentId),
      )
      .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
      .innerJoin(person, eq(person.id, accessAssignment.personId))
      .leftJoin(
        paymentMethod,
        eq(paymentMethod.id, membershipMonth.paymentMethodId),
      )
      .where(eq(membershipMonth.status, "reported"))
      .orderBy(asc(membershipMonth.reportedAt), asc(membershipMonth.month));
    const { timeZone } = await membershipCalendar(ctx.db);
    const assignmentIds = [...new Set(rows.map((r) => r.assignmentId))];
    const confirmed = assignmentIds.length
      ? await ctx.db
          .selectDistinct({ assignmentId: membershipMonth.assignmentId })
          .from(membershipMonth)
          .where(
            and(
              inArray(membershipMonth.assignmentId, assignmentIds),
              eq(membershipMonth.status, "confirmed"),
            ),
          )
      : [];
    const anyConfirmed = new Set(confirmed.map((m) => m.assignmentId));
    const planPrices = rows.length
      ? await ctx.db
          .select({
            planId: accessPlanPrice.planId,
            effectiveMonth: accessPlanPrice.effectiveMonth,
            priceMinor: accessPlanPrice.priceMinor,
            currency: accessPlanPrice.currency,
          })
          .from(accessPlanPrice)
          .where(
            inArray(accessPlanPrice.planId, [
              ...new Set(rows.map((r) => r.planId)),
            ]),
          )
      : [];
    const seen = new Set<string>();
    return rows.flatMap(
      ({
        purchaseMonths,
        purchaseTotalMinor,
        purchaseCurrency,
        startMonth,
        endMonth,
        periodAnchor,
        periodAnchorFrom,
        version,
        priceMinor,
        currency,
        planId,
        startsOn,
        discountFromMonths,
        discountPercent,
        discountMonthMinor,
        ...r
      }) => {
        if (r.purchaseId && seen.has(r.purchaseId)) return [];
        if (r.purchaseId) seen.add(r.purchaseId);
        const months = purchaseMonths ?? 1;
        const period = { startMonth, endMonth, periodAnchor, periodAnchorFrom };
        const last = periodsFrom(r.month, period, months).at(-1) ?? r.month;
        const reportedOn = localDateISO(r.reportedAt ?? new Date(), timeZone);
        const startEditable = canMoveClaimStart({
          claimFirstMonth: r.month,
          schedule: period,
          anyConfirmed: anyConfirmed.has(r.assignmentId),
        });
        const monthly = priceForMonth(
          planPrices.filter((p) => p.planId === planId),
          r.month,
        );
        return [
          {
            ...r,
            version,
            confirm: {
              startEditable,
              startsOn: startEditable
                ? claimStartDay({ cashPaidOn: r.cashPaidOn, reportedOn })
                : startMonth,
              joinedOn: startsOn,
              startMin: periodStart(reportedOn, -1),
              startMax: localDateISO(new Date(), timeZone),
              months,
              totalMinor: purchaseTotalMinor ?? priceMinor,
              currency: purchaseCurrency ?? currency ?? monthly?.currency,
              monthlyMinor: monthly?.priceMinor ?? null,
              rule: planRule({
                discountFromMonths,
                discountPercent,
                discountMonthMinor,
              }),
              schedule: period,
              maxMonths: MAX_UPFRONT_MONTHS,
            },
            monthLabel: periodLabel(r.month, period),
            purchase:
              r.purchaseId && purchaseTotalMinor !== null && purchaseCurrency
                ? {
                    months,
                    totalMinor: purchaseTotalMinor,
                    currency: purchaseCurrency,
                    lastMonthLabel: formatDay(periodLastDay(last, period)),
                  }
                : null,
          },
        ];
      },
    );
  }),

  proofUrl: organizationManagerIdentityProcedure
    .input(MembershipMonthRefSchema)
    .mutation(async ({ ctx, input }) => {
      const storage = ctx.storage;
      const proofFileId = await withScope(
        { organizationId: ctx.organizationId },
        async (tx) => {
          const [row] = await tx
            .select({ proofFileId: membershipMonth.proofFileId })
            .from(membershipMonth)
            .where(
              and(
                eq(membershipMonth.assignmentId, input.assignmentId),
                eq(membershipMonth.month, input.month),
              ),
            );
          return row?.proofFileId ?? null;
        },
        ctx.baseDb,
      );
      if (!proofFileId || !storage) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This payment has no proof, or it was deleted.",
        });
      }
      const branches = await readOrganizationEntities(
        ctx.organizationId,
        ctx.baseDb,
      );
      for (const branch of branches) {
        const file = await withScope(
          { organizationId: ctx.organizationId, entityId: branch.id },
          (tx) => getStoredFile({ academyId: branch.id, id: proofFileId }, tx),
          ctx.baseDb,
        );
        if (file?.kind === "payment_receipt") {
          return {
            url: await storage.presignGet(file.objectKey, RECEIPT_READ_SECONDS),
          };
        }
      }
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "This payment has no proof, or it was deleted.",
      });
    }),

  recordPurchase: organizationManagerProcedure
    .input(RecordPurchaseSchema)
    .mutation(async ({ ctx, input }) => {
      const assignment = await loadAssignment(ctx.db, input.assignmentId);
      if (assignment.status !== "active") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: MEMBERSHIP_NOT_ACTIVE,
        });
      }
      const calendar = await membershipCalendar(ctx.db);
      const month = requireCurrentPeriod(assignment, calendar.timeZone);
      const quote = await quotePurchase(
        ctx.db,
        assignment,
        input.months,
        month,
      );
      if (
        input.totalMinor !== undefined &&
        input.totalMinor !== quote.totalMinor &&
        !isOwner(ctx.orgMembership)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the owner can change the total.",
        });
      }
      if (input.methodId) {
        const [method] = await ctx.db
          .select({ id: paymentMethod.id })
          .from(paymentMethod)
          .where(eq(paymentMethod.id, input.methodId));
        if (!method) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "That way to pay is gone. Refresh and pick again.",
          });
        }
      }
      const written = await writePurchase(ctx.db, {
        organizationId: ctx.organizationId,
        assignment,
        quote,
        totalMinor: input.totalMinor ?? quote.totalMinor,
        status: "confirmed",
        payment: {
          paymentMethodId: input.methodId ?? null,
          cashPaidTo: null,
          cashPaidToName: null,
          cashPaidOn: null,
          paymentNote: input.note?.trim() ? input.note.trim() : null,
          proofFileId: null,
        },
        actorId: ctx.session.user.id,
        event: "confirmed",
        timeZone: calendar.timeZone,
        now: new Date(),
      });
      if (written.promote) ctx.afterCommit(written.promote);
      return {
        purchaseId: written.purchaseId,
        firstMonth: quote.firstMonth,
        lastMonth: quote.covered.at(-1) ?? quote.firstMonth,
      };
    }),

  discardPurchase: organizationOwnerProcedure
    .input(DiscardPurchaseSchema)
    .mutation(async ({ ctx, input }) => {
      const [purchase] = await ctx.db
        .select({
          id: membershipPurchase.id,
          assignmentId: membershipPurchase.assignmentId,
        })
        .from(membershipPurchase)
        .where(
          and(
            eq(membershipPurchase.id, input.purchaseId),
            isNull(membershipPurchase.discardedAt),
          ),
        );
      if (!purchase) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That purchase is gone. Refresh and try again.",
        });
      }
      const assignment = await loadAssignment(ctx.db, purchase.assignmentId);
      const { timeZone } = await membershipCalendar(ctx.db);
      const month =
        currentPeriod(localDateISO(new Date(), timeZone), assignment) ??
        localDateISO(new Date(), timeZone);
      const rows = (await purchaseRows(ctx.db, purchase.id)).filter(
        (row) => row.month > month || row.status === "reported",
      );
      const dropped = await dropPurchaseMonths(ctx.db, {
        organizationId: ctx.organizationId,
        assignment,
        rows,
        actorId: ctx.session.user.id,
        event: "discarded",
      });
      await ctx.db
        .update(membershipPurchase)
        .set({ discardedAt: new Date(), discardedBy: ctx.session.user.id })
        .where(eq(membershipPurchase.id, purchase.id));
      return { dropped };
    }),

  /**
   * Clear a claim without marking the month paid. No audit row: the audit is
   * the history of the paid flag, and a rejection does not change it. The
   * member may claim again.
   */
  rejectClaim: organizationManagerProcedure
    .input(RejectMembershipClaimSchema)
    .mutation(async ({ ctx, input }) => {
      const assignment = await loadAssignment(ctx.db, input.assignmentId);
      const held = await lockMembershipMonth(
        ctx.db,
        input.assignmentId,
        input.month,
      );
      requireMonthVersion(held, input.expectedVersion);
      if (held?.status !== "reported") {
        return { cleared: false, status: held?.status ?? "unpaid" };
      }
      if (!assignment.personId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "This membership must belong to a person before its payment can be rejected.",
        });
      }
      const personId = assignment.personId;
      const evidence = await monthEvidence(ctx.db, assignment, input.month);
      const now = new Date();
      const [saved] = await ctx.db
        .update(membershipMonth)
        .set({
          status: "rejected",
          version: sql`${membershipMonth.version} + 1`,
          reviewedBy: ctx.session.user.id,
          reviewedAt: now,
        })
        .where(eq(membershipMonth.id, held.id))
        .returning({ version: membershipMonth.version });
      const coverage = await coverageOf(ctx.db, assignment.planId);
      if (coverage.length > 0) {
        await ctx.db
          .insert(membershipAccessHold)
          .values(
            coverage.map((entityId) => ({
              organizationId: ctx.organizationId,
              personId,
              assignmentId: assignment.id,
              membershipMonthId: held.id,
              entityId,
              rejectedBy: ctx.session.user.id,
              rejectionReason: input.reason,
            })),
          )
          .onConflictDoNothing();
      }
      await appendMonthAudit(ctx.db, {
        organizationId: ctx.organizationId,
        assignmentId: input.assignmentId,
        month: input.month,
        event: "rejected",
        beforeStatus: "reported",
        afterStatus: "rejected",
        reason: input.reason,
        evidence,
        actorId: ctx.session.user.id,
      });
      if (held.purchaseId) {
        const rest = (await purchaseRows(ctx.db, held.purchaseId)).filter(
          (row) => row.id !== held.id && row.status === "reported",
        );
        await dropPurchaseMonths(ctx.db, {
          organizationId: ctx.organizationId,
          assignment,
          rows: rest,
          actorId: ctx.session.user.id,
          event: "rejected",
          reason: input.reason,
        });
        await ctx.db
          .update(membershipPurchase)
          .set({ discardedAt: now, discardedBy: ctx.session.user.id })
          .where(eq(membershipPurchase.id, held.purchaseId));
      }
      return {
        cleared: true,
        status: "rejected" as const,
        version: saved?.version ?? held.version + 1,
      };
    }),

  /**
   * Confirm a payment claim with its start day and months (ADR 164). The
   * defaults come from the claim; only the owner may change them.
   */
  confirmClaim: organizationManagerProcedure
    .input(ConfirmClaimSchema)
    .mutation(async ({ ctx, input }) => {
      const loaded = await loadAssignment(ctx.db, input.assignmentId);
      const locked = await lockAssignmentsOf(
        ctx.db,
        loaded.personId,
        ctx.organizationId,
      );
      const held = await lockMembershipMonth(ctx.db, loaded.id, input.month);
      requireMonthVersion(held, input.expectedVersion);
      if (held?.status !== "reported") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Someone already handled this payment. Refresh the list.",
        });
      }
      const claimRows = held.purchaseId
        ? (await purchaseRows(ctx.db, held.purchaseId)).filter(
            (row) => row.status === "reported",
          )
        : [{ id: held.id, month: held.month, status: held.status }];
      const [purchase] = held.purchaseId
        ? await ctx.db
            .select({ totalMinor: membershipPurchase.totalMinor })
            .from(membershipPurchase)
            .where(eq(membershipPurchase.id, held.purchaseId))
        : [];
      const claimFirstMonth = claimRows[0]?.month ?? held.month;
      const claimedMonths = claimRows.length;
      const claimedTotal = purchase?.totalMinor ?? held.priceMinor;

      const calendar = await membershipCalendar(ctx.db);
      const now = new Date();
      const today = localDateISO(now, calendar.timeZone);
      const reportedOn = localDateISO(
        held.reportedAt ?? now,
        calendar.timeZone,
      );
      const [confirmedRow] = await ctx.db
        .select({ id: membershipMonth.id })
        .from(membershipMonth)
        .where(
          and(
            eq(membershipMonth.assignmentId, loaded.id),
            eq(membershipMonth.status, "confirmed"),
          ),
        )
        .limit(1);
      const startEditable = canMoveClaimStart({
        claimFirstMonth,
        schedule: loaded,
        anyConfirmed: confirmedRow !== undefined,
      });
      const defaultStart = startEditable
        ? claimStartDay({ cashPaidOn: held.cashPaidOn, reportedOn })
        : loaded.startMonth;
      if (
        input.startsOn !== undefined &&
        !startEditable &&
        input.startsOn !== loaded.startMonth
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "The start day only changes with a first payment. Use Payment date on their Membership tab.",
        });
      }
      const startsOn = input.startsOn ?? defaultStart;
      const months = input.months ?? claimedMonths;
      const totalChanged =
        input.totalMinor !== undefined && input.totalMinor !== claimedTotal;
      if (
        (startsOn !== defaultStart ||
          months !== claimedMonths ||
          totalChanged) &&
        !isOwner(ctx.orgMembership)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Only the owner can change the start day, months or total. Confirm it as reported.",
        });
      }
      const moveStart = startEditable && startsOn !== loaded.startMonth;
      if (moveStart) {
        const problem = claimStartProblem({ startsOn, today, reportedOn });
        if (problem) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              problem === "after_today"
                ? "Pick today or an earlier day to start."
                : `Pick a start day from ${formatDay(periodStart(reportedOn, -1))}.`,
          });
        }
      }

      if (!moveStart && months === claimedMonths && !totalChanged) {
        let version = held.version;
        for (const row of claimRows) {
          const rowHeld =
            row.month === held.month
              ? held
              : await lockMembershipMonth(ctx.db, loaded.id, row.month);
          const written = await writeMonthDecision(ctx.db, {
            organizationId: ctx.organizationId,
            assignment: loaded,
            month: row.month,
            held: rowHeld,
            nextStatus: "confirmed",
            evidence: await monthEvidence(ctx.db, loaded, row.month),
            actorId: ctx.session.user.id,
            event: "confirmed",
            reason: input.reason,
            now,
          });
          if (written.promote) ctx.afterCommit(written.promote);
          if (row.month === held.month) version = written.version;
        }
        return {
          version,
          firstMonth: claimFirstMonth,
          months: claimedMonths,
        };
      }

      const replaced = moveStart
        ? await ctx.db
            .select({
              id: membershipMonth.id,
              month: membershipMonth.month,
              status: membershipMonth.status,
            })
            .from(membershipMonth)
            .where(eq(membershipMonth.assignmentId, loaded.id))
        : claimRows;
      const [holdRow] = replaced.length
        ? await ctx.db
            .select({ id: membershipAccessHold.id })
            .from(membershipAccessHold)
            .where(
              inArray(
                membershipAccessHold.membershipMonthId,
                replaced.map((row) => row.id),
              ),
            )
            .limit(1)
        : [];
      if (holdRow) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "A payment on this membership was declined before. Confirm this one as reported.",
        });
      }
      await dropPurchaseMonths(ctx.db, {
        organizationId: ctx.organizationId,
        assignment: loaded,
        rows: replaced,
        actorId: ctx.session.user.id,
        event: "claim_adjusted",
      });
      if (held.purchaseId) {
        await ctx.db
          .update(membershipPurchase)
          .set({ discardedAt: now, discardedBy: ctx.session.user.id })
          .where(eq(membershipPurchase.id, held.purchaseId));
      }
      if (moveStart) {
        const clash = locked.some(
          (a) =>
            a.id !== loaded.id &&
            a.planId === loaded.planId &&
            a.status !== "cancelled" &&
            periodsOverlap(a, {
              startMonth: startsOn,
              endMonth: loaded.endMonth,
            }),
        );
        if (clash) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "They already hold this plan on that day. Pick a later start day.",
          });
        }
        await ctx.db
          .update(accessAssignment)
          .set({ startMonth: startsOn, startsOn })
          .where(eq(accessAssignment.id, loaded.id));
      }
      const assignment = await loadAssignment(ctx.db, loaded.id);
      const firstMonth = moveStart ? startsOn : claimFirstMonth;
      const quote = await quotePurchase(ctx.db, assignment, months, firstMonth);
      const payment = {
        paymentMethodId: held.paymentMethodId,
        cashPaidTo: held.cashPaidTo,
        cashPaidToName: held.cashPaidToName,
        cashPaidOn: held.cashPaidOn,
        paymentNote: held.paymentNote,
        proofFileId: held.proofFileId,
      };
      const totalMinor = totalChanged
        ? (input.totalMinor ?? quote.totalMinor)
        : months === claimedMonths && claimedTotal !== null
          ? claimedTotal
          : quote.totalMinor;
      let version = 1;
      if (months === 1 && totalMinor === quote.monthlyMinor) {
        const evidence = await monthEvidence(
          ctx.db,
          assignment,
          quote.firstMonth,
        );
        const written = await writeMonthDecision(ctx.db, {
          organizationId: ctx.organizationId,
          assignment,
          month: quote.firstMonth,
          held: await lockMembershipMonth(
            ctx.db,
            assignment.id,
            quote.firstMonth,
          ),
          nextStatus: "confirmed",
          evidence,
          actorId: ctx.session.user.id,
          event: "confirmed",
          reason: input.reason,
          now,
        });
        await ctx.db
          .update(membershipMonth)
          .set({ ...payment, claimedBy: held.claimedBy })
          .where(
            and(
              eq(membershipMonth.assignmentId, assignment.id),
              eq(membershipMonth.month, quote.firstMonth),
            ),
          );
        if (written.promote) ctx.afterCommit(written.promote);
        version = written.version;
      } else {
        const written = await writePurchase(ctx.db, {
          organizationId: ctx.organizationId,
          assignment,
          quote,
          totalMinor,
          status: "confirmed",
          payment,
          actorId: ctx.session.user.id,
          event: "confirmed",
          timeZone: calendar.timeZone,
          now,
        });
        if (written.promote) ctx.afterCommit(written.promote);
      }
      await appendMonthAudit(ctx.db, {
        organizationId: ctx.organizationId,
        assignmentId: assignment.id,
        month: quote.firstMonth,
        event: "claim_adjusted",
        beforeStatus: "reported",
        afterStatus: "confirmed",
        reason: [
          `Starts ${quote.firstMonth}, ${months} month${months === 1 ? "" : "s"}, ${formatMoney(totalMinor, quote.currency)}`,
          input.reason,
        ]
          .filter(Boolean)
          .join(": "),
        evidence: await monthEvidence(ctx.db, assignment, quote.firstMonth),
        actorId: ctx.session.user.id,
      });
      return { version, firstMonth: quote.firstMonth, months };
    }),

  /**
   * Move the moment one period stops admitting, or put it back (ADR 163).
   *
   * The date is the first day booking is closed, the same instant every
   * deadline in this module names. The stored deadline wins over the computed
   * one everywhere, and claims and decisions keep it.
   */
  setDueDate: organizationOwnerProcedure
    .input(SetDueDateSchema)
    .mutation(async ({ ctx, input }) => {
      const assignment = await loadAssignment(ctx.db, input.assignmentId);
      const held = await lockMembershipMonth(
        ctx.db,
        assignment.id,
        input.month,
      );
      if (
        input.expectedVersion !== undefined &&
        input.expectedVersion !== (held?.version ?? 0)
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This payment changed while you were looking. Refresh and try again.",
        });
      }
      const calendar = await membershipCalendar(ctx.db);
      const today = localDateISO(new Date(), calendar.timeZone);
      const current = currentPeriod(today, assignment);
      if (current === null || input.month < current) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Only the current or a later period can get a new date.",
        });
      }
      const computed = await monthEvidence(ctx.db, assignment, input.month);
      const deadline = input.stopsOn
        ? instantFromLocalDate(input.stopsOn, 0, calendar.timeZone)
        : computed.deadline;
      const evidence = { ...computed, deadline };
      const [saved] = await ctx.db
        .insert(membershipMonth)
        .values({
          organizationId: ctx.organizationId,
          assignmentId: assignment.id,
          month: input.month,
          status: "unpaid",
          version: 1,
          priceMinor: computed.priceMinor,
          currency: computed.currency,
          deadline,
          calendarTimeZone: computed.calendarTimeZone,
        })
        .onConflictDoUpdate({
          target: [membershipMonth.assignmentId, membershipMonth.month],
          set: { deadline, version: sql`${membershipMonth.version} + 1` },
        })
        .returning({ version: membershipMonth.version });
      const status = (held?.status ?? "unpaid") as MonthStatus;
      await appendMonthAudit(ctx.db, {
        organizationId: ctx.organizationId,
        assignmentId: assignment.id,
        month: input.month,
        event: input.stopsOn ? "due_date_changed" : "due_date_reset",
        beforeStatus: held ? status : null,
        afterStatus: status,
        reason: input.reason,
        evidence,
        actorId: ctx.session.user.id,
      });
      return {
        version: saved?.version ?? 1,
        deadline,
        deadlineLabel: formatDeadline(deadline, calendar.timeZone),
      };
    }),

  /**
   * Where the signed-in person stands on their own memberships.
   *
   * Enrolled tier, so both clients call the same thing and cannot drift, and a
   * pending member can see what they will owe. One row per membership, never
   * one per covered branch: somebody covered at a mat and a gym is warned once.
   */
  mine: enrolledProcedure.query(async ({ ctx }) => {
    const memberships = await membershipStanding(
      ctx.db,
      {
        personId: ctx.membership.personId,
        accountUserId: ctx.session.user.id,
      },
      new Date(),
    );
    const { today, timeZone } = await currentMonthOf(ctx.db);
    // A change waiting to start is the member's business too: they should read
    // what they will be on and what it costs before it happens (ADR 129).
    const waiting = await pendingChanges(ctx.db, today, {
      personId: ctx.membership.personId,
      accountUserId: ctx.session.user.id,
    });
    const successors = waiting.length
      ? await ctx.db
          .select({
            id: accessAssignment.id,
            planId: accessAssignment.planId,
            planName: accessPlan.name,
          })
          .from(accessAssignment)
          .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
          .where(
            inArray(
              accessAssignment.id,
              waiting.map((c) => c.targetAssignmentId),
            ),
          )
      : [];
    const prices = successors.length
      ? await ctx.db
          .select({
            planId: accessPlanPrice.planId,
            effectiveMonth: accessPlanPrice.effectiveMonth,
            priceMinor: accessPlanPrice.priceMinor,
            currency: accessPlanPrice.currency,
          })
          .from(accessPlanPrice)
      : [];
    const coverage = successors.length
      ? await ctx.db
          .select({
            planId: accessPlanEntity.planId,
            entityId: accessPlanEntity.entityId,
          })
          .from(accessPlanEntity)
      : [];
    const planIds = [...new Set(memberships.map((m) => m.planId))];
    const ahead = await takenMonths(
      ctx.db,
      memberships.map((m) => m.assignmentId),
      memberships.reduce((min, m) => (m.month < min ? m.month : min), today),
    );
    const rules = planIds.length
      ? await ctx.db
          .select({
            id: accessPlan.id,
            discountFromMonths: accessPlan.discountFromMonths,
            discountPercent: accessPlan.discountPercent,
            discountMonthMinor: accessPlan.discountMonthMinor,
          })
          .from(accessPlan)
          .where(inArray(accessPlan.id, planIds))
      : [];
    const planPrices = planIds.length
      ? await ctx.db
          .select({
            planId: accessPlanPrice.planId,
            effectiveMonth: accessPlanPrice.effectiveMonth,
            priceMinor: accessPlanPrice.priceMinor,
            currency: accessPlanPrice.currency,
          })
          .from(accessPlanPrice)
          .where(inArray(accessPlanPrice.planId, planIds))
      : [];
    const upfrontOf = (m: (typeof memberships)[number]) => {
      const rows = ahead.filter(
        (a) => a.assignmentId === m.assignmentId && a.month >= m.month,
      );
      const until = paidUntil(
        m.month,
        new Set(
          rows.filter((a) => a.status === "confirmed").map((a) => a.month),
        ),
        m,
      );
      const firstMonth = upfrontStart(
        m.month,
        new Set(rows.map((a) => a.month)),
        m,
      );
      const amount = priceForMonth(
        planPrices.filter((p) => p.planId === m.planId),
        firstMonth,
      );
      const plan = rules.find((r) => r.id === m.planId);
      return {
        paidUntil: until,
        paidUntilLabel: until ? formatDay(periodLastDay(until, m)) : null,
        upfront: amount
          ? {
              firstMonth,
              firstMonthLabel: formatDay(firstMonth),
              periods: periodsFrom(firstMonth, m, MAX_UPFRONT_MONTHS).map(
                (start) => ({
                  start,
                  lastDayLabel: formatDay(periodLastDay(start, m)),
                }),
              ),
              monthlyMinor: amount.priceMinor,
              currency: amount.currency,
              rule: plan ? planRule(plan) : null,
              maxMonths: MAX_UPFRONT_MONTHS,
            }
          : null,
      };
    };
    const links = memberships.length
      ? await ctx.db
          .select({
            assignmentId: accessAssignment.id,
            effectiveMonth: accessPlanPrice.effectiveMonth,
            paymentLinkUrl: accessPlanPrice.paymentLinkUrl,
          })
          .from(accessAssignment)
          .innerJoin(
            accessPlanPrice,
            eq(accessPlanPrice.planId, accessAssignment.planId),
          )
          .where(
            inArray(
              accessAssignment.id,
              memberships.map((m) => m.assignmentId),
            ),
          )
      : [];

    const cardLink = (
      link: string | null | undefined,
      assignmentId: string,
      month: string,
    ) =>
      link
        ? cardPaymentUrl(link, {
            assignmentId,
            month,
            email: ctx.session.user.email,
          })
        : null;

    const paymentsOn = ctx.entity.membershipEnforcedAt !== null;
    const activeStudent =
      isActiveMember(ctx.membership) && !isStaff(ctx.membership);
    const covering = memberships.filter(
      (m) => m.status === "active" && m.entityIds.includes(ctx.entity.id),
    );
    const holds =
      paymentsOn && covering.length
        ? await ctx.db
            .select({ assignmentId: membershipAccessHold.assignmentId })
            .from(membershipAccessHold)
            .where(
              and(
                inArray(
                  membershipAccessHold.assignmentId,
                  covering.map((m) => m.assignmentId),
                ),
                isNull(membershipAccessHold.resolvedAt),
              ),
            )
        : [];
    const choosable =
      paymentsOn && activeStudent && covering.length === 0
        ? (await loadChoosablePlans(ctx.db, ctx.entity.id)).length
        : 0;
    const banner = membershipBanner({
      paymentsOn,
      activeStudent,
      memberships: memberships.map((m) => ({
        assignmentId: m.assignmentId,
        planName: m.planName,
        status: m.status,
        covers: m.entityIds.includes(ctx.entity.id),
        paymentRequired: m.paymentRequired,
        paymentStatus: m.paymentStatus as
          "unpaid" | "reported" | "confirmed" | "rejected",
        held: holds.some((h) => h.assignmentId === m.assignmentId),
        awaitingStaff: m.awaitingStaff,
        firstMonth: m.firstMonth,
        deadline: m.deadline,
      })),
      choosable,
      now: new Date(),
    });

    return {
      banner,
      bannerText: banner ? membershipBannerText(banner, timeZone) : null,
      paymentMethods: await enabledPaymentMethods(ctx.db),
      // The reference is derived here and never stored, the way ADR 40's
      // already is: it survives a rename and cannot go stale.
      memberships: memberships.map((m) => {
        const change = waiting.find(
          (c) => c.sourceAssignmentId === m.assignmentId,
        );
        const next = change
          ? successors.find((a) => a.id === change.targetAssignmentId)
          : undefined;
        return {
          ...m,
          ...upfrontOf(m),
          paymentDayLabel: paymentDayLabel(paymentDay(m)),
          warning: ctx.entity.membershipEnforcedAt ? m.warning : null,
          reference: paymentReference(ctx.session.user.name, m.assignmentId),
          cardPaymentUrl: cardLink(
            rowForMonth(
              links.filter((l) => l.assignmentId === m.assignmentId),
              m.month,
            )?.paymentLinkUrl,
            m.assignmentId,
            m.month,
          ),
          next:
            change && next
              ? {
                  planName: next.planName,
                  effectiveMonth: change.effectiveMonth,
                  effectiveMonthLabel: formatDay(change.effectiveMonth),
                  amount: priceForMonth(
                    prices.filter((p) => p.planId === next.planId),
                    change.effectiveMonth,
                  ),
                  entityIds: coverage
                    .filter((c) => c.planId === next.planId)
                    .map((c) => c.entityId)
                    .sort(),
                }
              : null,
        };
      }),
    };
  }),
} satisfies TRPCRouterRecord;
