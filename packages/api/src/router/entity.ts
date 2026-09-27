import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { DbExec, ScopedEntity, TenantTx } from "@matops/db";
import {
  and,
  count,
  createEntity,
  eq,
  getEntityInOrganization,
  isNull,
  listEntitiesForUser,
  listEntitiesOf,
  rebuildSchedule,
  recordMilestone,
  withScope,
} from "@matops/db";
import { entity, entityMembership, organization } from "@matops/db/schema";
import { isActiveMember, isOwner, runsOrganization } from "@matops/domain";
import { CreateEntitySchema } from "@matops/validators";

import {
  organizationMemberProcedure,
  organizationOwnerIdentityProcedure,
} from "../trpc";

const NOT_YOURS = "That branch is not yours";

/**
 * The branch this call names, or a refusal. Runs BEFORE any scope is opened, so
 * an id belonging to another gym never reaches a read (ADR 124).
 */
async function requireOwnEntity(
  ctx: { organizationId: string; baseDb: DbExec },
  entityId: string,
): Promise<ScopedEntity> {
  const found = await getEntityInOrganization(
    entityId,
    ctx.organizationId,
    ctx.baseDb,
  );
  if (!found) {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_YOURS });
  }
  return found;
}

/**
 * Each branch with what this caller is AT IT (ADR 129).
 *
 * The selector needs it to carry a screen across a switch: the roster travels
 * for a coach and not for a student, and the destination decides, not the
 * branch being left. Somebody who runs the gym reads their gym role at every
 * branch, which is what the request context synthesizes anyway.
 */
async function standingAt(
  ctx: {
    db: TenantTx;
    session: { user: { id: string } };
    orgMembership: { role: string };
  },
  rows: ScopedEntity[],
  runsOrganization: boolean,
): Promise<
  {
    id: string;
    name: string;
    type: string;
    role: string;
    status: string;
    membershipEnforced: boolean;
  }[]
> {
  const held = runsOrganization
    ? []
    : await ctx.db
        .select({
          entityId: entityMembership.entityId,
          role: entityMembership.role,
          status: entityMembership.status,
        })
        .from(entityMembership)
        .where(eq(entityMembership.userId, ctx.session.user.id));

  return rows.map((e) => {
    const mine = held.find((m) => m.entityId === e.id);
    return {
      id: e.id,
      name: e.name,
      type: e.type,
      role: runsOrganization
        ? ctx.orgMembership.role
        : (mine?.role ?? "student"),
      status: runsOrganization ? "active" : (mine?.status ?? "pending"),
      membershipEnforced: e.membershipEnforcedAt !== null,
    };
  });
}

export const entityRouter = {
  /**
   * The places the caller may open. An owner sees every entity of the
   * organization; anyone else sees only the ones they hold a membership in, so
   * the selector never offers a door that would refuse them.
   */
  list: organizationMemberProcedure.query(async ({ ctx }) => {
    const owns =
      isActiveMember(ctx.orgMembership) && isOwner(ctx.orgMembership);
    // A manager sees every branch and runs the gym's daily work, but may not
    // open a branch: the two answers are separate because the actions are
    // (spec FP7). Navigation reads this one; `canCreateBranches` gates the
    // Add branch button alone.
    const runs = runsOrganization(ctx.orgMembership);
    const rows = runs
      ? await listEntitiesOf(ctx.organizationId, ctx.db)
      : await listEntitiesForUser(
          ctx.organizationId,
          ctx.session.user.id,
          ctx.db,
        );
    const [org] = await ctx.db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, ctx.organizationId));
    return {
      organizationId: ctx.organizationId,
      organizationName: org?.name ?? "Your gym",
      canCreateBranches: owns,
      /** Owner or manager: sees the gym's screens and does its daily work. */
      canRunOrganization: runs,
      /**
       * What this person is TO THE GYM, which the shell shows them. Their role
       * at a branch is a different answer and lives on `academy.current`.
       */
      role: ctx.orgMembership.role,
      entities: await standingAt(ctx, rows, runs),
    };
  }),

  /**
   * Add a branch to the organization (owner only). It gets its own id, slug,
   * public code, schedule and membership rows, so the first academy is
   * untouched, and gets its academy profile.
   *
   * The schema refuses a type nobody implemented before this runs, and the
   * table's check constraint refuses it again.
   */
  create: organizationOwnerIdentityProcedure
    .input(CreateEntitySchema)
    .mutation(async ({ ctx, input }) => {
      // A source branch is named by the client, so it is authorized like any
      // other entity the request names: the caller's own organization or
      // nothing. `requireOwnEntity` refuses a foreign id before the write.
      if (input.copyFromEntityId) {
        await requireOwnEntity(ctx, input.copyFromEntityId);
      }
      const made = await createEntity(
        {
          organizationId: ctx.organizationId,
          type: input.type,
          name: input.name,
          ownerUserId: ctx.session.user.id,
          timeZone: input.timeZone,
          copyFromEntityId: input.copyFromEntityId,
        },
        ctx.baseDb,
      );

      // Copied templates arrive as a plan with no classes under it, and an
      // owner who copied a schedule expects to see a week. `rebuildSchedule` in
      // the NEW branch's scope is the same call the Rebuild button makes; at a
      // branch minutes old it has nothing to delete and only materializes.
      if (made.created.includes("class_template")) {
        await withScope(
          { organizationId: ctx.organizationId, entityId: made.entityId },
          (db) => rebuildSchedule(db),
          ctx.baseDb,
        );
      }

      const live = await ctx.baseDb
        .select({ n: count() })
        .from(entity)
        .where(
          and(
            eq(entity.organizationId, ctx.organizationId),
            isNull(entity.deletedAt),
          ),
        );
      const nth = live[0]?.n ?? 1;
      if (nth <= 2) {
        await recordMilestone(
          {
            organizationId: ctx.organizationId,
            entityId: made.entityId,
            name: nth === 1 ? "first_branch" : "second_branch",
            actorRole: "owner",
          },
          ctx.baseDb,
        );
      }
      return made;
    }),
} satisfies TRPCRouterRecord;
