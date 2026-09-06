import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { DbExec, TenantTx } from "@matops/db";
import type { AssignmentCoverage } from "@matops/domain";
import {
  and,
  asc,
  desc,
  eq,
  eventRole,
  getEntityInOrganization,
  inArray,
  isNotNull,
  isNull,
  recordActivity,
  recordMilestone,
  withScope,
} from "@matops/db";
import {
  accessAssignment,
  accessPlan,
  accessPlanEntity,
  accessPlanPrice,
  entity,
  entityMembership,
  member,
  memberDues,
  membershipMonth,
  membershipMonthAudit,
  membershipPlan,
  membershipPolicy,
  user,
} from "@matops/db/schema";
import {
  affectedByCoverageChange,
  canClaimMonth,
  canEditPlan,
  canPriceFrom,
  formatDeadline,
  formatMonth,
  monthOf,
  payDeadline,
  paymentReference,
  priceForMonth,
  resolveAcademyTimeZone,
} from "@matops/domain";
import {
  AccessPlanIdSchema,
  ArchiveAccessPlanSchema,
  AssignMembershipSchema,
  AssignmentIdSchema,
  BulkAssignMembershipSchema,
  ClaimMembershipMonthSchema,
  CreateAccessPlanSchema,
  LegacyPlanMembersSchema,
  MarkMembershipMonthSchema,
  MemberAssignmentsSchema,
  MembershipMonthsSchema,
  MembershipPolicySchema,
  RejectMembershipClaimSchema,
  RenameAccessPlanSchema,
  SetAccessPlanCoverageSchema,
  SetAccessPlanPriceSchema,
} from "@matops/validators";

import { rosterOf } from "../members";
import { loadRosterStanding } from "../membership-access";
import {
  membershipBankDetails,
  membershipCalendar,
  membershipStanding,
} from "../membership-status";
import { readOrganizationEntities } from "../organization-read";
import {
  enrolledProcedure,
  organizationManagerIdentityProcedure,
  organizationManagerProcedure,
} from "../trpc";

const PLAN_NOT_FOUND = "That membership plan is gone";
const PLAN_FROZEN = "An archived plan cannot be changed. Restore it first.";
const UNKNOWN_BRANCH = "One of those branches is not yours";
const PLAN_CLOSED = "That plan is archived, so it takes no new members";
const NOT_A_MEMBER = "That person is not part of this gym";
const ASSIGNMENT_NOT_FOUND = "That membership is gone";
const MEMBERSHIP_NOT_ACTIVE =
  "That membership is not active, so there is nothing to pay for.";

/**
 * The column's own default, repeated here for the read that runs before any
 * row exists. `payments.ts` exports a `DEFAULT_GRACE_DAYS` for the LEGACY
 * branch dues gate, which is a different gate and must not be borrowed.
 */
const DEFAULT_MEMBERSHIP_GRACE_DAYS = 7;

type PlanRow = typeof accessPlan.$inferSelect;

/**
 * The plan, or a 404. RLS has already limited the table to this organization,
 * so "not mine" and "not there" are the same answer, which is what we want: a
 * missing plan and another gym's plan must be indistinguishable.
 */
async function loadPlan(db: TenantTx, id: string): Promise<PlanRow> {
  const [row] = await db.select().from(accessPlan).where(eq(accessPlan.id, id));
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: PLAN_NOT_FOUND });
  return row;
}

/**
 * Give ONE person a membership, or find the one they already hold.
 *
 * The assignment belongs to the ORGANIZATION and is stored once, however many
 * branches the plan covers and whichever branch the owner was standing in. So
 * assigning the same plan again from another branch returns the existing row
 * rather than making a second: `created` says which happened, and the screen
 * can say "they already have this" instead of quietly duplicating.
 *
 * A membership that was suspended or cancelled comes back active, because
 * assigning it again IS the owner's explicit decision to restore it. Branch
 * memberships get no such treatment (see `enrolInCoveredBranches`).
 *
 * Extracted so the single click and the bulk run share one meaning, rather
 * than two copies that drift on the restore rule (ADR 128).
 */
function recordFirstAssignment(ctx: {
  organizationId: string;
  orgMembership: { role: string };
  afterCommit: (task: (exec: DbExec) => Promise<void>) => void;
}) {
  ctx.afterCommit(async (exec) => {
    const event = {
      organizationId: ctx.organizationId,
      actorRole: eventRole(ctx.orgMembership.role),
    };
    await recordMilestone({ ...event, name: "first_assignment" }, exec);
    await recordActivity({ ...event, name: "staff_action" }, exec);
  });
}

async function assignOne(
  ctx: {
    db: TenantTx;
    organizationId: string;
    session: { user: { id: string } };
  },
  input: {
    userId: string;
    planId: string;
    assigningEntityId?: string | null;
    startMonth?: string | null;
  },
) {
  const plan = await loadPlan(ctx.db, input.planId);
  await requireOrganizationMember(ctx.db, ctx.organizationId, input.userId);

  const [held] = await ctx.db
    .select()
    .from(accessAssignment)
    .where(
      and(
        eq(accessAssignment.planId, plan.id),
        eq(accessAssignment.userId, input.userId),
      ),
    );

  // Archived stops NEW memberships only. Someone who already holds one keeps
  // it, and an owner may still put a paused one back on its feet.
  if (!held && plan.archivedAt !== null) {
    throw new TRPCError({ code: "CONFLICT", message: PLAN_CLOSED });
  }

  const startMonth = input.startMonth
    ? startMonthOf(new Date(input.startMonth))
    : startMonthOf(new Date());

  let assignmentId: string;
  let created = false;
  let restored = false;
  if (held) {
    assignmentId = held.id;
    if (held.status !== "active") {
      restored = true;
      await ctx.db
        .update(accessAssignment)
        .set({ status: "active", startMonth })
        .where(eq(accessAssignment.id, held.id));
    }
  } else {
    const [made] = await ctx.db
      .insert(accessAssignment)
      .values({
        organizationId: ctx.organizationId,
        userId: input.userId,
        planId: plan.id,
        assigningEntityId: input.assigningEntityId ?? null,
        startMonth,
        assignedBy: ctx.session.user.id,
      })
      .returning({ id: accessAssignment.id });
    if (!made) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not add the membership",
      });
    }
    assignmentId = made.id;
    created = true;
  }

  const reconciliation = await enrolInCoveredBranches(
    ctx.db,
    ctx.organizationId,
    input.userId,
    await coverageOf(ctx.db, plan.id),
  );
  return { id: assignmentId, created, restored, ...reconciliation };
}

/** Archived is frozen, not merely hidden: no rename, no coverage change. */
async function requireEditable(db: TenantTx, id: string): Promise<PlanRow> {
  const plan = await loadPlan(db, id);
  if (!canEditPlan({ id: plan.id, archived: plan.archivedAt !== null })) {
    throw new TRPCError({ code: "CONFLICT", message: PLAN_FROZEN });
  }
  return plan;
}

/** The entity ids one plan covers today. */
async function coverageOf(db: TenantTx, planId: string): Promise<string[]> {
  const rows = await db
    .select({ entityId: accessPlanEntity.entityId })
    .from(accessPlanEntity)
    .where(eq(accessPlanEntity.planId, planId));
  return rows.map((r) => r.entityId).sort();
}

/**
 * Refuse a branch this organization does not run, or one that has closed.
 *
 * The composite foreign key already makes a foreign entity impossible, but it
 * would surface as a driver error naming a constraint. This turns it into a
 * sentence, and it also catches a soft-deleted branch, which the key does not.
 */
async function requireOwnEntities(
  db: TenantTx,
  entityIds: string[],
): Promise<void> {
  if (entityIds.length === 0) return;
  const rows = await db
    .select({ id: entity.id })
    .from(entity)
    .where(and(inArray(entity.id, entityIds), isNull(entity.deletedAt)));
  if (rows.length !== entityIds.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: UNKNOWN_BRANCH });
  }
}

/**
 * Every assignment of this organization, each carrying the coverage its own
 * plan holds right now. The preview rule needs the WHOLE set, not just this
 * plan's, because it has to know what else still covers a person before it
 * calls a branch a loss.
 */
async function assignmentCoverage(db: TenantTx): Promise<AssignmentCoverage[]> {
  const rows = await db
    .select({
      id: accessAssignment.id,
      userId: accessAssignment.userId,
      planId: accessAssignment.planId,
      status: accessAssignment.status,
      entityId: accessPlanEntity.entityId,
    })
    .from(accessAssignment)
    .leftJoin(
      accessPlanEntity,
      eq(accessPlanEntity.planId, accessAssignment.planId),
    );

  const byAssignment = new Map<string, AssignmentCoverage>();
  for (const r of rows) {
    const held = byAssignment.get(r.id) ?? {
      id: r.id,
      userId: r.userId,
      planId: r.planId,
      status: r.status as AssignmentCoverage["status"],
      entityIds: [],
    };
    if (r.entityId) held.entityIds.push(r.entityId);
    byAssignment.set(r.id, held);
  }
  return [...byAssignment.values()];
}

/** What a coverage edit would do, without doing it. */
async function preview(db: TenantTx, planId: string, next: string[]) {
  return affectedByCoverageChange(planId, next, await assignmentCoverage(db));
}

/** The first day of the month an assignment starts in, as a date string. */
function startMonthOf(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 7)}-01`;
}

/**
 * Make sure the person can actually be given a membership here: they must
 * already belong to the organization. `member` carries no RLS, so this filters
 * by organization itself, unlike every other read in this file.
 */
async function requireOrganizationMember(
  db: TenantTx,
  organizationId: string,
  userId: string,
): Promise<void> {
  const rows = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
    )
    .limit(1);
  if (rows.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: NOT_A_MEMBER });
  }
}

export interface Reconciliation {
  /** Branches where a student membership was created for them. */
  enrolled: string[];
  /**
   * Branches where they already have a membership that is NOT active. The
   * owner has to decide about each one; nothing here reactivates it (ADR 126).
   */
  needsDecision: { entityId: string; status: string }[];
}

/**
 * Give the person a membership at every covered branch that has none.
 *
 * An existing branch membership is left exactly as it stands, whatever its
 * role or status. Suspended, archived and removed all mean somebody decided
 * something, and a plan assignment must never quietly undo that decision. Those
 * branches come back in `needsDecision` so the owner sees the work waiting.
 */
async function enrolInCoveredBranches(
  db: TenantTx,
  organizationId: string,
  userId: string,
  entityIds: string[],
): Promise<Reconciliation> {
  if (entityIds.length === 0) return { enrolled: [], needsDecision: [] };

  const held = await db
    .select({
      entityId: entityMembership.entityId,
      status: entityMembership.status,
    })
    .from(entityMembership)
    .where(
      and(
        eq(entityMembership.userId, userId),
        inArray(entityMembership.entityId, entityIds),
      ),
    );
  const byEntity = new Map(held.map((h) => [h.entityId, h.status]));

  const missing = entityIds.filter((id) => !byEntity.has(id));
  if (missing.length > 0) {
    await db
      .insert(entityMembership)
      .values(
        missing.map((entityId) => ({
          organizationId,
          entityId,
          userId,
          role: "student",
          status: "active",
          joinedAt: new Date(),
        })),
      )
      // A concurrent assign, or a join that landed a moment ago, already made
      // the row. Theirs wins: this must never overwrite a status.
      .onConflictDoNothing();
  }

  return {
    enrolled: missing.sort(),
    needsDecision: held
      .filter((h) => h.status !== "active")
      .map((h) => ({ entityId: h.entityId, status: h.status }))
      .sort((a, b) => a.entityId.localeCompare(b.entityId)),
  };
}

/**
 * Move one membership to a new status. Suspending and cancelling both take
 * effect at once, at every branch the plan covers: grace is a payment
 * allowance, never a notice period (ADR 126).
 */
async function setAssignmentStatus(
  ctx: { db: TenantTx },
  id: string,
  status: "suspended" | "cancelled",
): Promise<{ id: string; status: string }> {
  const done = await ctx.db
    .update(accessAssignment)
    .set({ status })
    .where(eq(accessAssignment.id, id))
    .returning({ id: accessAssignment.id });
  if (done.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: ASSIGNMENT_NOT_FOUND });
  }
  return { id, status };
}

export const accessPlanRouter = {
  /** The whole catalog, archived plans included, with their coverage. */
  list: organizationManagerProcedure.query(async ({ ctx }) => {
    const plans = await ctx.db
      .select()
      .from(accessPlan)
      .orderBy(asc(accessPlan.name));
    const coverage = await ctx.db
      .select({
        planId: accessPlanEntity.planId,
        entityId: accessPlanEntity.entityId,
      })
      .from(accessPlanEntity);
    const holders = await ctx.db
      .select({
        planId: accessAssignment.planId,
        status: accessAssignment.status,
      })
      .from(accessAssignment);

    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      // Null until the owner prices it, which the setup checklist names and
      // activation readiness refuses to let past (ADR 128).
      priceMinor: p.priceMinor,
      currency: p.currency,
      archived: p.archivedAt !== null,
      entityIds: coverage
        .filter((c) => c.planId === p.id)
        .map((c) => c.entityId)
        .sort(),
      activeHolders: holders.filter(
        (h) => h.planId === p.id && h.status === "active",
      ).length,
    }));
  }),

  create: organizationManagerProcedure
    .input(CreateAccessPlanSchema)
    .mutation(async ({ ctx, input }) => {
      await requireOwnEntities(ctx.db, input.entityIds);
      const [made] = await ctx.db
        .insert(accessPlan)
        .values({
          organizationId: ctx.organizationId,
          name: input.name,
          description: input.description,
          priceMinor: input.priceMinor,
          currency: input.currency,
        })
        .returning({ id: accessPlan.id });
      if (!made) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not add the plan",
        });
      }
      if (input.entityIds.length > 0) {
        await ctx.db.insert(accessPlanEntity).values(
          input.entityIds.map((entityId) => ({
            organizationId: ctx.organizationId,
            planId: made.id,
            entityId,
          })),
        );
      }
      // A price given at creation applies from THIS month: nobody has been
      // billed on a plan that did not exist a moment ago, so there is no past
      // to protect. `canPriceFrom` guards later changes, not the first one.
      if (input.priceMinor !== undefined && input.currency) {
        const calendar = await membershipCalendar(ctx.db);
        await ctx.db.insert(accessPlanPrice).values({
          organizationId: ctx.organizationId,
          planId: made.id,
          effectiveMonth: monthOf(new Date(), calendar.timeZone),
          priceMinor: input.priceMinor,
          currency: input.currency,
          recordedBy: ctx.session.user.id,
        });
      }
      ctx.afterCommit(async (exec) => {
        const event = {
          organizationId: ctx.organizationId,
          actorRole: eventRole(ctx.orgMembership.role),
        };
        await recordMilestone({ ...event, name: "first_plan" }, exec);
        await recordActivity({ ...event, name: "staff_action" }, exec);
      });
      return { id: made.id };
    }),

  /**
   * Change what a plan costs, from a month the owner names (spec FP6).
   *
   * Two writes, one meaning: the plan carries what it costs from now on, and
   * `access_plan_price` records what it costs from that month, so a member
   * reading an old month still sees the amount they were actually asked for.
   *
   * The month must be a FUTURE one. `canPriceFrom` is the same rule the client
   * checks with, and the month it is measured against is the gym's own calendar
   * month, not the server's.
   */
  setPrice: organizationManagerProcedure
    .input(SetAccessPlanPriceSchema)
    .mutation(async ({ ctx, input }) => {
      const calendar = await membershipCalendar(ctx.db);
      if (
        !canPriceFrom(
          input.effectiveMonth,
          monthOf(new Date(), calendar.timeZone),
        )
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A price change starts from a month that has not begun yet",
        });
      }

      const [plan] = await ctx.db
        .select({ id: accessPlan.id })
        .from(accessPlan)
        .where(eq(accessPlan.id, input.id));
      if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No such plan" });
      }

      await ctx.db
        .insert(accessPlanPrice)
        .values({
          organizationId: ctx.organizationId,
          planId: input.id,
          effectiveMonth: input.effectiveMonth,
          priceMinor: input.priceMinor,
          currency: input.currency,
          recordedBy: ctx.session.user.id,
        })
        // Naming the same month twice is a correction, not a second price.
        .onConflictDoUpdate({
          target: [accessPlanPrice.planId, accessPlanPrice.effectiveMonth],
          set: {
            priceMinor: input.priceMinor,
            currency: input.currency,
            recordedBy: ctx.session.user.id,
          },
        });

      await ctx.db
        .update(accessPlan)
        .set({ priceMinor: input.priceMinor, currency: input.currency })
        .where(eq(accessPlan.id, input.id));

      return { ok: true as const };
    }),

  rename: organizationManagerProcedure
    .input(RenameAccessPlanSchema)
    .mutation(async ({ ctx, input }) => {
      await requireEditable(ctx.db, input.id);
      await ctx.db
        .update(accessPlan)
        .set({ name: input.name, description: input.description })
        .where(eq(accessPlan.id, input.id));
      return { ok: true as const };
    }),

  /**
   * Who a coverage edit would reach, before it is applied. A read, so the
   * screen can show the owner the damage and let them think again.
   */
  coveragePreview: organizationManagerProcedure
    .input(SetAccessPlanCoverageSchema)
    .query(async ({ ctx, input }) => {
      const plan = await loadPlan(ctx.db, input.id);
      return {
        before: await coverageOf(ctx.db, plan.id),
        after: [...input.entityIds].sort(),
        affected: await preview(ctx.db, plan.id, input.entityIds),
      };
    }),

  /**
   * Replace the branches this plan covers. The input is the whole list, not a
   * patch, so two owners editing at once cannot merge into a coverage neither
   * of them chose.
   *
   * Returns the same preview shape the query does, describing what it just did:
   * the caller sees the branches each person gained, and the ones they lost
   * with nothing else of theirs covering them. Reconciling the gained branches
   * into real branch memberships is the assignment API's job (step 3.6), and
   * this deliberately does not do it behind the owner's back.
   */
  setCoverage: organizationManagerProcedure
    .input(SetAccessPlanCoverageSchema)
    .mutation(async ({ ctx, input }) => {
      const plan = await requireEditable(ctx.db, input.id);
      await requireOwnEntities(ctx.db, input.entityIds);

      const before = await coverageOf(ctx.db, plan.id);
      const affected = await preview(ctx.db, plan.id, input.entityIds);
      const next = new Set(input.entityIds);
      const gone = before.filter((id) => !next.has(id));
      const added = input.entityIds.filter((id) => !before.includes(id));

      if (gone.length > 0) {
        await ctx.db
          .delete(accessPlanEntity)
          .where(
            and(
              eq(accessPlanEntity.planId, plan.id),
              inArray(accessPlanEntity.entityId, gone),
            ),
          );
      }
      if (added.length > 0) {
        await ctx.db.insert(accessPlanEntity).values(
          added.map((entityId) => ({
            organizationId: ctx.organizationId,
            planId: plan.id,
            entityId,
          })),
        );
      }
      // Touch the plan so an edit that only moved coverage still shows a date.
      await ctx.db
        .update(accessPlan)
        .set({ updatedAt: new Date() })
        .where(eq(accessPlan.id, plan.id));

      return { before, after: [...input.entityIds].sort(), affected };
    }),

  /**
   * Archive stops new assignments and freezes the plan. It takes nobody's
   * access away: the assignments that exist keep the coverage they have until
   * someone ends them one by one.
   */
  archive: organizationManagerProcedure
    .input(ArchiveAccessPlanSchema)
    .mutation(async ({ ctx, input }) => {
      await loadPlan(ctx.db, input.id);
      await ctx.db
        .update(accessPlan)
        .set({ archivedAt: input.archived ? new Date() : null })
        .where(eq(accessPlan.id, input.id));
      return { archived: input.archived };
    }),

  /**
   * Give a person a membership, or find the one they already hold.
   *
   * The assignment belongs to the ORGANIZATION and is stored once, however many
   * branches the plan covers and whichever branch the owner was standing in.
   * So assigning the same plan again from another branch returns the existing
   * row rather than making a second: `created` says which happened, and the
   * screen can say "they already have this" instead of quietly duplicating.
   *
   * A membership that was suspended or cancelled comes back active, because
   * assigning it again IS the owner's explicit decision to restore it. Branch
   * memberships get no such treatment (see `enrolInCoveredBranches`).
   */
  assign: organizationManagerProcedure
    .input(AssignMembershipSchema)
    .mutation(async ({ ctx, input }) => {
      const done = await assignOne(ctx, input);
      recordFirstAssignment(ctx);
      return done;
    }),

  /**
   * Give the same membership to several people at once (ADR 128, spec FP8).
   *
   * One person at a time through `assignOne`, so a bulk run and a single click
   * cannot drift about what assigning means: the same restore rule, the same
   * branch enrolment, the same refusal on a closed plan.
   *
   * **It does not stop at the first failure.** A run of forty where one person
   * has left the gym should place the other thirty-nine and say who was
   * missed, because the alternative is an owner guessing how far it got. Each
   * outcome comes back named, and the caller decides what to show.
   */
  assignMany: organizationManagerProcedure
    .input(BulkAssignMembershipSchema)
    .mutation(async ({ ctx, input }) => {
      const results: {
        userId: string;
        outcome: "created" | "restored" | "already" | "failed";
        reason?: string;
      }[] = [];

      for (const userId of input.userIds) {
        try {
          const done = await assignOne(ctx, {
            userId,
            planId: input.planId,
            startMonth: input.startMonth,
            assigningEntityId: null,
          });
          results.push({
            userId,
            outcome: done.created
              ? "created"
              : done.restored
                ? "restored"
                : "already",
          });
        } catch (error) {
          results.push({
            userId,
            outcome: "failed",
            reason:
              error instanceof TRPCError ? error.message : "Could not add it",
          });
        }
      }

      const placed = results.filter((r) => r.outcome !== "failed").length;
      if (placed > 0) recordFirstAssignment(ctx);
      return {
        results,
        placed,
        failed: results.filter((r) => r.outcome === "failed").length,
      };
    }),

  /**
   * Re-enrol every holder of one plan at every branch it covers (spec FP8).
   *
   * Coverage can change after people are already on a plan: a gym adds a new
   * mat to "Full access" and forty existing members have no membership there.
   * Assignment enrols at the coverage of the moment, so something has to close
   * that gap afterwards, and this is it.
   *
   * **Repeatable by construction.** It reads the state each time and enrols
   * only what is missing, with `onConflictDoNothing` underneath, so running it
   * twice does nothing the second time and running it after a partial failure
   * finishes the job. That is why it is a button an owner can press again
   * rather than a one-shot job that has to succeed.
   *
   * One person's failure does not stop the rest: the run reports who could not
   * be updated **by name**, because an owner cannot chase a count.
   */
  reconcile: organizationManagerProcedure
    .input(AccessPlanIdSchema)
    .mutation(async ({ ctx, input }) => {
      const plan = await loadPlan(ctx.db, input.id);
      const entityIds = await coverageOf(ctx.db, plan.id);

      const holders = await ctx.db
        .select({
          userId: accessAssignment.userId,
          name: user.name,
        })
        .from(accessAssignment)
        .innerJoin(user, eq(user.id, accessAssignment.userId))
        .where(
          and(
            eq(accessAssignment.planId, plan.id),
            eq(accessAssignment.status, "active"),
          ),
        );

      const enrolled: { userId: string; name: string; entityIds: string[] }[] =
        [];
      const needsDecision: {
        userId: string;
        name: string;
        entityId: string;
        status: string;
      }[] = [];
      const failed: { userId: string; name: string; reason: string }[] = [];

      for (const holder of holders) {
        try {
          const done = await enrolInCoveredBranches(
            ctx.db,
            ctx.organizationId,
            holder.userId,
            entityIds,
          );
          if (done.enrolled.length > 0) {
            enrolled.push({ ...holder, entityIds: done.enrolled });
          }
          for (const d of done.needsDecision) {
            needsDecision.push({ ...holder, ...d });
          }
        } catch (error) {
          failed.push({
            ...holder,
            reason:
              error instanceof Error ? error.message : "Could not update them",
          });
        }
      }

      return {
        checked: holders.length,
        enrolled,
        needsDecision,
        failed,
      };
    }),

  /**
   * Everybody a membership should cover and does not, branch by branch
   * (ADR 128, spec FP8).
   *
   * This is the work queue behind activation: a branch cannot be switched onto
   * memberships while active members hold nothing, so an owner needs the names
   * rather than a count. Only branches that already RUN on memberships are
   * asked, because at one still on branch dues the question has no meaning.
   *
   * Coverage comes from `loadRosterStanding`, the same rule the booking gate
   * and the activation preview run, so this queue and the gate cannot disagree
   * about who is covered.
   */
  uncovered: organizationManagerIdentityProcedure.query(async ({ ctx }) => {
    const branches = await readOrganizationEntities(
      ctx.organizationId,
      ctx.baseDb,
    );
    const now = new Date();
    const groups: {
      entityId: string;
      entityName: string;
      people: { userId: string; name: string }[];
    }[] = [];

    for (const branch of branches) {
      if (!branch.membershipEnforcedAt) continue;
      const people = await withScope(
        { organizationId: ctx.organizationId, entityId: branch.id },
        async (db) => {
          const active = (await rosterOf({ academyId: branch.id, db })).filter(
            (m) => m.status === "active",
          );
          if (active.length === 0) return [];
          const standing = await loadRosterStanding(db, {
            entityId: branch.id,
            people: active.map((m) => ({
              userId: m.userId,
              status: m.status,
            })),
            now,
          });
          return active
            .filter((m) => !standing.get(m.userId)?.covered)
            .map((m) => ({ userId: m.userId, name: m.name }));
        },
        ctx.baseDb,
      );

      if (people.length > 0) {
        groups.push({
          entityId: branch.id,
          entityName: branch.name,
          people,
        });
      }
    }

    return {
      groups,
      total: groups.reduce((n, g) => n + g.people.length, 0),
    };
  }),

  /**
   * Who is on one branch's LEGACY dues plan (ADR 128, spec FP8).
   *
   * The migration question in the owner's own words: "everybody who was on the
   * old Adults plan at the mat should go onto the new one." Reading it is the
   * only way to answer that without them ticking forty boxes from memory.
   *
   * Entity-scoped on purpose: `member_dues` and `membership_plan` are branch
   * tables, so this opens ONE branch's scope rather than widening anything, and
   * refuses a branch outside the caller's gym before it opens.
   */
  legacyPlanMembers: organizationManagerIdentityProcedure
    .input(LegacyPlanMembersSchema)
    .query(async ({ ctx, input }) => {
      const branch = await getEntityInOrganization(
        input.entityId,
        ctx.organizationId,
        ctx.baseDb,
      );
      if (!branch) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your branch" });
      }

      return withScope(
        { organizationId: ctx.organizationId, entityId: branch.id },
        async (db) => {
          const plans = await db
            .select({
              id: membershipPlan.id,
              name: membershipPlan.name,
              priceMinor: membershipPlan.priceMinor,
              currency: membershipPlan.currency,
            })
            .from(membershipPlan)
            .where(isNull(membershipPlan.deletedAt));

          const rows = await db
            .select({
              userId: entityMembership.userId,
              planId: memberDues.planId,
            })
            .from(memberDues)
            .innerJoin(
              entityMembership,
              eq(entityMembership.id, memberDues.memberId),
            )
            .where(eq(entityMembership.status, "active"));

          return {
            plans,
            members: input.planId
              ? rows.filter((r) => r.planId === input.planId)
              : rows,
          };
        },
        ctx.baseDb,
      );
    }),

  /**
   * Pause one membership. It stops covering every branch it covered at once,
   * because it is one record. Another membership of theirs still covers what
   * it covers, which is the union rule in `coveredEntities`.
   */
  suspend: organizationManagerProcedure
    .input(AssignmentIdSchema)
    .mutation(({ ctx, input }) =>
      setAssignmentStatus(ctx, input.id, "suspended"),
    ),

  /** End one membership. Branch memberships, history and bookings all stay. */
  cancel: organizationManagerProcedure
    .input(AssignmentIdSchema)
    .mutation(({ ctx, input }) =>
      setAssignmentStatus(ctx, input.id, "cancelled"),
    ),

  /** Every membership one person holds in this organization. */
  forUser: organizationManagerProcedure
    .input(MemberAssignmentsSchema)
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: accessAssignment.id,
          planId: accessAssignment.planId,
          planName: accessPlan.name,
          archived: accessPlan.archivedAt,
          status: accessAssignment.status,
          startMonth: accessAssignment.startMonth,
          assigningEntityId: accessAssignment.assigningEntityId,
        })
        .from(accessAssignment)
        .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
        .where(eq(accessAssignment.userId, input.userId))
        .orderBy(asc(accessPlan.name));

      const coverage = await ctx.db
        .select({
          planId: accessPlanEntity.planId,
          entityId: accessPlanEntity.entityId,
        })
        .from(accessPlanEntity);

      const calendar = await membershipCalendar(ctx.db);
      const standing = await membershipStanding(
        ctx.db,
        input.userId,
        new Date(),
      );

      return rows.map((r) => {
        const now = standing.find((m) => m.assignmentId === r.id);
        return {
          id: r.id,
          planId: r.planId,
          planName: r.planName,
          planArchived: r.archived !== null,
          status: r.status,
          startMonth: r.startMonth,
          assigningEntityId: r.assigningEntityId,
          entityIds: coverage
            .filter((c) => c.planId === r.planId)
            .map((c) => c.entityId)
            .sort(),
          month: now?.month ?? null,
          monthLabel: now ? formatMonth(now.month, calendar.timeZone) : null,
          paid: now?.paid ?? false,
          amount: now?.amount ?? null,
        };
      });
    }),

  /**
   * Tick one month of one shared membership paid or unpaid.
   *
   * ONE record per membership per month, never one per covered branch: a
   * membership covering a mat and a gym is paid once, so marking it from either
   * branch reaches the same row.
   *
   * Idempotent. Marking a month paid twice writes the row once and reports
   * `changed: false` the second time, so a double click, a retry and a stale
   * form all land on the same state. Only a real change writes an audit row,
   * which is what keeps the history readable: it says what was corrected, not
   * how many times somebody pressed the button.
   */
  markMonth: organizationManagerProcedure
    .input(MarkMembershipMonthSchema)
    .mutation(async ({ ctx, input }) => {
      const [assignment] = await ctx.db
        .select({ id: accessAssignment.id })
        .from(accessAssignment)
        .where(eq(accessAssignment.id, input.assignmentId));
      if (!assignment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: ASSIGNMENT_NOT_FOUND,
        });
      }

      const [held] = await ctx.db
        .select({ paid: membershipMonth.paid })
        .from(membershipMonth)
        .where(
          and(
            eq(membershipMonth.assignmentId, input.assignmentId),
            eq(membershipMonth.month, input.month),
          ),
        );
      const wasPaid = held?.paid ?? null;
      if (wasPaid === input.paid) {
        return { changed: false, paid: input.paid };
      }

      const now = new Date();
      await ctx.db
        .insert(membershipMonth)
        .values({
          organizationId: ctx.organizationId,
          assignmentId: input.assignmentId,
          month: input.month,
          paid: input.paid,
          recordedBy: ctx.session.user.id,
          recordedAt: now,
          claimedAt: null,
        })
        .onConflictDoUpdate({
          target: [membershipMonth.assignmentId, membershipMonth.month],
          set: {
            paid: input.paid,
            recordedBy: ctx.session.user.id,
            recordedAt: now,
            // Answering a claim closes it, whichever way the answer goes: a
            // month corrected back to unpaid has no claim left to restore.
            claimedAt: null,
          },
        });

      await ctx.db.insert(membershipMonthAudit).values({
        organizationId: ctx.organizationId,
        assignmentId: input.assignmentId,
        month: input.month,
        wasPaid,
        paid: input.paid,
        actorId: ctx.session.user.id,
      });

      return { changed: true, paid: input.paid };
    }),

  /**
   * Every active membership this month, so the owner can tick a batch of them.
   *
   * The same record the member profile ticks, read the other way round: the
   * profile answers "did this person pay", the board answers "who has not". An
   * owner confirming a month works from a bank statement, one pass, so making
   * them walk to each branch and open each person would be the wrong shape for
   * the job.
   *
   * A month with no row is unpaid, and nothing here writes one to tidy the
   * list up.
   */
  monthBoard: organizationManagerProcedure.query(async ({ ctx }) => {
    const calendar = await membershipCalendar(ctx.db);
    const month = monthOf(new Date(), calendar.timeZone);

    const held = await ctx.db
      .select({
        id: accessAssignment.id,
        userId: accessAssignment.userId,
        name: user.name,
        email: user.email,
        planId: accessAssignment.planId,
        planName: accessPlan.name,
        startMonth: accessAssignment.startMonth,
        createdAt: accessAssignment.createdAt,
      })
      .from(accessAssignment)
      .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
      .innerJoin(user, eq(user.id, accessAssignment.userId))
      .where(eq(accessAssignment.status, "active"))
      .orderBy(asc(user.name));

    const coverage = held.length
      ? await ctx.db
          .select({
            planId: accessPlanEntity.planId,
            entityId: accessPlanEntity.entityId,
          })
          .from(accessPlanEntity)
      : [];
    const months = held.length
      ? await ctx.db
          .select({
            assignmentId: membershipMonth.assignmentId,
            paid: membershipMonth.paid,
          })
          .from(membershipMonth)
          .where(
            and(
              inArray(
                membershipMonth.assignmentId,
                held.map((a) => a.id),
              ),
              eq(membershipMonth.month, month),
            ),
          )
      : [];

    const prices = held.length
      ? await ctx.db
          .select({
            planId: accessPlanPrice.planId,
            effectiveMonth: accessPlanPrice.effectiveMonth,
            priceMinor: accessPlanPrice.priceMinor,
            currency: accessPlanPrice.currency,
          })
          .from(accessPlanPrice)
      : [];

    const rows = held.map((a) => {
      const deadline = payDeadline({
        month,
        startMonth: a.startMonth,
        joinedOn: a.createdAt.toISOString().slice(0, 10),
        policy: calendar,
      });
      return {
        assignmentId: a.id,
        userId: a.userId,
        name: a.name,
        email: a.email,
        planName: a.planName,
        entityIds: coverage
          .filter((c) => c.planId === a.planId)
          .map((c) => c.entityId)
          .sort(),
        paid: months.find((m) => m.assignmentId === a.id)?.paid ?? false,
        // What THIS month cost, which a later price change must not rewrite.
        amount: priceForMonth(
          prices.filter((p) => p.planId === a.planId),
          month,
        ),
        deadline,
        deadlineLabel: formatDeadline(deadline, calendar.timeZone),
        overdue: deadline.getTime() <= Date.now(),
      };
    });

    return {
      month,
      monthLabel: formatMonth(month, calendar.timeZone),
      timeZone: calendar.timeZone,
      paidCount: rows.filter((r) => r.paid).length,
      // Plans an owner has not priced yet. Named rather than counted into a
      // total, because a missing price is a gap to fix and not a zero.
      unpriced: rows.filter((r) => r.amount === null).length,
      rows,
    };
  }),

  /**
   * The months recorded against one membership, newest first.
   *
   * A month that is NOT here is unpaid: the tracker is ticked by hand and a gap
   * in it must never read as a yes (ADR 126).
   */
  months: organizationManagerProcedure
    .input(MembershipMonthsSchema)
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          month: membershipMonth.month,
          paid: membershipMonth.paid,
          recordedAt: membershipMonth.recordedAt,
          recordedBy: membershipMonth.recordedBy,
        })
        .from(membershipMonth)
        .where(eq(membershipMonth.assignmentId, input.assignmentId))
        .orderBy(desc(membershipMonth.month));
      if (rows.length === 0) return [];

      // History reads what each month cost AT THE TIME. Resolving it here is
      // what stops a price rise in March from rewriting February's line.
      const [held] = await ctx.db
        .select({ planId: accessAssignment.planId })
        .from(accessAssignment)
        .where(eq(accessAssignment.id, input.assignmentId));
      const prices = held
        ? await ctx.db
            .select({
              effectiveMonth: accessPlanPrice.effectiveMonth,
              priceMinor: accessPlanPrice.priceMinor,
              currency: accessPlanPrice.currency,
            })
            .from(accessPlanPrice)
            .where(eq(accessPlanPrice.planId, held.planId))
        : [];

      return rows.map((r) => ({
        ...r,
        amount: priceForMonth(prices, r.month),
      }));
    }),

  /**
   * The organization's membership settings, with sane answers before anybody
   * has opened the screen.
   *
   * `calendarTimeZone` is null until the owner picks one, so `effective` is
   * what the deadlines are actually counted in: their choice, else the default
   * branch's own zone, else UTC. `suggested` is what the form offers, which is
   * the same branch zone, so opening the screen and saving changes nothing.
   */
  policy: organizationManagerProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({
        graceDays: membershipPolicy.graceDays,
        calendarTimeZone: membershipPolicy.calendarTimeZone,
        bankDetails: membershipPolicy.bankDetails,
      })
      .from(membershipPolicy);
    const [home] = await ctx.db
      .select({ timeZone: entity.timeZone })
      .from(entity)
      .where(and(eq(entity.isDefault, true), isNull(entity.deletedAt)))
      .limit(1);

    const suggested = resolveAcademyTimeZone(home?.timeZone);
    return {
      graceDays: row?.graceDays ?? DEFAULT_MEMBERSHIP_GRACE_DAYS,
      calendarTimeZone: row?.calendarTimeZone ?? null,
      bankDetails: row?.bankDetails ?? "",
      suggested,
      effective: row?.calendarTimeZone ?? suggested,
    };
  }),

  /**
   * Save them. Creates the row the first time, so nothing has to seed it.
   *
   * A REPLACE, not a patch: every field is written on every call, which is why
   * one form on the Settings screen carries all of them. Two forms writing this
   * would blank each other's field (ADR 127).
   */
  setPolicy: organizationManagerProcedure
    .input(MembershipPolicySchema)
    .mutation(async ({ ctx, input }) => {
      const next = {
        graceDays: input.graceDays,
        calendarTimeZone: input.calendarTimeZone ?? null,
        bankDetails: input.bankDetails,
      };
      await ctx.db
        .insert(membershipPolicy)
        .values({ organizationId: ctx.organizationId, ...next })
        .onConflictDoUpdate({
          target: membershipPolicy.organizationId,
          set: next,
        });
      return { ok: true as const };
    }),

  /**
   * A member says they sent the transfer for the month they are being judged on.
   *
   * The server picks the month, never the caller: it is `monthOf(now)` in the
   * organization's own calendar zone, which is the same month `mine` shows them,
   * join month included. A claim that could name a month would need a rule about
   * which months are claimable, and that rule would be a second opinion about
   * something `membershipStanding` already decides.
   *
   * Idempotent: a second press finds the claim and reports `claimed: false`.
   */
  claimMonth: enrolledProcedure
    .input(ClaimMembershipMonthSchema)
    .mutation(async ({ ctx, input }) => {
      // The user-id filter is the guard, not decoration: RLS scopes this table
      // to the organization, so another member's assignment is visible through
      // the policy alone and only this makes it unreachable (ADR 126 §8).
      const [assignment] = await ctx.db
        .select({
          id: accessAssignment.id,
          status: accessAssignment.status,
        })
        .from(accessAssignment)
        .where(
          and(
            eq(accessAssignment.id, input.assignmentId),
            eq(accessAssignment.userId, ctx.session.user.id),
          ),
        );
      if (!assignment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: ASSIGNMENT_NOT_FOUND,
        });
      }
      if (assignment.status !== "active") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: MEMBERSHIP_NOT_ACTIVE,
        });
      }

      const calendar = await membershipCalendar(ctx.db);
      const month = monthOf(new Date(), calendar.timeZone);
      const [held] = await ctx.db
        .select({
          paid: membershipMonth.paid,
          claimedAt: membershipMonth.claimedAt,
        })
        .from(membershipMonth)
        .where(
          and(
            eq(membershipMonth.assignmentId, input.assignmentId),
            eq(membershipMonth.month, month),
          ),
        );
      if (held && !canClaimMonth(held)) return { claimed: false, month };

      const now = new Date();
      await ctx.db
        .insert(membershipMonth)
        .values({
          organizationId: ctx.organizationId,
          assignmentId: input.assignmentId,
          month,
          paid: false,
          claimedAt: now,
        })
        .onConflictDoUpdate({
          target: [membershipMonth.assignmentId, membershipMonth.month],
          // Never touches `paid`. A claim is a message, not a payment.
          set: { claimedAt: now },
        });
      return { claimed: true, month };
    }),

  /**
   * Claims waiting for the owner, oldest first, because the queue is a to-do
   * list rather than a feed.
   */
  claims: organizationManagerProcedure.query(async ({ ctx }) => {
    const calendar = await membershipCalendar(ctx.db);
    const rows = await ctx.db
      .select({
        assignmentId: membershipMonth.assignmentId,
        month: membershipMonth.month,
        claimedAt: membershipMonth.claimedAt,
        userId: accessAssignment.userId,
        name: user.name,
        email: user.email,
        planName: accessPlan.name,
      })
      .from(membershipMonth)
      .innerJoin(
        accessAssignment,
        eq(accessAssignment.id, membershipMonth.assignmentId),
      )
      .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
      .innerJoin(user, eq(user.id, accessAssignment.userId))
      .where(
        and(
          isNotNull(membershipMonth.claimedAt),
          eq(membershipMonth.paid, false),
        ),
      )
      .orderBy(asc(membershipMonth.claimedAt));
    return rows.map((r) => ({
      ...r,
      monthLabel: formatMonth(r.month, calendar.timeZone),
    }));
  }),

  /**
   * Clear a claim without marking the month paid. No audit row: the audit is
   * the history of the paid flag, and a rejection does not change it. The
   * member may claim again.
   */
  rejectClaim: organizationManagerProcedure
    .input(RejectMembershipClaimSchema)
    .mutation(async ({ ctx, input }) => {
      const cleared = await ctx.db
        .update(membershipMonth)
        .set({ claimedAt: null })
        .where(
          and(
            eq(membershipMonth.assignmentId, input.assignmentId),
            eq(membershipMonth.month, input.month),
            isNotNull(membershipMonth.claimedAt),
          ),
        )
        .returning({ id: membershipMonth.id });
      return { cleared: cleared.length > 0 };
    }),

  /**
   * Where the signed-in person stands on their own memberships.
   *
   * Enrolled tier, so both clients call the same thing and cannot drift, and a
   * pending member can see what they will owe. One row per membership, never
   * one per covered branch: somebody covered at a mat and a gym is warned once.
   */
  mine: enrolledProcedure.query(async ({ ctx }) => {
    const memberships = await membershipStanding(
      ctx.db,
      ctx.session.user.id,
      new Date(),
    );
    return {
      bankDetails: await membershipBankDetails(ctx.db),
      // The reference is derived here and never stored, the way ADR 40's
      // already is: it survives a rename and cannot go stale.
      memberships: memberships.map((m) => ({
        ...m,
        reference: paymentReference(ctx.session.user.name, m.assignmentId),
      })),
    };
  }),

  /** One plan with its coverage, for the edit form. */
  get: organizationManagerProcedure
    .input(AccessPlanIdSchema)
    .query(async ({ ctx, input }) => {
      const plan = await loadPlan(ctx.db, input.id);
      return {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        archived: plan.archivedAt !== null,
        entityIds: await coverageOf(ctx.db, plan.id),
      };
    }),
} satisfies TRPCRouterRecord;
