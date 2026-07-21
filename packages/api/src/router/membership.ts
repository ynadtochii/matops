import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import {
  createPendingMembership,
  findAcademyByCode,
  getMemberById,
  listMembersOf,
  resolveInviteToken,
  setMemberRoleStatus,
  setMemberStatus,
  updateUserProfile,
} from "@matops/db";
import {
  approveMembership,
  canApprove,
  canRemoveOrDemote,
  CODE_JOIN_ROLE,
} from "@matops/domain";
import {
  JoinAcademySchema,
  JoinByCodeSchema,
  MemberActionSchema,
} from "@matops/validators";

import type { createTRPCContext } from "../trpc";
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

/** Reject remove/suspend/demote that would leave the academy ownerless (§4). */
async function assertNotLastOwner(academyId: string, memberId: string) {
  const roster = await listMembersOf(academyId);
  const members = roster.map((r) => ({
    id: r.memberId,
    role: r.role,
    status: r.status,
  }));
  if (!canRemoveOrDemote(members, memberId)) {
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
   * hidden; history is kept. `visitCount` is a stub until attendance ships
   * (Phase 3) — it will power the "attended 3×" nudge on pending rows (§4).
   */
  roster: ownerProcedure.query(async ({ ctx }) => {
    const rows = await listMembersOf(ctx.academyId);
    return rows
      .filter((r) => r.status !== "removed")
      .map((r) => ({
        memberId: r.memberId,
        name: r.name,
        email: r.email,
        phone: r.phone,
        role: r.role,
        status: r.status,
        invitedRole: r.invitedRole,
        joinedAt: r.createdAt,
        visitCount: 0, // TODO(phase 3): real attendance count for the approval nudge
      }));
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
      // TODO(phase 4): notify the member ("You're in at {academy}").
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
      await assertNotLastOwner(ctx.academyId, input.memberId);
      await setMemberStatus(input.memberId, "removed");
      return { ok: true as const };
    }),

  /** Suspend a member → access revoked but reversible. Never ownerless. */
  suspend: ownerProcedure
    .input(MemberActionSchema)
    .mutation(async ({ ctx, input }) => {
      await requireMember(ctx.academyId, input.memberId);
      await assertNotLastOwner(ctx.academyId, input.memberId);
      await setMemberStatus(input.memberId, "suspended");
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
