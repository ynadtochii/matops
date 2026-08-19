import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import { desc, eq, listMembersOf } from "@matops/db";
import {
  memberReferral,
  memberReferralAudit,
  paymentClaim,
} from "@matops/db/schema";
import {
  academyMonthKey,
  canInitiallyAssignReferral,
  groupMoneyByCurrency,
  isEligibleReferrer,
  isReferralStudent,
  isStudentMembership,
  isValidReferralPair,
} from "@matops/domain";
import {
  AssignReferralSchema,
  CorrectReferralSchema,
  ReferralHistorySchema,
} from "@matops/validators";

import type { MemberRecord, MemberScope } from "../members";
import { academyTimeZone } from "../academy-tz";
import { requireMember } from "../members";
import { ownerProcedure, staffProcedure } from "../trpc";

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
  const [student, referrer] = await Promise.all([
    requireMember(ctx, studentMemberId),
    requireMember(ctx, referrerMemberId),
  ]);
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

function isUniqueViolation(error: unknown): boolean {
  let value: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof value !== "object" || value === null) return false;
    if ("code" in value && value.code === "23505") return true;
    value = "cause" in value ? value.cause : undefined;
  }
  return false;
}

/** Staff-only referral attribution and confirmed-payment reporting (O9). */
export const referralRouter = {
  /**
   * One payload for the staff dashboard (spec O9): referral-safe member identity
   * (no contact details), who referred whom, and confirmed-payment revenue per
   * student. The screen groups and totals the students itself, so this returns
   * the rows and nothing pre-aggregated (ADR 60 deleted the unread half).
   */
  dashboard: staffProcedure.query(async ({ ctx }) => {
    const [members, referrals, confirmedClaims, timeZone] = await Promise.all([
      listMembersOf(ctx.academyId, ctx.baseDb),
      ctx.db.select().from(memberReferral),
      ctx.db
        .select({
          memberId: paymentClaim.memberId,
          amountMinor: paymentClaim.amountMinor,
          currency: paymentClaim.currency,
          confirmedAt: paymentClaim.confirmedAt,
        })
        .from(paymentClaim)
        .where(eq(paymentClaim.status, "confirmed")),
      academyTimeZone(ctx.db),
    ]);

    const currentMonth = academyMonthKey(new Date(), timeZone);
    const memberById = new Map(
      members.map((member) => [member.memberId, member]),
    );
    const referralByStudent = new Map(
      referrals.map((referral) => [referral.studentMemberId, referral]),
    );
    const claimsByMember = new Map<
      string,
      { amountMinor: number; currency: string; confirmedAt: Date }[]
    >();
    for (const claim of confirmedClaims) {
      if (!claim.confirmedAt) continue;
      const claims = claimsByMember.get(claim.memberId) ?? [];
      claims.push({
        amountMinor: claim.amountMinor,
        currency: claim.currency,
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
        status: member.status,
        removed: member.status === "removed",
        assignmentState: referral
          ? referral.referrerMemberId
            ? ("assigned" as const)
            : ("cleared" as const)
          : ("never_assigned" as const),
        referrer: referrer
          ? { memberId: referrer.memberId, name: referrer.name }
          : null,
        monthRevenue: groupMoneyByCurrency(
          claims.filter(
            (claim) =>
              academyMonthKey(claim.confirmedAt, timeZone) === currentMonth,
          ),
        ),
        lifetimeRevenue: groupMoneyByCurrency(claims),
      };
    });

    return {
      isOwner: ctx.membership.role === "owner",
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

  /** Permanent one-time initial assignment, available to owners/instructors. */
  assign: staffProcedure
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
  correct: ownerProcedure
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
  history: ownerProcedure
    .input(ReferralHistorySchema)
    .query(async ({ ctx, input }) => {
      const student = await requireMember(ctx, input.studentMemberId);
      if (!isStudentMembership(referralMember(student))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Student not found",
        });
      }
      const [history, members] = await Promise.all([
        ctx.db
          .select()
          .from(memberReferralAudit)
          .where(eq(memberReferralAudit.studentMemberId, input.studentMemberId))
          .orderBy(desc(memberReferralAudit.occurredAt)),
        listMembersOf(ctx.academyId, ctx.baseDb),
      ]);
      const nameByMember = new Map(
        members.map((member) => [member.memberId, member.name]),
      );
      const nameByUser = new Map(
        members.map((member) => [member.userId, member.name]),
      );
      return history.map((event) => ({
        id: event.id,
        action: event.action,
        oldReferrerName: event.oldReferrerMemberId
          ? (nameByMember.get(event.oldReferrerMemberId) ?? "Former member")
          : null,
        newReferrerName: event.newReferrerMemberId
          ? (nameByMember.get(event.newReferrerMemberId) ?? "Former member")
          : null,
        actorName: nameByUser.get(event.actorId) ?? "Former staff member",
        occurredAt: event.occurredAt,
      }));
    }),
} satisfies TRPCRouterRecord;
