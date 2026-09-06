import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import { and, desc, eq, getMemberIdForUser, isNull } from "@matops/db";
import {
  memberDues,
  membershipPlan,
  paymentClaim,
  paymentSettings,
} from "@matops/db/schema";
import {
  canAssignPlan,
  canClaim,
  canDecideClaim,
  firstDueAt,
  isStaffRole,
  paymentPeriod,
  paymentReference,
  paymentStatus,
  rollNextDue,
} from "@matops/domain";
import {
  ChoosePlanSchema,
  ClaimIdSchema,
  CreateMembershipPlanSchema,
  CreatePaymentClaimSchema,
  PlanIdSchema,
  SetMemberDuesSchema,
  UpdateBookingGateSchema,
  UpdateMembershipPlanSchema,
} from "@matops/validators";

import { nameByMember, requireMember, rosterOf } from "../members";
import { loadStaffAccess } from "../membership-access";
import { membershipBankDetails } from "../membership-status";
import { CLAIM_HANDLED, PLAN_NOT_FOUND } from "../messages";
import { loadBookingAccess } from "../payments-gate";
import {
  readDuesWithPlan,
  readOpenClaim,
  readPaymentSettings,
} from "../payments-read";
import { isUniqueViolation } from "../pg-error";
import { branchManagerProcedure, memberProcedure } from "../trpc";

/** Parse a "YYYY-MM-DD" due date to a UTC-midnight instant. */
function parseDueDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * Manual bank-transfer payments (slice P.3, spec S9/O7; ADR 40). No card
 * processor: the owner defines plans + each member's next-due date and reads the
 * requisites; the student raises an "I paid" claim; the owner confirms (rolling
 * `next_due_at` forward one cycle) or rejects. All reads/writes run on the
 * RLS-scoped `ctx.db` — the payment tables carry `academy_id` policies. Member
 * identity (`member.id`) is resolved on the base connection where needed.
 */
// ponytail: newest 500 pending claims. Only reachable by an owner who never
// confirms or rejects; a queue that deep is a product problem, not a read
// problem. Paginate the day the queue is meant to be that long.
const CLAIMS_LIMIT = 500;

/**
 * Refuse a legacy dues write at a branch that has moved onto memberships
 * (ADR 128, spec FP5).
 *
 * Hiding the Payments screen is presentation; this is the rule. A migrated
 * branch keeps its old plans, dues and claims so the history stays readable,
 * but nothing may edit them: a plan price changed there decides nothing, and a
 * dues row written there would be a second answer to a question the membership
 * gate already answers.
 */
function refuseIfMigrated(ctx: {
  entity: { membershipEnforcedAt: Date | null };
}): void {
  if (ctx.entity.membershipEnforcedAt) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "This branch runs on the gym's memberships. Its old dues are history now.",
    });
  }
}

export const paymentsRouter = {
  // ─── Owner: plans ──────────────────────────────────────────────────────────

  /** The academy's membership plans (price list), newest first. Owner-only. */
  plans: branchManagerProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: membershipPlan.id,
        name: membershipPlan.name,
        priceMinor: membershipPlan.priceMinor,
        currency: membershipPlan.currency,
        cycle: membershipPlan.cycle,
      })
      .from(membershipPlan)
      .where(isNull(membershipPlan.deletedAt))
      .orderBy(desc(membershipPlan.createdAt)),
  ),

  /** Create a membership plan (spec O7). */
  createPlan: branchManagerProcedure
    .input(CreateMembershipPlanSchema)
    .mutation(async ({ ctx, input }) => {
      refuseIfMigrated(ctx);
      const [row] = await ctx.db
        .insert(membershipPlan)
        .values({
          academyId: ctx.academyId,
          name: input.name,
          priceMinor: input.priceMinor,
          currency: input.currency,
          cycle: input.cycle,
        })
        .returning({ id: membershipPlan.id });
      if (!row) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not create the plan",
        });
      }
      return { id: row.id };
    }),

  /** Edit a plan in place — members on it pick up the new name/price. */
  updatePlan: branchManagerProcedure
    .input(UpdateMembershipPlanSchema)
    .mutation(async ({ ctx, input }) => {
      refuseIfMigrated(ctx);
      const rows = await ctx.db
        .update(membershipPlan)
        .set({
          name: input.name,
          priceMinor: input.priceMinor,
          currency: input.currency,
          cycle: input.cycle,
        })
        .where(
          and(
            eq(membershipPlan.id, input.id),
            isNull(membershipPlan.deletedAt),
          ),
        )
        .returning({ id: membershipPlan.id });
      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: PLAN_NOT_FOUND });
      }
      return { ok: true as const };
    }),

  /** Soft-delete a plan (keeps claim history valid). */
  deletePlan: branchManagerProcedure
    .input(PlanIdSchema)
    .mutation(async ({ ctx, input }) => {
      refuseIfMigrated(ctx);
      await ctx.db
        .update(membershipPlan)
        .set({ deletedAt: new Date() })
        .where(eq(membershipPlan.id, input.id));
      return { ok: true as const };
    }),

  // ─── Owner: member dues ─────────────────────────────────────────────────────

  /**
   * Put a member on a plan with a next-due date, or clear their dues (spec O7).
   * `planId: null` deletes the dues row. Verifies the member belongs to the
   * caller's academy (the `member` table has no RLS) before touching the
   * RLS-scoped `member_dues`.
   */
  setMemberDues: branchManagerProcedure
    .input(SetMemberDuesSchema)
    .mutation(async ({ ctx, input }) => {
      refuseIfMigrated(ctx);
      const target = await requireMember(ctx, input.memberId);
      if (input.planId === null) {
        await ctx.db
          .delete(memberDues)
          .where(eq(memberDues.memberId, input.memberId));
        return { ok: true as const };
      }
      const staff = await loadStaffAccess(ctx.db, {
        entityIds: [ctx.entityId],
        userIds: [target.userId],
      });
      if (isStaffRole(target) || staff.get(ctx.entityId)?.has(target.userId)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Staff access does not require a membership plan.",
        });
      }
      const plan = (
        await ctx.db
          .select({
            id: membershipPlan.id,
            deletedAt: membershipPlan.deletedAt,
          })
          .from(membershipPlan)
          .where(eq(membershipPlan.id, input.planId))
          .limit(1)
      )[0];
      const current = (
        await ctx.db
          .select({ planId: memberDues.planId })
          .from(memberDues)
          .where(eq(memberDues.memberId, input.memberId))
          .limit(1)
      )[0];
      if (!canAssignPlan(plan, current?.planId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: PLAN_NOT_FOUND });
      }
      const nextDueAt = parseDueDate(input.nextDueAt);
      await ctx.db
        .insert(memberDues)
        .values({
          academyId: ctx.academyId,
          memberId: input.memberId,
          planId: input.planId,
          nextDueAt,
        })
        .onConflictDoUpdate({
          target: [memberDues.academyId, memberDues.memberId],
          set: { planId: input.planId, nextDueAt },
        });
      return { ok: true as const };
    }),

  // ─── Owner: requisites (bank details) ───────────────────────────────────────

  /**
   * The branch's booking rule (spec O6, ADR 82). Owner-only.
   *
   * No bank details any more: the account belongs to the organization and is
   * edited on its Settings screen (ADR 127).
   */
  getRequisites: branchManagerProcedure.query(async ({ ctx }) => {
    const row = await readPaymentSettings(ctx.db);
    return {
      graceDays: row.graceDays,
      enforced: !!row.enforcedAt,
    };
  }),

  updateBookingGate: branchManagerProcedure
    .input(UpdateBookingGateSchema)
    .mutation(async ({ ctx, input }) => {
      refuseIfMigrated(ctx);
      const current = await readPaymentSettings(ctx.db);
      const enforcedAt = input.enforced
        ? (current.enforcedAt ?? new Date())
        : null;
      await ctx.db
        .insert(paymentSettings)
        .values({
          academyId: ctx.academyId,
          graceDays: input.graceDays,
          enforcedAt,
        })
        .onConflictDoUpdate({
          target: paymentSettings.academyId,
          set: { graceDays: input.graceDays, enforcedAt },
        });
      return { ok: true as const };
    }),

  // ─── Owner: claims to confirm ───────────────────────────────────────────────

  /** Pending "I paid" claims awaiting confirmation (spec O7). Owner-only. */
  claims: branchManagerProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: paymentClaim.id,
        memberId: paymentClaim.memberId,
        amountMinor: paymentClaim.amountMinor,
        currency: paymentClaim.currency,
        period: paymentClaim.period,
        proofUrl: paymentClaim.proofUrl,
        claimedAt: paymentClaim.claimedAt,
      })
      .from(paymentClaim)
      .where(eq(paymentClaim.status, "pending"))
      .orderBy(desc(paymentClaim.claimedAt))
      .limit(CLAIMS_LIMIT);
    const byMember = nameByMember(await rosterOf(ctx));
    return rows.map((r) => {
      const memberName = byMember.get(r.memberId) ?? "Member";
      return {
        ...r,
        memberName,
        // The reference the student was told to put in the bank note — shown so
        // the owner can match it against the incoming transfer (ADR 40).
        reference: paymentReference(memberName, r.memberId),
      };
    });
  }),

  /**
   * Confirm a claim (spec O7): mark it confirmed and roll the member's next-due
   * date forward one cycle. Both writes run in the one RLS transaction `ctx.db`
   * already is, so a failure rolls back atomically.
   */
  confirm: branchManagerProcedure
    .input(ClaimIdSchema)
    .mutation(async ({ ctx, input }) => {
      refuseIfMigrated(ctx);
      const claim = (
        await ctx.db
          .select({
            id: paymentClaim.id,
            memberId: paymentClaim.memberId,
            status: paymentClaim.status,
          })
          .from(paymentClaim)
          .where(eq(paymentClaim.id, input.claimId))
          .limit(1)
      )[0];
      if (!claim) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
      }
      if (!canDecideClaim(claim)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: CLAIM_HANDLED,
        });
      }
      const dues = await readDuesWithPlan(ctx.db, claim.memberId);
      if (dues) {
        await ctx.db
          .update(memberDues)
          .set({ nextDueAt: rollNextDue(dues.nextDueAt, dues.cycle) })
          .where(eq(memberDues.memberId, claim.memberId));
      }
      await ctx.db
        .update(paymentClaim)
        .set({
          status: "confirmed",
          confirmedBy: ctx.session.user.id,
          confirmedAt: new Date(),
        })
        .where(eq(paymentClaim.id, input.claimId));
      return { ok: true as const };
    }),

  /** Reject a claim (spec O7) — dismiss it without rolling the due date. */
  reject: branchManagerProcedure
    .input(ClaimIdSchema)
    .mutation(async ({ ctx, input }) => {
      refuseIfMigrated(ctx);
      const claim = (
        await ctx.db
          .select({ status: paymentClaim.status })
          .from(paymentClaim)
          .where(eq(paymentClaim.id, input.claimId))
          .limit(1)
      )[0];
      if (!claim) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
      }
      if (!canDecideClaim(claim)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: CLAIM_HANDLED,
        });
      }
      await ctx.db
        .update(paymentClaim)
        .set({
          status: "rejected",
          confirmedBy: ctx.session.user.id,
          confirmedAt: new Date(),
        })
        .where(eq(paymentClaim.id, input.claimId));
      return { ok: true as const };
    }),

  // ─── Student: my dues + requisites + "I paid" ───────────────────────────────

  planOptions: memberProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: membershipPlan.id,
        name: membershipPlan.name,
        priceMinor: membershipPlan.priceMinor,
        currency: membershipPlan.currency,
        cycle: membershipPlan.cycle,
      })
      .from(membershipPlan)
      .where(isNull(membershipPlan.deletedAt))
      .orderBy(desc(membershipPlan.createdAt)),
  ),

  choosePlan: memberProcedure
    .input(ChoosePlanSchema)
    .mutation(async ({ ctx, input }) => {
      refuseIfMigrated(ctx);
      if (isStaffRole(ctx.membership)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "You have staff access. No membership plan is required.",
        });
      }
      const plan = (
        await ctx.db
          .select({ id: membershipPlan.id })
          .from(membershipPlan)
          .where(
            and(
              eq(membershipPlan.id, input.planId),
              isNull(membershipPlan.deletedAt),
            ),
          )
          .limit(1)
      )[0];
      if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND", message: PLAN_NOT_FOUND });
      }
      if (!ctx.membership.memberId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "You are not enrolled at this academy.",
        });
      }
      const inserted = await ctx.db
        .insert(memberDues)
        .values({
          academyId: ctx.academyId,
          memberId: ctx.membership.memberId,
          planId: input.planId,
          nextDueAt: firstDueAt(new Date()),
        })
        .onConflictDoNothing({
          target: [memberDues.academyId, memberDues.memberId],
        })
        .returning({ id: memberDues.id });
      if (inserted.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "You already have a membership. Ask your gym to change it.",
        });
      }
      return { ok: true as const };
    }),

  /**
   * The caller's dues line + requisites for the S9 pay screen. APPROVED members
   * only: `requisites` carries the gym's bank details, which a pending joiner
   * (anyone who typed a public academy code) must not be able to read.  Returns
   * `dues: null` until the gym sets up the member's dues. `requisites` carries the
   * academy bank details + the caller's fixed reference code; `canPay` is false
   * while a claim for the period is already awaiting confirmation.
   */
  myDues: memberProcedure.query(async ({ ctx }) => {
    const memberId = await getMemberIdForUser(
      ctx.session.user.id,
      ctx.academyId,
      ctx.db,
    );
    const reference = memberId
      ? paymentReference(ctx.session.user.name, memberId)
      : "";
    // The account is the ORGANIZATION's, even on this legacy path: a gym half
    // way through the switch must not be able to print two of them (ADR 127).
    const requisites = {
      bankDetails: await membershipBankDetails(ctx.db),
      reference,
    };

    const duesRow = memberId
      ? await readDuesWithPlan(ctx.db, memberId)
      : undefined;

    const access = await loadBookingAccess(ctx.db, ctx.membership, ctx.entity);
    // Never two gates on one screen (ADR 126): where the shared membership
    // decides, the branch's own dues line is not what anyone owes.
    if (!duesRow || !memberId || ctx.entity.membershipEnforcedAt) {
      return {
        dues: null,
        requisites,
        openClaim: null,
        canPay: false,
        access,
        canChoosePlan:
          ctx.membership.role === "student" && !ctx.entity.membershipEnforcedAt,
      };
    }

    const period = paymentPeriod(duesRow.nextDueAt);
    const openClaim = await readOpenClaim(ctx.db, memberId, period);

    return {
      dues: {
        status: paymentStatus(duesRow.nextDueAt, new Date()),
        nextDueAt: duesRow.nextDueAt,
        amountMinor: duesRow.priceMinor,
        currency: duesRow.currency,
        planName: duesRow.planName,
        period,
      },
      requisites,
      openClaim: openClaim ?? null,
      canPay: canClaim({ hasPlan: true, hasOpenClaim: !!openClaim }),
      access,
      canChoosePlan: false,
    };
  }),

  /**
   * Raise an "I paid" claim (spec S9). Resolves the caller's dues, guards one open
   * claim per period (`canClaim` + the DB partial unique index), and records the
   * claim with a snapshot of the plan price. Optional proof screenshot URL.
   */
  claim: memberProcedure
    .input(CreatePaymentClaimSchema)
    .mutation(async ({ ctx, input }) => {
      refuseIfMigrated(ctx);
      const memberId = await getMemberIdForUser(
        ctx.session.user.id,
        ctx.academyId,
        ctx.db,
      );
      if (!memberId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this academy",
        });
      }
      const duesRow = await readDuesWithPlan(ctx.db, memberId);
      if (!duesRow) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Your gym hasn't set up your dues yet.",
        });
      }
      const period = paymentPeriod(duesRow.nextDueAt);
      const open = await readOpenClaim(ctx.db, memberId, period);
      if (!canClaim({ hasPlan: true, hasOpenClaim: !!open })) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "You've already submitted this payment — your gym will confirm it.",
        });
      }
      try {
        await ctx.db.insert(paymentClaim).values({
          academyId: ctx.academyId,
          memberId,
          planId: duesRow.planId,
          amountMinor: duesRow.priceMinor,
          currency: duesRow.currency,
          period,
          proofUrl: input.proofUrl ?? null,
        });
      } catch (error) {
        // The partial unique index caught a concurrent double-submit.
        if (!isUniqueViolation(error)) throw error;
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "A payment for this period is already awaiting confirmation.",
        });
      }
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
