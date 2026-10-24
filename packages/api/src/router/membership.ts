import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import type { TenantTx } from "@matops/db";
import type { Membership, SignupWrites } from "@matops/domain";
import {
  and,
  createPendingMembership,
  deleteEntityMembership,
  deleteMemberRow,
  deleteOrganizationAssignments,
  deleteUserRow,
  desc,
  eq,
  eraseMemberData,
  findAcademyByCode,
  getMembership,
  gt,
  hasOtherMemberships,
  hasSiblingEntityMemberships,
  inArray,
  isNull,
  linkLeadOnJoin,
  or,
  recordMilestone,
  resolveInviteToken,
  saveSignupAnswers,
  setMemberRoleStatus,
  setMemberStatus,
  setMemberStatusIfNotLastOwner,
  sql,
  updateUserProfile,
  withScope,
} from "@matops/db";
import {
  classInstance,
  classParticipation,
  entity,
  entityMembership,
  waiverAcceptance,
} from "@matops/db/schema";
import {
  approveMembership,
  canApprove,
  canDecideSeat,
  classifyDrift,
  CODE_JOIN_ROLE,
  isActiveMember,
  isArchived,
  isOnRoster,
  isOwner,
  isStaffRole,
  isStudentMember,
  isSuspended,
  publicFileUrl,
  signupWrites,
  trainingStats,
} from "@matops/domain";
import {
  EmailUpdatesSchema,
  JoinAcademySchema,
  JoinByCodeSchema,
  MemberActionSchema,
} from "@matops/validators";

import type { createTRPCContext } from "../trpc";
import { academyTimeZone } from "../academy-tz";
import { releaseSeats } from "../classes";
import {
  activateMember,
  directoryRosterOf,
  requireMember,
  staffOf,
} from "../members";
import { loadRosterStanding } from "../membership-access";
import { LAST_OWNER } from "../messages";
import { deleteStoredObjects } from "../stored-objects";
import {
  branchManagerIdentityProcedure,
  branchManagerProcedure,
  enrolledProcedure,
  ownerIdentityProcedure,
  protectedProcedure,
  refreshSessionCookie,
  staffIdentityProcedure,
  staffProcedure,
} from "../trpc";

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
    organizationId: string;
    academyId: string;
    invitedRole: string;
    firstName: string;
    lastName: string;
    phone: string;
    signup: SignupWrites;
  },
) {
  const userId = ctx.session.user.id;
  await updateUserProfile(
    userId,
    {
      name: `${input.firstName} ${input.lastName}`.trim(),
      phone: input.phone,
    },
    ctx.baseDb,
  );
  const result = await createPendingMembership(
    {
      userId,
      organizationId: input.organizationId,
      entityId: input.academyId,
      invitedRole: input.invitedRole,
    },
    ctx.baseDb,
  );
  const { signup } = input;
  if (!result.alreadyMember) {
    await withScope(
      { organizationId: input.organizationId, entityId: input.academyId },
      (tx) =>
        saveSignupAnswers(tx, {
          academyId: input.academyId,
          memberId: result.memberId,
          userId,
          ...signup,
        }),
      ctx.baseDb,
    );
  }
  await linkLeadOnJoin(input.academyId, input.phone, userId, ctx.baseDb);
  if (input.invitedRole === "student" && !result.alreadyMember) {
    await recordMilestone(
      {
        organizationId: input.organizationId,
        entityId: input.academyId,
        name: "first_student",
        actorRole: "student",
      },
      ctx.baseDb,
    );
  }
  // Follow the person to the gym they just joined. Only skipping when the
  // session already names THIS organization: a student who joins a second gym
  // would otherwise keep the first one active, and every request naming their
  // new academy would be refused for belonging to another organization.
  if (ctx.session.session.activeOrganizationId !== input.organizationId) {
    await ctx.authApi.setActiveOrganization({
      body: { organizationId: input.organizationId },
      headers: ctx.headers,
    });
  }
  await refreshSessionCookie(ctx);
  return {
    academyId: input.academyId,
    status: result.status,
    alreadyMember: result.alreadyMember,
  };
}

/**
 * Run one of the last-owner-safe writes and turn its refusal into an error. The
 * check + write are atomic (one locked transaction) inside the `@matops/db`
 * function, so two concurrent owner mutations cannot both pass and strand the
 * gym without an owner.
 */
async function rejectIfLastOwner(
  write: Promise<{ ok: boolean }>,
): Promise<void> {
  const { ok } = await write;
  if (!ok) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: LAST_OWNER,
    });
  }
}

/**
 * Give back every seat a departing member still holds on a FUTURE scheduled
 * class, and leave their past rows alone — a past participation row carries the
 * attendance record on the same row as the booking (docs/issues/79).
 *
 * `class_participation` has a unique index on (class_id, student_id), so one
 * person can hold at most one seat per class and a flat -1 per affected class is
 * exact. Only `confirmed` seats are given back: a provisional booking never held
 * one (booking.ts). Runs on the RLS-scoped `ctx.db`, so it cannot reach another
 * academy's classes.
 */
async function releaseUpcomingSeats(
  ctx: { db: TenantTx; academyId: string },
  input: { personId: string | null; accountUserId: string | null },
): Promise<number> {
  const now = new Date();
  const cancelled = await ctx.db
    .update(classParticipation)
    .set({ bookingStatus: "cancelled", cancelledAt: now })
    .where(
      and(
        or(
          input.personId
            ? eq(classParticipation.personId, input.personId)
            : undefined,
          input.accountUserId
            ? and(
                isNull(classParticipation.personId),
                eq(classParticipation.studentId, input.accountUserId),
              )
            : undefined,
        ),
        eq(classParticipation.bookingStatus, "booked"),
        inArray(
          classParticipation.classId,
          ctx.db
            .select({ id: classInstance.id })
            .from(classInstance)
            .where(
              and(
                gt(classInstance.startsAt, now),
                eq(classInstance.status, "scheduled"),
              ),
            ),
        ),
      ),
    )
    .returning({
      classId: classParticipation.classId,
      tier: classParticipation.bookingTier,
    });

  const held = cancelled
    .filter((c) => c.tier === "confirmed")
    .map((c) => c.classId);
  await releaseSeats(ctx.db, held);
  return held.length;
}

function identityScope(ctx: {
  academyId: string;
  baseDb: BaseContext["baseDb"];
}) {
  return { academyId: ctx.academyId, db: ctx.baseDb };
}

/** Enforce the pure `canDecideSeat` rule: the coach queue stays the owner's. */
function requireSeatDecider(
  ctx: { membership: Membership },
  m: { status: string; invitedRole: string | null },
): void {
  if (!canDecideSeat(ctx.membership, m)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Owner only" });
  }
}

async function requireBranchLifecycleChange(
  ctx: {
    organizationId: string;
    baseDb: BaseContext["baseDb"];
    membership: Membership;
  },
  target: { role: string; accountUserId: string | null },
): Promise<void> {
  if (target.role === "owner" && !isOwner(ctx.membership)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Owner only" });
  }
  const organizationMembership = target.accountUserId
    ? await getMembership(target.accountUserId, ctx.organizationId, ctx.baseDb)
    : null;
  if (
    organizationMembership?.role === "owner" ||
    organizationMembership?.role === "manager"
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Change this person's gym role before changing their branch access.",
    });
  }
}

function ownStudentMembership(ctx: {
  academyId: string;
  membership: Membership & { memberId: string | null };
}) {
  const { memberId } = ctx.membership;
  if (!memberId || isStaffRole(ctx.membership)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Only a student can do this.",
    });
  }
  return and(
    eq(entityMembership.id, memberId),
    eq(entityMembership.entityId, ctx.academyId),
  );
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
      const invite = await resolveInviteToken(input.token, ctx.baseDb);
      if (!invite) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This invite isn't valid. Ask your gym for a new link.",
        });
      }
      const signup = signupWrites({
        role: invite.role,
        healthQuestion: invite.signupHealthQuestion,
        requiredWaiverId: invite.waiver?.id ?? null,
        answers: input,
      });
      if (!signup.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: signup.message });
      }
      return joinPending(ctx, {
        organizationId: invite.organizationId,
        academyId: invite.academyId,
        invitedRole: invite.role,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        signup: signup.writes,
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
      const academy = await findAcademyByCode(input.code, ctx.baseDb);
      if (!academy) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "No gym found with that join code. Check the six digits with your gym.",
        });
      }
      const signup = signupWrites({
        role: CODE_JOIN_ROLE,
        healthQuestion: academy.signupHealthQuestion,
        requiredWaiverId: academy.waiver?.id ?? null,
        answers: input,
      });
      if (!signup.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: signup.message });
      }
      return joinPending(ctx, {
        organizationId: academy.organizationId,
        academyId: academy.academyId,
        invitedRole: CODE_JOIN_ROLE,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        signup: signup.writes,
      });
    }),

  /**
   * The member list for the active academy (spec O4). Staff, so the head coach
   * can run the desk (ADR 75); dues are owner-only. Removed rows are
   * hidden; history is kept. `visitCount` (slice 3.3) = how many classes the
   * member attended (present), powering the "attended 3×" nudge on pending rows
   * (§4). Counted on the RLS-scoped `ctx.db`, grouped by student.
   */
  members: staffProcedure
    .input(
      z
        .object({ audience: z.enum(["students", "all"]).default("students") })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const rows = (await directoryRosterOf(ctx)).filter(
        (r): r is typeof r & { memberId: string } =>
          r.memberId !== null &&
          (input?.audience === "all" || isStudentMember(r)),
      );
      const visits = await ctx.db
        .select({
          studentId: sql<string>`coalesce(${classParticipation.personId}::text, ${classParticipation.studentId})`,
          count: sql<number>`count(*)::int`,
        })
        .from(classParticipation)
        .where(eq(classParticipation.attendanceStatus, "present"))
        .groupBy(
          sql`coalesce(${classParticipation.personId}::text, ${classParticipation.studentId})`,
        );
      const visitByUser = new Map(visits.map((v) => [v.studentId, v.count]));

      const now = new Date();
      const [academy] = await ctx.db
        .select({ membershipEnforcedAt: entity.membershipEnforcedAt })
        .from(entity)
        .where(eq(entity.id, ctx.academyId));
      const standing = await loadRosterStanding(ctx.db, {
        entityId: ctx.academyId,
        people: rows.map((r) => ({
          userId: r.userId,
          status: r.status,
          role: r.role,
        })),
        now,
      });
      return rows.filter(isOnRoster).map((r) => {
        const membership = standing.get(r.userId) ?? null;
        return {
          membership:
            academy?.membershipEnforcedAt && membership
              ? {
                  verdict: membership.verdict,
                  accessSource: membership.accessSource,
                  covered: membership.covered,
                  planNames: membership.planNames,
                }
              : null,
          memberId: r.memberId,
          personId: r.personId,
          // A shared membership keys on the person, not on their standing at one
          // branch, so the member profile needs the user id to read it (ADR 126).
          userId: r.userId,
          name: r.name,
          avatarUrl: publicFileUrl(ctx.appUrl, r.avatarKey),
          email: r.email,
          phone: r.phone,
          role: r.role,
          status: r.status,
          invitedRole: r.invitedRole,
          erasureRequestedAt: r.erasureRequestedAt,
          joinedAt: r.createdAt,
          visitCount: visitByUser.get(r.userId) ?? 0,
        };
      });
    }),

  /**
   * The people who left (spec O4 "Archived" tab, docs/issues/84). Owner-only:
   * it is the same standing as suspend and remove, and a coach running the desk
   * has no business with the leavers list. Deliberately thin — a name, how to
   * reach them and when they joined — because the tab exists to restore someone
   * or to erase them, not to browse. Declined applicants (`removed`) are NOT
   * here: they were never members.
   */
  archived: branchManagerProcedure.query(async ({ ctx }) => {
    const rows = (await directoryRosterOf(ctx)).filter(
      (r): r is typeof r & { memberId: string } =>
        r.memberId !== null && isStudentMember(r),
    );
    return rows.filter(isArchived).map((r) => ({
      memberId: r.memberId,
      name: r.name,
      avatarUrl: publicFileUrl(ctx.appUrl, r.avatarKey),
      email: r.email,
      phone: r.phone,
      role: r.role,
      joinedAt: r.createdAt,
    }));
  }),

  /**
   * One member's attendance history + derived stats (spec O4 "member detail",
   * slice C.2 — ADR 39). Staff. Resolves the member to its user, lists
   * their `present` sessions (newest first), and reuses the pure `trainingStats`
   * + `classifyDrift` for the Overview tab. Contact/role come from the member list
   * row the web already holds — this returns only the history + numbers.
   */
  memberHistory: staffProcedure
    .input(MemberActionSchema)
    .query(async ({ ctx, input }) => {
      const m = await requireMember(ctx, input.memberId);
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
            eq(
              sql`coalesce(${classParticipation.personId}::text, ${classParticipation.studentId})`,
              m.userId,
            ),
            eq(classParticipation.attendanceStatus, "present"),
          ),
        )
        .orderBy(desc(classInstance.startsAt));
      const now = new Date();
      const timeZone = await academyTimeZone(ctx);
      const lastAttendance = history[0]?.startsAt ?? null;
      const [agreement] = await ctx.db
        .select({ acceptedAt: waiverAcceptance.acceptedAt })
        .from(waiverAcceptance)
        .where(eq(waiverAcceptance.memberId, input.memberId))
        .orderBy(desc(waiverAcceptance.acceptedAt))
        .limit(1);
      return {
        stats: trainingStats(history, now, timeZone),
        drift: classifyDrift(lastAttendance, now),
        lastAttendance,
        waiverAcceptedAt: agreement?.acceptedAt ?? null,
        history,
      };
    }),

  /** Approve a pending member → grant the invited role + activate (docs/issues/20). Staff (ADR 75). */
  approve: staffIdentityProcedure
    .input(MemberActionSchema)
    .mutation(async ({ ctx, input }) => {
      const m = await requireMember(identityScope(ctx), input.memberId);
      requireSeatDecider(ctx, m);
      if (!canApprove(m)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This member is not pending approval.",
        });
      }
      await activateMember(ctx, {
        memberId: input.memberId,
        userId: m.accountUserId ?? m.userId,
        granted: approveMembership(m),
      });
      return { ok: true as const };
    }),

  /** Reject a pending member → revoke access, keep the record (§4). */
  reject: staffIdentityProcedure
    .input(MemberActionSchema)
    .mutation(async ({ ctx, input }) => {
      const m = await requireMember(identityScope(ctx), input.memberId);
      requireSeatDecider(ctx, m);
      await setMemberStatus(
        ctx.academyId,
        input.memberId,
        "removed",
        ctx.baseDb,
      );
      return { ok: true as const };
    }),

  /**
   * Archive a member — they left the gym (spec O4, docs/issues/84). Access is
   * revoked, their upcoming bookings are cancelled and the dues clock stops, but
   * every row they own is kept and `restore` brings them back whole. Never
   * ownerless. Reversible; `purge` is the irreversible one.
   */
  archive: branchManagerIdentityProcedure
    .input(MemberActionSchema)
    .mutation(async ({ ctx, input }) => {
      const m = await requireMember(identityScope(ctx), input.memberId);
      await requireBranchLifecycleChange(ctx, m);
      // Only someone who WAS a member can leave. Archiving a pending applicant
      // and restoring them would activate them without approval, and with the
      // placeholder Better Auth role, because the real role is granted at
      // approval and never here.
      if (!isActiveMember(m) && !isSuspended(m)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Only an active or suspended member can be archived.",
        });
      }
      // Status first: it is the access gate, so a race cannot book in the gap
      // between cancelling their seats and revoking the account.
      await rejectIfLastOwner(
        setMemberStatusIfNotLastOwner(
          ctx.academyId,
          input.memberId,
          "archived",
          ctx.baseDb,
        ),
      );
      const freed = await ctx.withScope((db) =>
        releaseUpcomingSeats(
          { db, academyId: ctx.academyId },
          {
            personId: m.personId === m.accountUserId ? null : m.personId,
            accountUserId: m.accountUserId,
          },
        ),
      );
      return { ok: true as const, seatsFreed: freed };
    }),

  /** The caller's own erase request at this academy (spec S7, ADR 145). */
  erasureRequest: enrolledProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ requestedAt: entityMembership.erasureRequestedAt })
      .from(entityMembership)
      .where(ownStudentMembership(ctx));
    return { requestedAt: row?.requestedAt ?? null };
  }),

  /**
   * A student asks the owner and managers to erase their data (spec S7, ADR
   * 145). Nothing is deleted here: the request waits on the Students Requests
   * tab until an owner or manager runs `purge`. Asking twice keeps the first
   * date.
   */
  requestErasure: enrolledProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(entityMembership)
      .set({
        erasureRequestedAt: sql`coalesce(${entityMembership.erasureRequestedAt}, now())`,
      })
      .where(ownStudentMembership(ctx));
    return { ok: true as const };
  }),

  withdrawErasureRequest: enrolledProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(entityMembership)
      .set({ erasureRequestedAt: null })
      .where(ownStudentMembership(ctx));
    return { ok: true as const };
  }),

  emailUpdates: enrolledProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ optedInAt: entityMembership.emailUpdatesAt })
      .from(entityMembership)
      .where(ownStudentMembership(ctx));
    return { optedInAt: row?.optedInAt ?? null };
  }),

  setEmailUpdates: enrolledProcedure
    .input(EmailUpdatesSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(entityMembership)
        .set({ emailUpdatesAt: input.emailUpdates ? sql`now()` : null })
        .where(ownStudentMembership(ctx));
      return { ok: true as const };
    }),

  /**
   * Erase a member for good (spec O4, docs/issues/84). Irreversible, and the
   * action an owner or manager uses to answer a data-deletion request (ADR
   * 145). A manager cannot erase an owner or anyone who runs the gym.
   *
   * Archiving FIRST is not decoration: it reuses the locked never-ownerless
   * guard, and it is the recoverable state a half-finished erase falls back to,
   * because the RLS transaction and the base connection cannot commit as one.
   */
  purge: branchManagerIdentityProcedure
    .input(MemberActionSchema)
    .mutation(async ({ ctx, input }) => {
      const m = await requireMember(identityScope(ctx), input.memberId);
      if (!isOwner(ctx.membership)) {
        await requireBranchLifecycleChange(ctx, m);
      }
      if (m.accountUserId === ctx.session.user.id) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "You can't erase your own membership.",
        });
      }
      if (!m.accountUserId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Archive this person instead of erasing an account.",
        });
      }
      if (!m.personId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This membership has no person record.",
        });
      }
      const accountUserId = m.accountUserId;
      await rejectIfLastOwner(
        setMemberStatusIfNotLastOwner(
          ctx.academyId,
          input.memberId,
          "archived",
          ctx.baseDb,
        ),
      );
      const { report, objectKeys } = await ctx.withScope((db) =>
        eraseMemberData(db, {
          academyId: ctx.academyId,
          memberId: input.memberId,
          userId: accountUserId,
        }),
      );
      await deleteStoredObjects(ctx.storage, objectKeys);
      await deleteEntityMembership(ctx.baseDb, ctx.academyId, accountUserId);
      // The organization membership is what lets them into the gym's OTHER
      // mats, so it only goes once the last entity membership has (ADR 124).
      const stillHere = await hasSiblingEntityMemberships(
        ctx.baseDb,
        accountUserId,
        ctx.organizationId,
      );
      // `member.role = "owner"` is written once, by Better Auth, when the gym is
      // created, and no code path can write it back. So the never-ownerless guard
      // above counts owners of THIS mat only, so it must not be the last thing
      // standing between an owner of one mat and the founder's whole organization.
      const orgMembership = await getMembership(
        accountUserId,
        ctx.organizationId,
        ctx.baseDb,
      );
      const foundedOrganization = orgMembership?.role === "owner";
      if (!stillHere && !foundedOrganization) {
        // No branch of this organization is left for a shared membership to
        // cover, so it goes with the organization row (ADR 126).
        report.access_assignment = await deleteOrganizationAssignments(
          ctx.baseDb,
          ctx.organizationId,
          m.personId,
        );
        await deleteMemberRow(ctx.baseDb, ctx.organizationId, accountUserId);
      }
      const elsewhere =
        stillHere ||
        foundedOrganization ||
        (await hasOtherMemberships(
          ctx.baseDb,
          accountUserId,
          ctx.organizationId,
        ));
      if (!elsewhere) {
        await deleteUserRow(ctx.baseDb, accountUserId);
      }
      return { ok: true as const, accountDeleted: !elsewhere, report };
    }),

  /** Suspend a member → access revoked but reversible. Never ownerless. */
  suspend: branchManagerIdentityProcedure
    .input(MemberActionSchema)
    .mutation(async ({ ctx, input }) => {
      const m = await requireMember(identityScope(ctx), input.memberId);
      await requireBranchLifecycleChange(ctx, m);
      await rejectIfLastOwner(
        setMemberStatusIfNotLastOwner(
          ctx.academyId,
          input.memberId,
          "suspended",
          ctx.baseDb,
        ),
      );
      return { ok: true as const };
    }),

  /**
   * Restore a suspended OR archived member → active again (§4, docs/issues/84).
   * One path for both, because both are the same promise: the row was never
   * thrown away, so rank, notes, dues and attendance all come back with them.
   * Seats cancelled by the archive do NOT come back — those classes may since
   * have filled or passed.
   */
  restore: branchManagerIdentityProcedure
    .input(MemberActionSchema)
    .mutation(async ({ ctx, input }) => {
      const m = await requireMember(identityScope(ctx), input.memberId);
      await requireBranchLifecycleChange(ctx, m);
      if (!isSuspended(m) && !isArchived(m)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This member is not suspended or archived.",
        });
      }
      await setMemberStatus(
        ctx.academyId,
        input.memberId,
        "active",
        ctx.baseDb,
      );
      return { ok: true as const };
    }),

  /** Promote a member to co-owner (so a gym is never left ownerless — §4). */
  promote: ownerIdentityProcedure
    .input(MemberActionSchema)
    .mutation(async ({ ctx, input }) => {
      await requireMember(identityScope(ctx), input.memberId);
      await setMemberRoleStatus(
        ctx.academyId,
        input.memberId,
        { role: "owner", status: "active" },
        ctx.baseDb,
      );
      return { ok: true as const };
    }),

  /**
   * Active staff as class-instructor options (spec O10, K.1). Deliberately NOT
   * `staff` above: that one is owner-only and carries emails, while this feeds a
   * picker every staff member opens. It returns `userId`, because
   * `class.instructor_id` is a `user.id` and not a `member.id`.
   */
  instructors: staffProcedure.query(async ({ ctx }) => {
    const rows = await staffOf(ctx);
    return rows.flatMap((r) =>
      r.accountUserId
        ? [{ userId: r.accountUserId, name: r.name, role: r.role }]
        : [],
    );
  }),

  staff: branchManagerProcedure.query(async ({ ctx }) => {
    const rows = (await directoryRosterOf(ctx)).filter(isStaffRole);
    return rows.map((r) => ({
      memberId: r.memberId,
      personId: r.personId,
      userId: r.userId,
      inheritedRole: r.inheritedRole,
      name: r.name,
      avatarUrl: publicFileUrl(ctx.appUrl, r.avatarKey),
      email: r.email,
      role: r.role,
      status: r.status,
      invitedRole: r.invitedRole,
    }));
  }),
} satisfies TRPCRouterRecord;
