import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { TenantTx } from "@matops/db";
import type { Membership } from "@matops/domain";
import {
  and,
  createPendingMembership,
  deleteEntityMembership,
  deleteMemberRow,
  deleteUserRow,
  desc,
  eq,
  eraseMemberData,
  findAcademyByCode,
  gt,
  hasOtherMemberships,
  hasSiblingEntityMemberships,
  inArray,
  linkLeadOnJoin,
  resolveInviteToken,
  setMemberRoleIfNotLastOwner,
  setMemberRoleStatus,
  setMemberStatus,
  setMemberStatusIfNotLastOwner,
  sql,
  updateUserProfile,
} from "@matops/db";
import {
  classInstance,
  classParticipation,
  paymentClaim,
} from "@matops/db/schema";
import {
  approveMembership,
  bookingAccess,
  canApprove,
  canDecideSeat,
  classifyDrift,
  CODE_JOIN_ROLE,
  isActiveMember,
  isArchived,
  isOnRoster,
  isOwner,
  isSuspended,
  paymentStatus,
  trainingStats,
} from "@matops/domain";
import {
  InviteRoleSchema,
  JoinAcademySchema,
  JoinByCodeSchema,
  MemberActionSchema,
} from "@matops/validators";

import type { createTRPCContext } from "../trpc";
import { academyTimeZone } from "../academy-tz";
import { releaseSeats } from "../classes";
import { activateMember, requireMember, rosterOf, staffOf } from "../members";
import { LAST_OWNER } from "../messages";
import { readAllDuesWithPlan, readPaymentSettings } from "../payments-read";
import {
  ownerIdentityProcedure,
  ownerProcedure,
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
  await linkLeadOnJoin(input.academyId, input.phone, userId, ctx.baseDb);
  if (!ctx.session.session.activeOrganizationId) {
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
  userId: string,
): Promise<number> {
  const now = new Date();
  const cancelled = await ctx.db
    .update(classParticipation)
    .set({ bookingStatus: "cancelled", cancelledAt: now })
    .where(
      and(
        eq(classParticipation.studentId, userId),
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
          message: "This invite isn't valid — ask your gym for a new link.",
        });
      }
      return joinPending(ctx, {
        organizationId: invite.organizationId,
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
      const academy = await findAcademyByCode(input.code, ctx.baseDb);
      if (!academy) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "No gym found with that ID — check the number with your gym.",
        });
      }
      return joinPending(ctx, {
        organizationId: academy.organizationId,
        academyId: academy.academyId,
        invitedRole: CODE_JOIN_ROLE,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
      });
    }),

  /**
   * The member list for the active academy (spec O4). Staff, so the head coach
   * can run the desk (ADR 75); dues are owner-only. Removed rows are
   * hidden; history is kept. `visitCount` (slice 3.3) = how many classes the
   * member attended (present), powering the "attended 3×" nudge on pending rows
   * (§4). Counted on the RLS-scoped `ctx.db`, grouped by student.
   */
  members: staffProcedure.query(async ({ ctx }) => {
    const rows = await rosterOf(ctx);
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
    // is the `member.id`, aligning with the member row's `memberId`.
    const duesRows = await readAllDuesWithPlan(ctx.db);
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
    // Money is the owner's business, not the coach's: an instructor runs the
    // desk (approve, rank) and gets the same roster without the dues figures.
    const seesDues = isOwner(ctx.membership);
    const gate = seesDues ? await readPaymentSettings(ctx.db) : null;
    const openClaimMembers = new Set(
      gate?.enforcedAt
        ? (
            await ctx.db
              .select({ memberId: paymentClaim.memberId })
              .from(paymentClaim)
              .where(eq(paymentClaim.status, "pending"))
          ).map((c) => c.memberId)
        : [],
    );
    return rows.filter(isOnRoster).map((r) => {
      const d = seesDues ? duesByMember.get(r.memberId) : undefined;
      const access =
        gate && r.role === "student" && r.status === "active"
          ? bookingAccess(
              {
                enforcedAt: gate.enforcedAt,
                graceDays: gate.graceDays,
                memberSince: r.createdAt,
                nextDueAt: duesByMember.get(r.memberId)?.nextDueAt ?? null,
                hasOpenClaim: openClaimMembers.has(r.memberId),
              },
              now,
            )
          : null;
      return {
        access,
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
              planId: d.planId,
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
   * The people who left (spec O4 "Archived" tab, docs/issues/84). Owner-only:
   * it is the same standing as suspend and remove, and a coach running the desk
   * has no business with the leavers list. Deliberately thin — a name, how to
   * reach them and when they joined — because the tab exists to restore someone
   * or to erase them, not to browse. Declined applicants (`removed`) are NOT
   * here: they were never members.
   */
  archived: ownerProcedure.query(async ({ ctx }) => {
    const rows = await rosterOf(ctx);
    return rows.filter(isArchived).map((r) => ({
      memberId: r.memberId,
      name: r.name,
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
            eq(classParticipation.studentId, m.userId),
            eq(classParticipation.attendanceStatus, "present"),
          ),
        )
        .orderBy(desc(classInstance.startsAt));
      const now = new Date();
      const timeZone = await academyTimeZone(ctx);
      const lastAttendance = history[0]?.startsAt ?? null;
      return {
        stats: trainingStats(history, now, timeZone),
        drift: classifyDrift(lastAttendance, now),
        lastAttendance,
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
        userId: m.userId,
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
  archive: ownerIdentityProcedure
    .input(MemberActionSchema)
    .mutation(async ({ ctx, input }) => {
      const m = await requireMember(identityScope(ctx), input.memberId);
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
        releaseUpcomingSeats({ db, academyId: ctx.academyId }, m.userId),
      );
      return { ok: true as const, seatsFreed: freed };
    }),

  /**
   * Erase a member for good (spec O4, docs/issues/84). Irreversible, and the
   * action an owner uses to answer a data-deletion request.
   *
   * Archiving FIRST is not decoration: it reuses the locked never-ownerless
   * guard, and it is the recoverable state a half-finished erase falls back to,
   * because the RLS transaction and the base connection cannot commit as one.
   */
  purge: ownerIdentityProcedure
    .input(MemberActionSchema)
    .mutation(async ({ ctx, input }) => {
      const m = await requireMember(identityScope(ctx), input.memberId);
      if (m.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "You can't erase your own membership.",
        });
      }
      await rejectIfLastOwner(
        setMemberStatusIfNotLastOwner(
          ctx.academyId,
          input.memberId,
          "archived",
          ctx.baseDb,
        ),
      );
      const report = await ctx.withScope((db) =>
        eraseMemberData(db, {
          academyId: ctx.academyId,
          memberId: input.memberId,
          userId: m.userId,
          actorId: ctx.session.user.id,
        }),
      );
      await deleteEntityMembership(ctx.baseDb, ctx.academyId, m.userId);
      // The organization membership is what lets them into the gym's OTHER
      // mats, so it only goes once the last entity membership has (ADR 124).
      const stillHere = await hasSiblingEntityMemberships(
        ctx.baseDb,
        m.userId,
        ctx.organizationId,
      );
      if (!stillHere) {
        await deleteMemberRow(ctx.baseDb, ctx.academyId, input.memberId);
      }
      const elsewhere =
        stillHere ||
        (await hasOtherMemberships(ctx.baseDb, m.userId, ctx.academyId));
      if (!elsewhere) {
        await deleteUserRow(ctx.baseDb, m.userId);
      }
      return { ok: true as const, accountDeleted: !elsewhere, report };
    }),

  /** Suspend a member → access revoked but reversible. Never ownerless. */
  suspend: ownerIdentityProcedure
    .input(MemberActionSchema)
    .mutation(async ({ ctx, input }) => {
      await requireMember(identityScope(ctx), input.memberId);
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
  restore: ownerIdentityProcedure
    .input(MemberActionSchema)
    .mutation(async ({ ctx, input }) => {
      const m = await requireMember(identityScope(ctx), input.memberId);
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
   * Set a member's academy role: make a student an instructor, step a coach back
   * to student, or step an owner down to instructor (spec O6). Atomic
   * never-ownerless check: the last active owner can't be stepped down (promote
   * a co-owner first, §4).
   */
  setRole: ownerIdentityProcedure
    .input(MemberActionSchema.extend({ role: InviteRoleSchema }))
    .mutation(async ({ ctx, input }) => {
      await requireMember(identityScope(ctx), input.memberId);
      await rejectIfLastOwner(
        setMemberRoleIfNotLastOwner(
          ctx.academyId,
          input.memberId,
          input.role,
          ctx.baseDb,
        ),
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
    return rows.map((r) => ({ userId: r.userId, name: r.name, role: r.role }));
  }),

  /**
   * The academy's staff — active owners + instructors (spec O10, moved by ADR
   * 63). A lean read for the Coaches staff list; no dues/visit joins (that's the
   * member list's job). Carries emails, so owner-only.
   */
  staff: ownerProcedure.query(async ({ ctx }) => {
    const rows = await staffOf(ctx);
    return rows.map((r) => ({
      memberId: r.memberId,
      name: r.name,
      email: r.email,
      role: r.role,
    }));
  }),
} satisfies TRPCRouterRecord;
