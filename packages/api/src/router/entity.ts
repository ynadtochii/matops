import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { DbExec, ScopedEntity, TenantTx } from "@matops/db";
import {
  and,
  count,
  createEntity,
  eq,
  generalBranchesEnabled,
  getEntityInOrganization,
  gt,
  hasLegacyDuesAt,
  inArray,
  isNull,
  listEntitiesForUser,
  listEntitiesOf,
  rebuildSchedule,
  recordMilestone,
  withScope,
} from "@matops/db";
import {
  accessAssignment,
  accessPlan,
  accessPlanEntity,
  classInstance,
  classParticipation,
  entity,
  entityMembership,
  member,
  membershipPolicy,
  organization,
} from "@matops/db/schema";
import {
  isActiveMember,
  isGeneralSpace,
  isOwner,
  isStaff,
  runsOrganization,
} from "@matops/domain";
import {
  BranchDecisionSchema,
  CreateEntitySchema,
  EntityIdSchema,
  SetBranchRoleSchema,
  SetMembershipEnforcedSchema,
} from "@matops/validators";

import { rosterOf } from "../members";
import { loadRosterStanding } from "../membership-access";
import { assignmentAppliesNow } from "../membership-status";
import {
  enrolledProcedure,
  organizationManagerIdentityProcedure,
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
  { id: string; name: string; type: string; role: string; status: string }[]
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
    };
  });
}

/** Refuse somebody who is not part of this gym at all. */
async function requireOrganizationMember(
  ctx: { organizationId: string; baseDb: DbExec },
  userId: string,
): Promise<void> {
  const rows = await ctx.baseDb
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, ctx.organizationId),
        eq(member.userId, userId),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That person is not part of this gym",
    });
  }
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
      .select({
        name: organization.name,
        generalBranches: organization.generalBranchesEnabled,
      })
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
      // Two answers, not one: `create` refuses a general space unless the gym
      // is entitled to them, so a client with only "may I add a branch" would
      // offer a type the server is about to reject (ADR 128).
      canCreateGeneralBranches: owns && (org?.generalBranches ?? false),
      entities: await standingAt(ctx, rows, runs),
    };
  }),

  /**
   * Put somebody on a branch, or change what they are there, from the gym's
   * person profile (ADR 129).
   *
   * Organization-tier with an explicit branch check, so it never widens a
   * scope: the branch is verified to belong to this gym before anything is
   * read, and the write runs inside that branch's own transaction.
   *
   * ORDINARY roles only. `student` and `instructor` are the whole list, so a
   * plan assignment or a staff edit can never mint an owner; making one stays
   * on `membership.promote`, which is owner-only (ADR 129).
   */
  setBranchRole: organizationManagerIdentityProcedure
    .input(SetBranchRoleSchema)
    .mutation(async ({ ctx, input }) => {
      const branch = await requireOwnEntity(ctx, input.entityId);
      await requireOrganizationMember(ctx, input.userId);

      await withScope(
        { organizationId: ctx.organizationId, entityId: branch.id },
        async (db) => {
          const [held] = await db
            .select({
              id: entityMembership.id,
              role: entityMembership.role,
            })
            .from(entityMembership)
            .where(
              and(
                eq(entityMembership.entityId, branch.id),
                eq(entityMembership.userId, input.userId),
              ),
            );
          // Stepping an owner down is removing an owner, which is not this
          // screen's job whoever is looking at it.
          if (held?.role === "owner") {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Owner roles are changed on that branch's Coaches page.",
            });
          }
          if (held) {
            await db
              .update(entityMembership)
              .set({ role: input.role, status: "active", joinedAt: new Date() })
              .where(eq(entityMembership.id, held.id));
            return;
          }
          await db.insert(entityMembership).values({
            organizationId: ctx.organizationId,
            entityId: branch.id,
            userId: input.userId,
            role: input.role,
            status: "active",
            joinedAt: new Date(),
          });
        },
        ctx.baseDb,
      );
      return { ok: true as const };
    }),

  /**
   * Approve or decline one person's place at one branch, from the gym's person
   * profile. A request stays a PER-BRANCH decision: approving at the mat says
   * nothing about the gym floor (ADR 129).
   */
  decideAtBranch: organizationManagerIdentityProcedure
    .input(BranchDecisionSchema)
    .mutation(async ({ ctx, input }) => {
      const branch = await requireOwnEntity(ctx, input.entityId);
      await withScope(
        { organizationId: ctx.organizationId, entityId: branch.id },
        async (db) => {
          const [held] = await db
            .select({
              id: entityMembership.id,
              role: entityMembership.role,
              status: entityMembership.status,
              invitedRole: entityMembership.invitedRole,
            })
            .from(entityMembership)
            .where(
              and(
                eq(entityMembership.entityId, branch.id),
                eq(entityMembership.userId, input.userId),
              ),
            );
          if (!held) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "They do not belong to that branch",
            });
          }
          if (held.role === "owner") {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Owners are not decided here.",
            });
          }
          await db
            .update(entityMembership)
            .set(
              input.decision === "approve"
                ? {
                    status: "active",
                    role: held.invitedRole ?? held.role,
                    joinedAt: new Date(),
                  }
                : { status: "removed" },
            )
            .where(eq(entityMembership.id, held.id));
        },
        ctx.baseDb,
      );
      return { ok: true as const };
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
   * Add a branch to the organization (owner only). It gets its own id, slug,
   * public code, schedule and membership rows, so the first academy is
   * untouched. A BJJ academy also gets its profile and a curriculum track; a
   * general space gets neither (ADR 126).
   *
   * The schema refuses a type nobody implemented before this runs, and the
   * table's check constraint refuses it again. A general space needs one more
   * thing: the organization's own `general_branches_enabled` flag, which is off
   * until the pilot turns it on.
   */
  create: organizationOwnerIdentityProcedure
    .input(CreateEntitySchema)
    .mutation(async ({ ctx, input }) => {
      if (
        isGeneralSpace(input.type) &&
        !(await generalBranchesEnabled(ctx.organizationId, ctx.baseDb))
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "General branches are not enabled for this gym",
        });
      }
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

  /**
   * Who stops being able to book if this branch is switched onto shared
   * memberships (ADR 127).
   *
   * The names are the point: a count alone does not tell an owner whether the
   * switch is safe. Every ACTIVE member counts, whatever their role, because
   * the gate runs for anybody who books and gives staff no bypass.
   *
   * No new rule: `covered` is computed by the same `membershipAccess` the gate
   * itself runs, so the preview and the gate cannot disagree.
   */
  activationPreview: organizationManagerIdentityProcedure
    .input(EntityIdSchema)
    .query(async ({ ctx, input }) => {
      const branch = await requireOwnEntity(ctx, input.entityId);
      return withScope(
        { organizationId: ctx.organizationId, entityId: branch.id },
        async (db) => {
          const members = await rosterOf({ academyId: branch.id, db });
          const active = members.filter((m) => m.status === "active");
          const standing = await loadRosterStanding(db, {
            entityId: branch.id,
            people: active.map((m) => ({
              userId: m.userId,
              status: m.status,
            })),
            now: new Date(),
          });
          const notCovered = active.filter(
            (m) => !standing.get(m.userId)?.covered,
          );
          const uncovered = notCovered.map((m) => ({
            userId: m.userId,
            name: m.name,
            role: m.role,
          }));
          // Staff run the branch rather than buying access to it, so an owner
          // or a coach holding no plan is not a reason to refuse activation.
          // They stay on the list above, which is what the switch would take
          // away, because staff book classes too.
          const blocking = notCovered.filter((m) => !isStaff(m)).length;

          // What switching the gate on would actually take away. ADR 126 §8
          // recorded this as promised and not built: the preview named the
          // PEOPLE but not the classes they would lose, which is the half an
          // owner is judged on by the members who turn up and find no place.
          const bookings =
            uncovered.length === 0
              ? []
              : await db
                  .select({
                    studentId: classParticipation.studentId,
                    n: count(),
                  })
                  .from(classParticipation)
                  .innerJoin(
                    classInstance,
                    eq(classInstance.id, classParticipation.classId),
                  )
                  .where(
                    and(
                      inArray(
                        classParticipation.studentId,
                        uncovered.map((u) => u.userId),
                      ),
                      eq(classParticipation.bookingStatus, "booked"),
                      gt(classInstance.startsAt, new Date()),
                      eq(classInstance.status, "scheduled"),
                    ),
                  )
                  .groupBy(classParticipation.studentId);

          // Readiness: the four things that make switching this branch on a
          // bad idea today, each as a count the owner can drive to zero
          // (spec FP8). Named rather than folded into one boolean, because
          // "not ready" without a reason is not actionable.
          const covering = await db
            .select({
              planId: accessPlan.id,
              priceMinor: accessPlan.priceMinor,
            })
            .from(accessPlanEntity)
            .innerJoin(accessPlan, eq(accessPlan.id, accessPlanEntity.planId))
            .where(
              and(
                eq(accessPlanEntity.entityId, branch.id),
                isNull(accessPlan.archivedAt),
              ),
            );

          const [policy] = await db
            .select({ bankDetails: membershipPolicy.bankDetails })
            .from(membershipPolicy);

          // Somebody a plan covers who has no ACTIVE membership at this branch
          // is reconciliation still to do: `accessPlan.reconcile` is what
          // clears it, and switching on before it runs blocks people the gym
          // believes it has already covered.
          const holders = covering.length
            ? await db
                .select({ userId: accessAssignment.userId })
                .from(accessAssignment)
                .where(
                  and(
                    inArray(
                      accessAssignment.planId,
                      covering.map((c) => c.planId),
                    ),
                    eq(accessAssignment.status, "active"),
                    assignmentAppliesNow(),
                  ),
                )
            : [];
          const activeHere = new Set(active.map((m) => m.userId));
          const pendingEnrolment = [
            ...new Set(holders.map((h) => h.userId)),
          ].filter((id) => !activeHere.has(id)).length;

          // Whether this branch ever ran branch dues, which decides if it is a
          // migration at all: one opened after the cutover has nothing to move
          // and nothing to roll back to (ADR 128).
          const legacy = await hasLegacyDuesAt(branch.id, db);

          const readiness = {
            uncoveredPeople: blocking,
            unpricedPlans: covering.filter((c) => c.priceMinor === null).length,
            bankDetails: (policy?.bankDetails ?? "").trim().length > 0,
            pendingEnrolment,
          };

          const byUser = new Map(bookings.map((b) => [b.studentId, b.n]));
          return {
            readiness,
            ready:
              readiness.uncoveredPeople === 0 &&
              readiness.unpricedPlans === 0 &&
              readiness.bankDetails &&
              readiness.pendingEnrolment === 0,
            entityId: branch.id,
            entityName: branch.name,
            enforced: branch.membershipEnforcedAt !== null,
            hasLegacyDues: legacy,
            activeMembers: active.length,
            uncovered: uncovered.map((u) => ({
              ...u,
              // Their booked classes still to come, which switching the gate
              // on would cancel.
              futureBookings: byUser.get(u.userId) ?? 0,
            })),
            futureBookings: bookings.reduce((n, b) => n + b.n, 0),
          };
        },
        ctx.baseDb,
      );
    }),

  /**
   * Move one branch between the two payment gates (ADR 126 §3, ADR 127).
   *
   * On stamps the moment; off hands the branch back to the legacy dues gate,
   * which is ADR 126's rollback level 2 and is meant to be reachable. Switching
   * on twice keeps the first timestamp, the same idempotence the legacy gate
   * toggle has.
   *
   * The write runs inside `withScope` rather than straight on the base
   * connection: `entity` carries an RLS policy on `app.organization_id`, and
   * ADR 125 put entity writes back under it.
   */
  setMembershipEnforced: organizationOwnerIdentityProcedure
    .input(SetMembershipEnforcedSchema)
    .mutation(async ({ ctx, input }) => {
      const branch = await requireOwnEntity(ctx, input.entityId);
      const enforcedAt = input.enforced
        ? (branch.membershipEnforcedAt ?? new Date())
        : null;
      await withScope(
        { organizationId: ctx.organizationId },
        (db) =>
          db
            .update(entity)
            .set({ membershipEnforcedAt: enforcedAt })
            .where(eq(entity.id, branch.id)),
        ctx.baseDb,
      );
      if (enforcedAt !== null) {
        await recordMilestone(
          {
            organizationId: ctx.organizationId,
            entityId: branch.id,
            name: "branch_activated",
            actorRole: "owner",
          },
          ctx.baseDb,
        );
      }
      return { enforced: enforcedAt !== null };
    }),
} satisfies TRPCRouterRecord;
