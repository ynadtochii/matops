import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import {
  getOrCreateInvite,
  listInvites,
  resolveInviteToken,
  revokeInvite,
  rotateInvite,
} from "@matops/db";
import {
  IdSchema,
  InviteRoleSchema,
  InviteTokenSchema,
} from "@matops/validators";

import { ownerProcedure, publicProcedure } from "../trpc";

export const inviteRouter = {
  /** Live per-role links for the active academy (spec O4). Owner-only. */
  list: ownerProcedure.query(({ ctx }) => listInvites(ctx.academyId)),

  /** Ensure a live link exists for a role (create-on-demand). Owner-only. */
  create: ownerProcedure
    .input(z.object({ role: InviteRoleSchema }))
    .mutation(({ ctx, input }) =>
      getOrCreateInvite({
        academyId: ctx.academyId,
        role: input.role,
        createdBy: ctx.session.user.id,
      }),
    ),

  /** Rotate a role's link: the old token stops working, a new one is minted. */
  rotate: ownerProcedure
    .input(z.object({ role: InviteRoleSchema }))
    .mutation(({ ctx, input }) =>
      rotateInvite({
        academyId: ctx.academyId,
        role: input.role,
        createdBy: ctx.session.user.id,
      }),
    ),

  /** Revoke a specific link (kills it without minting a replacement). */
  revoke: ownerProcedure
    .input(z.object({ inviteId: IdSchema }))
    .mutation(async ({ ctx, input }) => {
      await revokeInvite(ctx.academyId, input.inviteId);
      return { ok: true as const };
    }),

  /**
   * Resolve a token on the public join screen → academy + intended role. Public
   * (no session, no active academy): reads the base connection, since
   * `academy_invite` has no RLS. Fails loudly on an unknown/expired token so the
   * UI can show "This invite isn't valid — ask your gym for a new link" (spec S2).
   */
  resolve: publicProcedure.input(InviteTokenSchema).query(async ({ input }) => {
    const resolved = await resolveInviteToken(input.token);
    if (!resolved) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "This invite isn't valid — ask your gym for a new link.",
      });
    }
    return resolved;
  }),
} satisfies TRPCRouterRecord;
