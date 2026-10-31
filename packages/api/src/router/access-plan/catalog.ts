import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { TenantTx } from "@matops/db";
import type { AssignmentCoverage } from "@matops/domain";
import {
  and,
  asc,
  eq,
  eventRole,
  inArray,
  isNull,
  recordActivity,
  recordMilestone,
} from "@matops/db";
import {
  accessAssignment,
  accessPlan,
  accessPlanEntity,
  accessPlanMethodOff,
  accessPlanPrice,
  entity,
  entityMembership,
  paymentMethod,
  person,
} from "@matops/db/schema";
import {
  affectedByCoverageChange,
  canEditPlan,
  canPriceFrom,
  isOwner,
  monthOf,
  rowForMonth,
} from "@matops/domain";
import {
  ArchiveAccessPlanSchema,
  CreateAccessPlanSchema,
  SetAccessPlanCoverageSchema,
  SetAccessPlanPriceSchema,
  SetPlanMethodSchema,
  SetPlanPaymentLinkSchema,
  SetPlanStaffOnlySchema,
} from "@matops/validators";

import type { PlanReconciliation, PlanRow } from "./shared";
import { loadStaffAccess } from "../../membership-access";
import {
  assignmentAppliesInMonth,
  membershipCalendar,
} from "../../membership-status";
import {
  organizationManagerProcedure,
  organizationOwnerProcedure,
} from "../../trpc";
import {
  coverageOf,
  currentMonthOf,
  loadPlan,
  pendingChanges,
  reconcilePlanHolders,
  reconciliationIncomplete,
} from "./shared";

const PLAN_FROZEN = "An archived plan cannot be changed. Restore it first.";

const UNKNOWN_BRANCH = "One of those branches is not yours";

const TARGET_ARCHIVED_DEPENDENCY =
  "A scheduled plan change still points at this plan. Cancel that change first.";

const COVERAGE_MOVED =
  "Somebody changed this plan's branches while you were looking. Check the list again and save.";

/**
 * What the caller last saw the plan's coverage as (ADR 129). Every coverage
 * edit touches `updated_at`, so the timestamp IS the version: a preview carries
 * it and the save refuses a list computed against an older one.
 */
function coverageVersion(plan: Pick<PlanRow, "updatedAt">): string {
  return plan.updatedAt.toISOString();
}

/** Archived is frozen, not merely hidden: no rename, no coverage change. */
async function requireEditable(
  db: TenantTx,
  id: string,
  opts?: { lock?: boolean },
): Promise<PlanRow> {
  const plan = await loadPlan(db, id, opts);
  if (!canEditPlan({ id: plan.id, archived: plan.archivedAt !== null })) {
    throw new TRPCError({ code: "CONFLICT", message: PLAN_FROZEN });
  }
  return plan;
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
async function assignmentCoverage(
  db: TenantTx,
  month: string,
): Promise<AssignmentCoverage[]> {
  const rows = await db
    .select({
      id: accessAssignment.id,
      userId: accessAssignment.personId,
      accountUserId: person.accountUserId,
      planId: accessAssignment.planId,
      status: accessAssignment.status,
      entityId: accessPlanEntity.entityId,
    })
    .from(accessAssignment)
    .innerJoin(person, eq(person.id, accessAssignment.personId))
    .leftJoin(
      accessPlanEntity,
      eq(accessPlanEntity.planId, accessAssignment.planId),
    )
    // An ended period still reads `active`, so status alone would let a
    // membership nobody holds any more hide a real loss of coverage (ADR 129).
    .where(assignmentAppliesInMonth(month));

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
  const { month } = await currentMonthOf(db);
  const affected = affectedByCoverageChange(
    planId,
    next,
    await assignmentCoverage(db, month),
  );
  const staff = await loadStaffAccess(db, {
    entityIds: [...new Set(affected.flatMap((a) => [...a.gains, ...a.loses]))],
    userIds: [...new Set(affected.map((a) => a.userId))],
  });
  return affected
    .map((a) => ({
      ...a,
      gains: a.gains.filter((id) => !staff.get(id)?.has(a.userId)),
      loses: a.loses.filter((id) => !staff.get(id)?.has(a.userId)),
    }))
    .filter((a) => a.gains.length > 0 || a.loses.length > 0);
}

const EMPTY_RECONCILIATION: PlanReconciliation = {
  checked: 0,
  enrolled: [],
  needsDecision: [],
  failed: [],
};

/**
 * Coverage work still waiting, per plan (ADR 129).
 *
 * `missing` is a live holder with no branch membership at a branch their plan
 * covers, which a retry can fix. `needsDecision` is one who holds a row that is
 * not active there, which only a person can settle. Derived from current state,
 * so a reload shows the same answer and nothing has to be remembered.
 */
async function coverageGaps(
  db: TenantTx,
): Promise<Map<string, { missing: number; needsDecision: number }>> {
  const { month } = await currentMonthOf(db);
  const rows = await db
    .select({
      planId: accessAssignment.planId,
      entityId: accessPlanEntity.entityId,
      status: entityMembership.status,
    })
    .from(accessAssignment)
    .innerJoin(
      accessPlanEntity,
      eq(accessPlanEntity.planId, accessAssignment.planId),
    )
    .leftJoin(
      entityMembership,
      and(
        eq(entityMembership.personId, accessAssignment.personId),
        eq(entityMembership.entityId, accessPlanEntity.entityId),
      ),
    )
    .where(
      and(
        eq(accessAssignment.status, "active"),
        assignmentAppliesInMonth(month),
      ),
    );

  const byPlan = new Map<string, { missing: number; needsDecision: number }>();
  for (const r of rows) {
    const held = byPlan.get(r.planId) ?? { missing: 0, needsDecision: 0 };
    if (r.status === null) held.missing += 1;
    else if (r.status !== "active") held.needsDecision += 1;
    byPlan.set(r.planId, held);
  }
  return byPlan;
}

export const planCatalogProcedures = {
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
    const gaps = await coverageGaps(ctx.db);
    const { month } = await currentMonthOf(ctx.db);
    const prices = await ctx.db
      .select({
        planId: accessPlanPrice.planId,
        effectiveMonth: accessPlanPrice.effectiveMonth,
        priceMinor: accessPlanPrice.priceMinor,
        currency: accessPlanPrice.currency,
        paymentLinkUrl: accessPlanPrice.paymentLinkUrl,
      })
      .from(accessPlanPrice);
    const methodsOff = await ctx.db
      .select({
        planId: accessPlanMethodOff.planId,
        methodId: accessPlanMethodOff.paymentMethodId,
      })
      .from(accessPlanMethodOff);

    return plans.map((p) => {
      const current = rowForMonth(
        prices.filter((row) => row.planId === p.id),
        month,
      );
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        paymentLinkUrl: current?.paymentLinkUrl ?? null,
        currentAmount: current
          ? { priceMinor: current.priceMinor, currency: current.currency }
          : null,
        // Null until the owner prices it, which the setup checklist names and
        // activation readiness refuses to let past (ADR 128).
        priceMinor: p.priceMinor,
        currency: p.currency,
        archived: p.archivedAt !== null,
        staffOnly: p.staffOnly,
        methodsOff: methodsOff
          .filter((o) => o.planId === p.id)
          .map((o) => o.methodId),
        entityIds: coverage
          .filter((c) => c.planId === p.id)
          .map((c) => c.entityId)
          .sort(),
        activeHolders: holders.filter(
          (h) => h.planId === p.id && h.status === "active",
        ).length,
        gaps: gaps.get(p.id) ?? { missing: 0, needsDecision: 0 },
      };
    });
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
          message: "Couldn't add the plan. Try again.",
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
      if (input.paymentLinkUrl != null && !isOwner(ctx.orgMembership)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the owner can add a payment link.",
        });
      }
      const calendar = await membershipCalendar(ctx.db);
      const month = monthOf(new Date(), calendar.timeZone);

      const [plan] = await ctx.db
        .select({ id: accessPlan.id })
        .from(accessPlan)
        .where(eq(accessPlan.id, input.id));
      if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No such plan" });
      }

      // A plan that has never carried a price may take its FIRST one from this
      // month, for the reason `create` gives: nobody has been asked for an
      // amount on it, so there is no past to protect. Every later change starts
      // from a month that has not begun.
      const [priced] = await ctx.db
        .select({ id: accessPlanPrice.id })
        .from(accessPlanPrice)
        .where(eq(accessPlanPrice.planId, input.id))
        .limit(1);
      const first = priced === undefined;
      if (
        !canPriceFrom(input.effectiveMonth, month) &&
        !(first && input.effectiveMonth === month)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A price change starts from a month that has not begun yet",
        });
      }

      await ctx.db
        .insert(accessPlanPrice)
        .values({
          organizationId: ctx.organizationId,
          planId: input.id,
          effectiveMonth: input.effectiveMonth,
          priceMinor: input.priceMinor,
          currency: input.currency,
          paymentLinkUrl: input.paymentLinkUrl ?? null,
          recordedBy: ctx.session.user.id,
        })
        // Naming the same month twice is a correction, not a second price.
        .onConflictDoUpdate({
          target: [accessPlanPrice.planId, accessPlanPrice.effectiveMonth],
          set: {
            priceMinor: input.priceMinor,
            currency: input.currency,
            ...(input.paymentLinkUrl !== undefined && {
              paymentLinkUrl: input.paymentLinkUrl,
            }),
            recordedBy: ctx.session.user.id,
          },
        });

      await ctx.db
        .update(accessPlan)
        .set({ priceMinor: input.priceMinor, currency: input.currency })
        .where(eq(accessPlan.id, input.id));

      return { ok: true as const };
    }),

  /**
   * The gym's own Stripe payment link for the price in effect this month
   * (ADR 156). A future price takes its link from `setPrice`, so a member is
   * never sent to the amount of a month that has not started.
   */
  setPaymentLink: organizationOwnerProcedure
    .input(SetPlanPaymentLinkSchema)
    .mutation(async ({ ctx, input }) => {
      const { month } = await currentMonthOf(ctx.db);
      const rows = await ctx.db
        .select({
          id: accessPlanPrice.id,
          effectiveMonth: accessPlanPrice.effectiveMonth,
        })
        .from(accessPlanPrice)
        .where(eq(accessPlanPrice.planId, input.planId));
      const current = rowForMonth(rows, month);
      if (!current) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Set a price for this plan first.",
        });
      }
      await ctx.db
        .update(accessPlanPrice)
        .set({ paymentLinkUrl: input.paymentLinkUrl })
        .where(eq(accessPlanPrice.id, current.id));
      return { ok: true as const };
    }),

  setStaffOnly: organizationManagerProcedure
    .input(SetPlanStaffOnlySchema)
    .mutation(async ({ ctx, input }) => {
      await loadPlan(ctx.db, input.planId);
      await ctx.db
        .update(accessPlan)
        .set({ staffOnly: input.staffOnly })
        .where(eq(accessPlan.id, input.planId));
      return { ok: true as const };
    }),

  setPlanMethod: organizationOwnerProcedure
    .input(SetPlanMethodSchema)
    .mutation(async ({ ctx, input }) => {
      await loadPlan(ctx.db, input.planId);
      const [method] = await ctx.db
        .select({ id: paymentMethod.id })
        .from(paymentMethod)
        .where(eq(paymentMethod.id, input.methodId));
      if (!method) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That way to pay is gone. Refresh and try again.",
        });
      }
      const match = and(
        eq(accessPlanMethodOff.planId, input.planId),
        eq(accessPlanMethodOff.paymentMethodId, input.methodId),
      );
      if (input.on) {
        await ctx.db.delete(accessPlanMethodOff).where(match);
      } else {
        await ctx.db
          .insert(accessPlanMethodOff)
          .values({
            organizationId: ctx.organizationId,
            planId: input.planId,
            paymentMethodId: input.methodId,
          })
          .onConflictDoNothing();
      }
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
        version: coverageVersion(plan),
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
      const plan = await requireEditable(ctx.db, input.id, { lock: true });
      await requireOwnEntities(ctx.db, input.entityIds);
      if (input.version && input.version !== coverageVersion(plan)) {
        throw new TRPCError({ code: "CONFLICT", message: COVERAGE_MOVED });
      }

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
      const [saved] = await ctx.db
        .update(accessPlan)
        .set({ updatedAt: new Date() })
        .where(eq(accessPlan.id, plan.id))
        .returning();

      // Adding a branch enrols the people who already hold this plan, in the
      // same call (ADR 129). It used to be a second button, so an owner read
      // who would gain access and then had to give it to them.
      const reconciliation =
        added.length > 0
          ? await reconcilePlanHolders(
              ctx.db,
              ctx.organizationId,
              plan.id,
              input.entityIds,
            )
          : EMPTY_RECONCILIATION;

      return {
        version: coverageVersion(saved ?? plan),
        before,
        after: [...input.entityIds].sort(),
        affected,
        ...reconciliation,
        incomplete: reconciliationIncomplete(reconciliation),
      };
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
      if (input.archived) {
        const { month } = await currentMonthOf(ctx.db);
        const waiting = await pendingChanges(ctx.db, month);
        const targets = await ctx.db
          .select({
            id: accessAssignment.id,
            planId: accessAssignment.planId,
          })
          .from(accessAssignment)
          .where(eq(accessAssignment.planId, input.id));
        const held = new Set(targets.map((t) => t.id));
        if (waiting.some((c) => held.has(c.targetAssignmentId))) {
          throw new TRPCError({
            code: "CONFLICT",
            message: TARGET_ARCHIVED_DEPENDENCY,
          });
        }
      }
      await ctx.db
        .update(accessPlan)
        .set({ archivedAt: input.archived ? new Date() : null })
        .where(eq(accessPlan.id, input.id));
      return { archived: input.archived };
    }),
} satisfies TRPCRouterRecord;
