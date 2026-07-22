import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import {
  and,
  createPendingMembership,
  desc,
  eq,
  findAcademyByCode,
  getMemberById,
  listMembersOf,
  resolveInviteToken,
  setMemberRoleStatus,
  setMemberStatus,
  setMemberStatusIfNotLastOwner,
  sql,
  updateUserProfile,
} from "@matops/db";
import {
  classInstance,
  classParticipation,
  memberDues,
  membershipPlan,
  paymentClaim,
} from "@matops/db/schema";
import {
  approveMembership,
  canApprove,
  classifyDrift,
  CODE_JOIN_ROLE,
  paymentStatus,
  trainingStats,
} from "@matops/domain";
import {
  JoinAcademySchema,
  JoinByCodeSchema,
  MemberActionSchema,
} from "@matops/validators";

import type { createTRPCContext } from "../trpc";
import { academyTimeZone } from "../academy-tz";
import { notifyMembershipApproved } from "../notify";
import { ownerProcedure, protectedProcedure } from "../trpc";

type BaseContext = Awaited<ReturnType<typeof createTRPCContext>>;
/** Context inside a `protectedProcedure` — the session is guaranteed present. */
type AuthedContext = BaseContext & {
  session: NonNullable<BaseContext["session"]>;
};

/**
 * Shared self-join step (spec S1–S3, docs/issues/14, 20, 26). Saves the minimal
 * profile and creates a PENDING membership with NO academy role — the role rides
 * on `invitedRole` and is granted only at approval. Idempotent if already a
 * member. The FIRST academy also becomes the active one so the user lands in
 * context; a later join does not force a switch (docs/issues/18). Used by both
 * the invite-link join (`join`) and the mobile code join (`joinByCode`).
 */
async function joinPending(
  ctx: AuthedContext,
  input: {
    academyId: string;
    invitedRole: string;
    firstName: string;
    lastName: string;
    phone: string;
  },
) {
  const userId = ctx.session.user.id;
  await updateUserProfile(userId, {
    name: `${input.firstName} ${input.lastName}`.trim(),
    phone: input.phone,
  });
  const result = await createPendingMembership({
    userId,
    academyId: input.academyId,
    invitedRole: input.invitedRole,
  });
  if (!ctx.session.session.activeOrganizationId) {
    await ctx.authApi.setActiveOrganization({
      body: { organizationId: input.academyId },
      headers: ctx.headers,
    });
  }
  return {
    academyId: input.academyId,
    status: result.status,
    alreadyMember: result.alreadyMember,
  };
}

/** Load the target member and assert it belongs to the caller's academy. */
async function requireMember(academyId: string, memberId: string) {
  const m = await getMemberById(memberId);
  if (m?.academyId !== academyId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
  }
  return m;
}

/**
 * Set a member's status, but reject the change if it would leave the academy
 * ownerless (§4). The check + write are atomic (one locked transaction) in
 * `setMemberStatusIfNotLastOwner`, so two concurrent owner mutations cannot both
 * pass and strand the gym without an owner.
 */
async function setStatusOrRejectLastOwner(
  academyId: string,
  memberId: string,
  status: string,
) {
  const { ok } = await setMemberStatusIfNotLastOwner(
    academyId,
    memberId,
    status,
  );
  if (!ok) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Promote a co-owner first — an academy can't be left without an owner.",
    });
  }
}

export const membershipRouter = {
  /**
   * Self-join via an invite link (spec S1–S3, docs/issues/14, 20, 26). The caller
   * is already signed in (magic link → email verified). Resolves the token, saves
   * the minimal profile, and creates a PENDING membership with NO academy role —
   * the role rides on `invitedRole` and is granted only at approval. Idempotent if
   * already a member. The FIRST academy also becomes the active one so the user
   * lands in context; a later join does not force a switch (docs/issues/18).
   */
  join: protectedProcedure
    .input(JoinAcademySchema)
    .mutation(async ({ ctx, input }) => {
      const invite = await resolveInviteToken(input.token);
      if (!invite) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This invite isn't valid — ask your gym for a new link.",
        });
      }
      return joinPending(ctx, {
        academyId: invite.academyId,
        invitedRole: invite.role,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
      });
    }),

  /**
   * Self-join by academy code — the mobile v1 path (spec S2, docs/issues/32).
   * The student typed the gym's 6-digit number; look it up and create a PENDING
   * membership as a STUDENT (the Expo app is the student app, so the role is not
   * a choice here). Same pending gate as the invite-link join.
   */
  joinByCode: protectedProcedure
    .input(JoinByCodeSchema)
    .mutation(async ({ ctx, input }) => {
      const academy = await findAcademyByCode(input.code);
      if (!academy) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "No gym found with that ID — check the number with your gym.",
        });
      }
      return joinPending(ctx, {
        academyId: academy.academyId,
        invitedRole: CODE_JOIN_ROLE,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
      });
    }),

  /**
   * The roster for the active academy (spec O4). Owner-only. Removed rows are
   * hidden; history is kept. `visitCount` (slice 3.3) = how many classes the
   * member attended (present), powering the "attended 3×" nudge on pending rows
   * (§4). Counted on the RLS-scoped `ctx.db`, grouped by student.
   */
  roster: ownerProcedure.query(async ({ ctx }) => {
    const rows = await listMembersOf(ctx.academyId);
    const visits = await ctx.db
      .select({
        studentId: classParticipation.studentId,
        count: sql<number>`count(*)::int`,
      })
      .from(classParticipation)
      .where(eq(classParticipation.attendanceStatus, "present"))
      .groupBy(classParticipation.studentId);
    const visitByUser = new Map(visits.map((v) => [v.studentId, v.count]));

    // Per-member dues + derived payment status (slice P.2, ADR 40). All three
    // reads run on the RLS-scoped `ctx.db` (the payment tables carry academy_id
    // policies), so no explicit academy pin is needed here. `member_dues.memberId`
    // is the `member.id`, aligning with the roster row's `memberId`.
    const duesRows = await ctx.db
      .select({
        memberId: memberDues.memberId,
        nextDueAt: memberDues.nextDueAt,
        priceMinor: membershipPlan.priceMinor,
        currency: membershipPlan.currency,
        planName: membershipPlan.name,
      })
      .from(memberDues)
      .innerJoin(membershipPlan, eq(memberDues.planId, membershipPlan.id));
    const duesByMember = new Map(duesRows.map((d) => [d.memberId, d]));

    const confirmed = await ctx.db
      .select({
        memberId: paymentClaim.memberId,
        lastConfirmedAt: sql<Date | null>`max(${paymentClaim.confirmedAt})`,
      })
      .from(paymentClaim)
      .where(eq(paymentClaim.status, "confirmed"))
      .groupBy(paymentClaim.memberId);
    const lastConfirmedByMember = new Map(
      confirmed.map((c) => [c.memberId, c.lastConfirmedAt]),
    );

    const now = new Date();
    return rows
      .filter((r) => r.status !== "removed")
      .map((r) => {
        const d = duesByMember.get(r.memberId);
        return {
          memberId: r.memberId,
          name: r.name,
          email: r.email,
          phone: r.phone,
          role: r.role,
          status: r.status,
          invitedRole: r.invitedRole,
          joinedAt: r.createdAt,
          visitCount: visitByUser.get(r.userId) ?? 0,
          // null = the owner has not set up dues for this member yet (P.2).
          dues: d
            ? {
                status: paymentStatus(d.nextDueAt, now),
                nextDueAt: d.nextDueAt,
                priceMinor: d.priceMinor,
                currency: d.currency,
                planName: d.planName,
                lastConfirmedAt: lastConfirmedByMember.get(r.memberId) ?? null,
              }
            : null,
        };
      });
  }),

  /**
   * One member's attendance history + derived stats (spec O4 "member detail",
   * slice C.2 — ADR 39). Owner-only. Resolves the member to its user, lists
   * their `present` sessions (newest first), and reuses the pure `trainingStats`
   * + `classifyDrift` for the Overview tab. Contact/role come from the roster
   * row the web already holds — this returns only the history + numbers.
   */
  memberHistory: ownerProcedure
    .input(MemberActionSchema)
    .query(async ({ ctx, input }) => {
      const m = await requireMember(ctx.academyId, input.memberId);
      const history = await ctx.db
        .select({
          classId: classInstance.id,
          title: classInstance.title,
          discipline: classInstance.discipline,
          startsAt: classInstance.startsAt,
        })
        .from(classParticipation)
        .innerJoin(
          classInstance,
          eq(classParticipation.classId, classInstance.id),
        )
        .where(
          and(
            eq(classParticipation.studentId, m.userId),
            eq(classParticipation.attendanceStatus, "present"),
          ),
        )
        .orderBy(desc(classInstance.startsAt));
      const now = new Date();
      const timeZone = await academyTimeZone(ctx.db);
      const lastAttendance = history[0]?.startsAt ?? null;
      return {
        stats: trainingStats(history, now, timeZone),
        drift: classifyDrift(lastAttendance, now),
        lastAttendance,
        history,
      };
    }),

  /** Approve a pending member → grant the invited role + activate (docs/issues/20). */
  approve: ownerProcedure
    .input(MemberActionSchema)
    .mutation(async ({ ctx, input }) => {
      const m = await requireMember(ctx.academyId, input.memberId);
      if (!canApprove(m)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This member is not pending approval.",
        });
      }
      await setMemberRoleStatus(input.memberId, approveMembership(m));
      // Welcome push to the newly approved member (§4/S3, docs/issues/17).
      await notifyMembershipApproved({
        academyId: ctx.academyId,
        userId: m.userId,
      });
      return { ok: true as const };
    }),

  /** Reject a pending member → revoke access, keep the record (§4). */
  reject: ownerProcedure
    .input(MemberActionSchema)
    .mutation(async ({ ctx, input }) => {
      await requireMember(ctx.academyId, input.memberId);
      await setMemberStatus(input.memberId, "removed");
      return { ok: true as const };
    }),

  /** Remove an active member → revoke access, keep history (§4). Never ownerless. */
  remove: ownerProcedure
    .input(MemberActionSchema)
    .mutation(async ({ ctx, input }) => {
      await requireMember(ctx.academyId, input.memberId);
      await setStatusOrRejectLastOwner(
        ctx.academyId,
        input.memberId,
        "removed",
      );
      return { ok: true as const };
    }),

  /** Suspend a member → access revoked but reversible. Never ownerless. */
  suspend: ownerProcedure
    .input(MemberActionSchema)
    .mutation(async ({ ctx, input }) => {
      await requireMember(ctx.academyId, input.memberId);
      await setStatusOrRejectLastOwner(
        ctx.academyId,
        input.memberId,
        "suspended",
      );
      return { ok: true as const };
    }),

  /** Promote a member to co-owner (so a gym is never left ownerless — §4). */
  promote: ownerProcedure
    .input(MemberActionSchema)
    .mutation(async ({ ctx, input }) => {
      await requireMember(ctx.academyId, input.memberId);
      await setMemberRoleStatus(input.memberId, {
        role: "owner",
        status: "active",
      });
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
