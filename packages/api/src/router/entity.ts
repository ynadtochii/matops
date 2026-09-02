import type { TRPCRouterRecord } from "@trpc/server";

import { createEntity, listEntitiesForUser, listEntitiesOf } from "@matops/db";
import { isActiveMember, isOwner } from "@matops/domain";
import { CreateEntitySchema } from "@matops/validators";

import {
  enrolledProcedure,
  organizationMemberProcedure,
  organizationOwnerIdentityProcedure,
} from "../trpc";

export const entityRouter = {
  /**
   * The places the caller may open. An owner sees every entity of the
   * organization; anyone else sees only the ones they hold a membership in, so
   * the selector never offers a door that would refuse them.
   */
  list: organizationMemberProcedure.query(async ({ ctx }) => {
    const owns =
      isActiveMember(ctx.orgMembership) && isOwner(ctx.orgMembership);
    const rows = owns
      ? await listEntitiesOf(ctx.organizationId, ctx.db)
      : await listEntitiesForUser(
          ctx.organizationId,
          ctx.session.user.id,
          ctx.db,
        );
    return rows.map((e) => ({ id: e.id, name: e.name, type: e.type }));
  }),

  /** The entity this request named, once the tier has authorized it. */
  current: enrolledProcedure.query(({ ctx }) => ({
    id: ctx.entity.id,
    name: ctx.entity.name,
    type: ctx.entity.type,
    role: ctx.membership.role,
    status: ctx.membership.status,
  })),

  /**
   * Add a second academy to the organization (owner only). It gets its own id,
   * slug, public code, schedule, curriculum and membership rows, so the first
   * academy is untouched. Only `bjj_academy` is implemented; the schema refuses
   * anything else before this runs, and the table's check constraint refuses it
   * again.
   */
  create: organizationOwnerIdentityProcedure
    .input(CreateEntitySchema)
    .mutation(({ ctx, input }) =>
      createEntity(
        {
          organizationId: ctx.organizationId,
          type: input.type,
          name: input.name,
          ownerUserId: ctx.session.user.id,
        },
        ctx.baseDb,
      ),
    ),
} satisfies TRPCRouterRecord;
