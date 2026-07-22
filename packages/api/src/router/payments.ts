import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import {
  and,
  desc,
  eq,
  getMemberById,
  getMemberIdForUser,
  isNull,
  listMembersOf,
} from "@matops/db";
import {
  memberDues,
  membershipPlan,
  paymentClaim,
  paymentSettings,
} from "@matops/db/schema";
import {
  canClaim,
  paymentPeriod,
  paymentReference,
  paymentStatus,
  rollNextDue,
} from "@matops/domain";
import {
  ClaimIdSchema,
  CreateMembershipPlanSchema,
  CreatePaymentClaimSchema,
  PlanIdSchema,
  SetMemberDuesSchema,
  UpdatePaymentRequisitesSchema,
} from "@matops/validators";

import { enrolledProcedure, ownerProcedure } from "../trpc";

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
export const paymentsRouter = {
  // ─── Owner: plans ──────────────────────────────────────────────────────────

  /** The academy's membership plans (price list), newest first. Owner-only. */
  plans: ownerProcedure.query(({ ctx }) =>
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
  createPlan: ownerProcedure
    .input(CreateMembershipPlanSchema)
    .mutation(async ({ ctx, input }) => {
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
      return { id: row?.id };
    }),

  /** Soft-delete a plan (keeps claim history valid). */
  deletePlan: ownerProcedure
    .input(PlanIdSchema)
    .mutation(async ({ ctx, input }) => {
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
  setMemberDues: ownerProcedure
    .input(SetMemberDuesSchema)
    .mutation(async ({ ctx, input }) => {
      const m = await getMemberById(input.memberId);
      if (m?.academyId !== ctx.academyId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      }
      if (input.planId === null) {
        await ctx.db
          .delete(memberDues)
          .where(eq(memberDues.memberId, input.memberId));
        return { ok: true as const };
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
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
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

  /** The academy's bank details for the requisites card (spec S9/O6). Owner-only. */
  getRequisites: ownerProcedure.query(async ({ ctx }) => {
    const row = (
      await ctx.db
        .select({ bankDetails: paymentSettings.bankDetails })
        .from(paymentSettings)
        .limit(1)
    )[0];
    return { bankDetails: row?.bankDetails ?? "" };
  }),

  /** Set the academy's bank details (spec O6). */
  updateRequisites: ownerProcedure
    .input(UpdatePaymentRequisitesSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(paymentSettings)
        .values({ academyId: ctx.academyId, bankDetails: input.bankDetails })
        .onConflictDoUpdate({
          target: paymentSettings.academyId,
          set: { bankDetails: input.bankDetails },
        });
      return { ok: true as const };
    }),

  // ─── Owner: claims to confirm ───────────────────────────────────────────────

  /** Pending "I paid" claims awaiting confirmation (spec O7). Owner-only. */
  claims: ownerProcedure.query(async ({ ctx }) => {
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
      .orderBy(desc(paymentClaim.claimedAt));
    const nameByMember = new Map(
      (await listMembersOf(ctx.academyId)).map((r) => [r.memberId, r.name]),
    );
    return rows.map((r) => {
      const memberName = nameByMember.get(r.memberId) ?? "Member";
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
  confirm: ownerProcedure
    .input(ClaimIdSchema)
    .mutation(async ({ ctx, input }) => {
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
      if (claim.status !== "pending") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This payment has already been handled.",
        });
      }
      const dues = (
        await ctx.db
          .select({
            nextDueAt: memberDues.nextDueAt,
            cycle: membershipPlan.cycle,
          })
          .from(memberDues)
          .innerJoin(membershipPlan, eq(memberDues.planId, membershipPlan.id))
          .where(eq(memberDues.memberId, claim.memberId))
          .limit(1)
      )[0];
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
  reject: ownerProcedure
    .input(ClaimIdSchema)
    .mutation(async ({ ctx, input }) => {
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
      if (claim.status !== "pending") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This payment has already been handled.",
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

  /**
   * The caller's dues line + requisites for the S9 pay screen (enrolled). Returns
   * `dues: null` until the gym sets up the member's dues. `requisites` carries the
   * academy bank details + the caller's fixed reference code; `canPay` is false
   * while a claim for the period is already awaiting confirmation.
   */
  myDues: enrolledProcedure.query(async ({ ctx }) => {
    const memberId = await getMemberIdForUser(
      ctx.session.user.id,
      ctx.academyId,
    );
    const reference = memberId
      ? paymentReference(ctx.session.user.name, memberId)
      : "";
    const settings = (
      await ctx.db
        .select({ bankDetails: paymentSettings.bankDetails })
        .from(paymentSettings)
        .limit(1)
    )[0];
    const requisites = {
      bankDetails: settings?.bankDetails ?? "",
      reference,
    };

    const duesRow = memberId
      ? (
          await ctx.db
            .select({
              nextDueAt: memberDues.nextDueAt,
              priceMinor: membershipPlan.priceMinor,
              currency: membershipPlan.currency,
              planName: membershipPlan.name,
            })
            .from(memberDues)
            .innerJoin(membershipPlan, eq(memberDues.planId, membershipPlan.id))
            .where(eq(memberDues.memberId, memberId))
            .limit(1)
        )[0]
      : undefined;

    if (!duesRow || !memberId) {
      return { dues: null, requisites, openClaim: null, canPay: false };
    }

    const period = paymentPeriod(duesRow.nextDueAt);
    const openClaim = (
      await ctx.db
        .select({ id: paymentClaim.id, claimedAt: paymentClaim.claimedAt })
        .from(paymentClaim)
        .where(
          and(
            eq(paymentClaim.memberId, memberId),
            eq(paymentClaim.status, "pending"),
            eq(paymentClaim.period, period),
          ),
        )
        .limit(1)
    )[0];

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
    };
  }),

  /**
   * Raise an "I paid" claim (spec S9). Resolves the caller's dues, guards one open
   * claim per period (`canClaim` + the DB partial unique index), and records the
   * claim with a snapshot of the plan price. Optional proof screenshot URL.
   */
  claim: enrolledProcedure
    .input(CreatePaymentClaimSchema)
    .mutation(async ({ ctx, input }) => {
      const memberId = await getMemberIdForUser(
        ctx.session.user.id,
        ctx.academyId,
      );
      if (!memberId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this academy",
        });
      }
      const duesRow = (
        await ctx.db
          .select({
            planId: memberDues.planId,
            nextDueAt: memberDues.nextDueAt,
            priceMinor: membershipPlan.priceMinor,
            currency: membershipPlan.currency,
          })
          .from(memberDues)
          .innerJoin(membershipPlan, eq(memberDues.planId, membershipPlan.id))
          .where(eq(memberDues.memberId, memberId))
          .limit(1)
      )[0];
      if (!duesRow) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Your gym hasn't set up your dues yet.",
        });
      }
      const period = paymentPeriod(duesRow.nextDueAt);
      const open = (
        await ctx.db
          .select({ id: paymentClaim.id })
          .from(paymentClaim)
          .where(
            and(
              eq(paymentClaim.memberId, memberId),
              eq(paymentClaim.status, "pending"),
              eq(paymentClaim.period, period),
            ),
          )
          .limit(1)
      )[0];
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
      } catch {
        // The partial unique index caught a concurrent double-submit.
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "A payment for this period is already awaiting confirmation.",
        });
      }
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
