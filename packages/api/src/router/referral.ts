import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import { and, desc, eq } from "@matops/db";
import {
  accessAssignment,
  accessPlanEntity,
  entityMembership,
  memberReferral,
  memberReferralAudit,
  membershipMonth,
} from "@matops/db/schema";
import {
  academyMonthKey,
  canInitiallyAssignReferral,
  groupMoneyByCurrency,
  isEligibleReferrer,
  isOnRoster,
  isReferralStudent,
  isStudentMembership,
  isValidReferralPair,
  referralAssignmentState,
} from "@matops/domain";
import {
  AssignReferralSchema,
  CorrectReferralSchema,
  ReferralHistorySchema,
} from "@matops/validators";

import type { MemberRecord, MemberScope } from "../members";
import { academyTimeZone } from "../academy-tz";
import { nameByMember, nameByUser, requireMember, rosterOf } from "../members";
import { isUniqueViolation } from "../pg-error";
import { referralsBranchManagerProcedure } from "../trpc";

function referralMember(member: MemberRecord) {
  return {
    memberId: member.id,
    role: member.role,
    status: member.status,
    invitedRole: member.invitedRole,
  };
}

async function requireReferralPair(
  ctx: MemberScope,
  studentMemberId: string,
  referrerMemberId: string,
  options: { allowRemovedStudent: boolean },
) {
  const student = await requireMember(ctx, studentMemberId);
  const referrer = await requireMember(ctx, referrerMemberId);
  const studentFacts = referralMember(student);
  const validStudent = options.allowRemovedStudent
    ? isStudentMembership(studentFacts)
    : isReferralStudent(studentFacts);
  if (!validStudent) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: options.allowRemovedStudent
        ? "Referral targets must be student memberships."
        : "Only pending, active, or suspended students can be assigned.",
    });
  }
  if (!isEligibleReferrer(referralMember(referrer))) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That member cannot be a referrer.",
    });
  }
  if (!isValidReferralPair(studentMemberId, referrerMemberId)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A student cannot refer themselves.",
    });
  }
}

// ponytail: newest 200 reassignments for one student. Nothing in the product
// writes that many; paginate if a real academy ever proves otherwise.
const HISTORY_LIMIT = 200;

/** Staff-only referral attribution and confirmed-payment reporting (O9). */
export const referralRouter = {
  /**
   * One payload for the staff dashboard (spec O9): referral-safe member identity
   * (no contact details), who referred whom, and confirmed-payment revenue per
   * student. The screen groups and totals the students itself, so this returns
   * the rows and nothing pre-aggregated (ADR 60 deleted the unread half).
   */
  dashboard: referralsBranchManagerProcedure.query(async ({ ctx }) => {
    const members = await rosterOf(ctx);
    const referrals = await ctx.db.select().from(memberReferral);
    const confirmedClaims = await ctx.db
      .select({
        id: membershipMonth.id,
        assignmentId: membershipMonth.assignmentId,
        memberId: entityMembership.id,
        month: membershipMonth.month,
        amountMinor: membershipMonth.priceMinor,
        currency: membershipMonth.currency,
        confirmedBy: membershipMonth.reviewedBy,
        confirmedAt: membershipMonth.reviewedAt,
      })
      .from(membershipMonth)
      .innerJoin(
        accessAssignment,
        eq(accessAssignment.id, membershipMonth.assignmentId),
      )
      .innerJoin(
        accessPlanEntity,
        eq(accessPlanEntity.planId, accessAssignment.planId),
      )
      .innerJoin(
        entityMembership,
        and(
          eq(entityMembership.entityId, ctx.entityId),
          eq(entityMembership.personId, accessAssignment.personId),
        ),
      )
      .where(
        and(
          eq(accessPlanEntity.entityId, ctx.entityId),
          eq(membershipMonth.status, "confirmed"),
        ),
      );
    const timeZone = await academyTimeZone(ctx);

    const currentMonth = academyMonthKey(new Date(), timeZone);
    const memberById = new Map(
      members.map((member) => [member.memberId, member]),
    );
    const referralByStudent = new Map(
      referrals.map((referral) => [referral.studentMemberId, referral]),
    );
    const claimsByMember = new Map<
      string,
      {
        id: string;
        assignmentId: string;
        month: string;
        amountMinor: number;
        currency: string;
        confirmedBy: string | null;
        confirmedAt: Date;
      }[]
    >();
    const seenClaims = new Set<string>();
    for (const claim of confirmedClaims) {
      if (
        !claim.confirmedAt ||
        claim.amountMinor === null ||
        claim.currency === null
      )
        continue;
      if (seenClaims.has(claim.id)) continue;
      seenClaims.add(claim.id);
      const claims = claimsByMember.get(claim.memberId) ?? [];
      claims.push({
        amountMinor: claim.amountMinor,
        currency: claim.currency,
        id: claim.id,
        assignmentId: claim.assignmentId,
        month: claim.month,
        confirmedBy: claim.confirmedBy,
        confirmedAt: claim.confirmedAt,
      });
      claimsByMember.set(claim.memberId, claims);
    }

    const allStudents = members.filter((member) =>
      isStudentMembership({
        memberId: member.memberId,
        role: member.role,
        status: member.status,
        invitedRole: member.invitedRole,
      }),
    );

    const students = allStudents.map((member) => {
      const referral = referralByStudent.get(member.memberId);
      const referrer = referral?.referrerMemberId
        ? memberById.get(referral.referrerMemberId)
        : undefined;
      const claims = claimsByMember.get(member.memberId) ?? [];
      return {
        memberId: member.memberId,
        name: member.name,
        joinedAt: member.createdAt,
        status: member.status,
        removed: !isOnRoster(member),
        assignmentState: referralAssignmentState(referral),
        referrer: referrer
          ? { memberId: referrer.memberId, name: referrer.name }
          : null,
        monthRevenue: groupMoneyByCurrency(
          claims.filter((claim) => claim.month === currentMonth),
        ),
        lifetimeRevenue: groupMoneyByCurrency(claims),
        confirmedMonths: claims
          .map((claim) => ({
            id: claim.id,
            assignmentId: claim.assignmentId,
            month: claim.month,
            amountMinor: claim.amountMinor,
            currency: claim.currency,
            confirmedAt: claim.confirmedAt,
            confirmedByName: claim.confirmedBy
              ? (nameByUser(members).get(claim.confirmedBy) ?? "Staff")
              : "Staff",
          }))
          .sort((a, b) => b.month.localeCompare(a.month)),
      };
    });

    return {
      referrers: members
        .map((member) => ({
          memberId: member.memberId,
          name: member.name,
          role: member.role,
          status: member.status,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      students,
    };
  }),

  /** Permanent one-time initial assignment. */
  assign: referralsBranchManagerProcedure
    .input(AssignReferralSchema)
    .mutation(async ({ ctx, input }) => {
      await requireReferralPair(
        ctx,
        input.studentMemberId,
        input.referrerMemberId,
        { allowRemovedStudent: false },
      );
      const existing = (
        await ctx.db
          .select({ id: memberReferral.id })
          .from(memberReferral)
          .where(eq(memberReferral.studentMemberId, input.studentMemberId))
          .limit(1)
      )[0];
      if (!canInitiallyAssignReferral(Boolean(existing))) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "This student already has referral history. Only an owner can correct it.",
        });
      }
      try {
        await ctx.db.insert(memberReferral).values({
          academyId: ctx.academyId,
          studentMemberId: input.studentMemberId,
          referrerMemberId: input.referrerMemberId,
          assignedBy: ctx.session.user.id,
        });
        await ctx.db.insert(memberReferralAudit).values({
          academyId: ctx.academyId,
          studentMemberId: input.studentMemberId,
          oldReferrerMemberId: null,
          newReferrerMemberId: input.referrerMemberId,
          action: "assigned",
          actorId: ctx.session.user.id,
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "This student was just assigned by someone else. Refresh to see the attribution.",
            cause: error,
          });
        }
        throw error;
      }
      return { ok: true as const };
    }),

  /** Owner-only replacement or clearing, atomically appended to the audit. */
  correct: referralsBranchManagerProcedure
    .input(CorrectReferralSchema)
    .mutation(async ({ ctx, input }) => {
      const student = await requireMember(ctx, input.studentMemberId);
      if (!isStudentMembership(referralMember(student))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Referral targets must be student memberships.",
        });
      }
      if (input.referrerMemberId) {
        await requireReferralPair(
          ctx,
          input.studentMemberId,
          input.referrerMemberId,
          { allowRemovedStudent: true },
        );
      }
      const current = (
        await ctx.db
          .select({ referrerMemberId: memberReferral.referrerMemberId })
          .from(memberReferral)
          .where(eq(memberReferral.studentMemberId, input.studentMemberId))
          .limit(1)
      )[0];
      if (!current) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No referral assignment exists to correct.",
        });
      }
      if (current.referrerMemberId === input.referrerMemberId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Choose a different referrer or cancel the correction.",
        });
      }
      await ctx.db
        .update(memberReferral)
        .set({
          referrerMemberId: input.referrerMemberId,
          updatedAt: new Date(),
        })
        .where(eq(memberReferral.studentMemberId, input.studentMemberId));
      await ctx.db.insert(memberReferralAudit).values({
        academyId: ctx.academyId,
        studentMemberId: input.studentMemberId,
        oldReferrerMemberId: current.referrerMemberId,
        newReferrerMemberId: input.referrerMemberId,
        action: input.referrerMemberId ? "corrected" : "cleared",
        actorId: ctx.session.user.id,
      });
      return { ok: true as const };
    }),

  /** Owner-only attribution audit history for one student. */
  history: referralsBranchManagerProcedure
    .input(ReferralHistorySchema)
    .query(async ({ ctx, input }) => {
      const student = await requireMember(ctx, input.studentMemberId);
      if (!isStudentMembership(referralMember(student))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Student not found",
        });
      }
      const history = await ctx.db
        .select()
        .from(memberReferralAudit)
        .where(eq(memberReferralAudit.studentMemberId, input.studentMemberId))
        .orderBy(desc(memberReferralAudit.occurredAt))
        .limit(HISTORY_LIMIT);
      const members = await rosterOf(ctx);
      const byMember = nameByMember(members);
      const byUser = nameByUser(members);
      return history.map((event) => ({
        id: event.id,
        action: event.action,
        oldReferrerName: event.oldReferrerMemberId
          ? (byMember.get(event.oldReferrerMemberId) ?? "Former member")
          : null,
        newReferrerName: event.newReferrerMemberId
          ? (byMember.get(event.newReferrerMemberId) ?? "Former member")
          : null,
        actorName: byUser.get(event.actorId) ?? "Former staff member",
        occurredAt: event.occurredAt,
      }));
    }),
} satisfies TRPCRouterRecord;
