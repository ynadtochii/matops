import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { DbExec, TenantTx } from "@matops/db";
import {
  and,
  asc,
  eq,
  eventRole,
  isNull,
  or,
  recordActivity,
  recordMilestone,
  sql,
  withScope,
} from "@matops/db";
import {
  accessAssignment,
  accessPlan,
  accessPlanEntity,
  entityMembership,
  member,
  person,
} from "@matops/db/schema";
import {
  appliesInMonth,
  formatMonth,
  isStaffRole,
  localDateISO,
  monthOf,
  periodsOverlap,
  runsOrganization,
} from "@matops/domain";
import {
  AccessPlanIdSchema,
  AssignMembershipSchema,
  AssignmentIdSchema,
  BookingReviewSchema,
  MemberAssignmentsSchema,
} from "@matops/validators";

import type { BookingToReview } from "../../membership-access";
import { studentRosterOf } from "../../members";
import {
  bookingsNeedingReview,
  loadRosterStanding,
} from "../../membership-access";
import {
  membershipCalendar,
  membershipStanding,
} from "../../membership-status";
import { ASSIGNMENT_NOT_FOUND } from "../../month-write";
import { readOrganizationEntities } from "../../organization-read";
import {
  organizationManagerIdentityProcedure,
  organizationManagerProcedure,
} from "../../trpc";
import {
  coverageOf,
  currentMonthOf,
  enrolInCoveredBranches,
  loadPlan,
  pendingChanges,
  reconcilePlanHolders,
  reconciliationIncomplete,
} from "./shared";

const PLAN_CLOSED = "That plan is archived, so it takes no new members";

const NOT_A_MEMBER = "That person is not part of this gym";

const CHANGE_PENDING =
  "This membership already has a plan change waiting. Cancel that one first.";

const TARGET_OVERLAPS =
  "They already hold that plan over those months. Open the membership they have instead.";

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

export async function assignOne(
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
    startsOn?: string | null;
  },
) {
  const plan = await loadPlan(ctx.db, input.planId);
  const subject = await requireOrganizationPerson(
    ctx.db,
    ctx.organizationId,
    input.userId,
  );

  // The gym's own calendar decides which month "now" is. Just after midnight
  // on 1 October in Lisbon, UTC is still September, and an assignment starting
  // in a month that is already over carries a deadline that has passed.
  const { month, timeZone } = await currentMonthOf(ctx.db);
  const startMonth = input.startMonth
    ? `${input.startMonth.slice(0, 7)}-01`
    : month;
  const startsOn =
    input.startsOn ??
    (startMonth === month ? localDateISO(new Date(), timeZone) : startMonth);
  if (startsOn.slice(0, 7) !== startMonth.slice(0, 7)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The start date must be inside the start month.",
    });
  }

  const periods = await lockAssignmentsOf(
    ctx.db,
    subject.id,
    subject.accountUserId,
    ctx.organizationId,
  );
  // The membership they hold on this plan over the month being assigned,
  // whatever its status: a suspended or cancelled one is restored, which is the
  // rule ADR 128 chose. A period that already ENDED is history and is never
  // reopened (ADR 129), so returning to a plan writes a second period beside
  // the first rather than rewriting it.
  const held = periods.find(
    (a) => a.planId === plan.id && appliesInMonth(a, startMonth),
  );

  // Archived stops NEW memberships only. Someone who already holds one keeps
  // it, and an owner may still put a paused one back on its feet.
  if (!held && plan.archivedAt !== null) {
    throw new TRPCError({ code: "CONFLICT", message: PLAN_CLOSED });
  }

  const entityIds = await coverageOf(ctx.db, plan.id);
  if (!held) {
    await requireStudentCoverage(
      ctx.db,
      ctx.organizationId,
      subject.id,
      subject.accountUserId,
      entityIds,
    );
  }

  let assignmentId: string;
  let created = false;
  let restored = false;
  if (held) {
    assignmentId = held.id;
    if (held.status !== "active") {
      await ctx.db
        .update(accessAssignment)
        .set({ status: "active" })
        .where(eq(accessAssignment.id, held.id));
      restored = true;
    }
  } else {
    requireNoOverlap(periods, plan.id, { startMonth, endMonth: null });
    const [made] = await ctx.db
      .insert(accessAssignment)
      .values({
        organizationId: ctx.organizationId,
        personId: subject.id,
        planId: plan.id,
        assigningEntityId: input.assigningEntityId ?? null,
        startMonth,
        startsOn,
        assignedBy: ctx.session.user.id,
      })
      .returning({ id: accessAssignment.id });
    if (!made) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Couldn't add the membership. Try again.",
      });
    }
    assignmentId = made.id;
    created = true;
  }

  const reconciliation = await enrolInCoveredBranches(
    ctx.db,
    ctx.organizationId,
    subject.id,
    subject.accountUserId,
    entityIds,
  );
  return { id: assignmentId, created, restored, ...reconciliation };
}

export async function lockAssignmentsOf(
  db: TenantTx,
  personId: string | null,
  accountUserIdOrOrganizationId: string | null,
  organizationIdInput?: string,
) {
  const organizationId =
    organizationIdInput ?? accountUserIdOrOrganizationId ?? "";
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${personId ?? ""}))`,
  );
  return db
    .select({
      id: accessAssignment.id,
      planId: accessAssignment.planId,
      status: accessAssignment.status,
      startMonth: accessAssignment.startMonth,
      startsOn: accessAssignment.startsOn,
      endMonth: accessAssignment.endMonth,
      assigningEntityId: accessAssignment.assigningEntityId,
    })
    .from(accessAssignment)
    .where(personId ? eq(accessAssignment.personId, personId) : sql`false`)
    .for("update");
}

/** Refuse a period of one plan that runs over one the person already holds. */
function requireNoOverlap(
  periods: {
    planId: string;
    status: string;
    startMonth: string;
    endMonth: string | null;
  }[],
  planId: string,
  wanted: { startMonth: string; endMonth: string | null },
): void {
  const clash = periods.some(
    (a) =>
      a.planId === planId &&
      a.status !== "cancelled" &&
      periodsOverlap(a, wanted),
  );
  if (clash) {
    throw new TRPCError({ code: "CONFLICT", message: TARGET_OVERLAPS });
  }
}

async function requireOrganizationPerson(
  db: TenantTx,
  organizationId: string,
  personId: string,
) {
  const [row] = await db
    .select({ id: person.id, accountUserId: person.accountUserId })
    .from(person)
    .where(
      and(
        eq(person.organizationId, organizationId),
        or(
          eq(sql`${person.id}::text`, personId),
          eq(person.accountUserId, personId),
        ),
        isNull(person.archivedAt),
      ),
    )
    .limit(1);
  if (row) return row;
  throw new TRPCError({ code: "NOT_FOUND", message: NOT_A_MEMBER });
}

async function requireStudentCoverage(
  db: TenantTx,
  organizationId: string,
  personId: string | null,
  accountUserId: string | null,
  entityIds: string[],
): Promise<void> {
  const [organizationMember] = accountUserId
    ? await db
        .select({ role: member.role })
        .from(member)
        .where(
          and(
            eq(member.organizationId, organizationId),
            eq(member.userId, accountUserId),
          ),
        )
    : [];
  const branches = await db
    .select({
      entityId: entityMembership.entityId,
      role: entityMembership.role,
      status: entityMembership.status,
      invitedRole: entityMembership.invitedRole,
    })
    .from(entityMembership)
    .where(
      and(
        eq(entityMembership.organizationId, organizationId),
        or(
          personId ? eq(entityMembership.personId, personId) : undefined,
          accountUserId
            ? and(
                isNull(entityMembership.personId),
                eq(entityMembership.userId, accountUserId),
              )
            : undefined,
        ),
      ),
    )
    .for("update");
  if (
    (organizationMember &&
      runsOrganization({ ...organizationMember, status: "active" })) ||
    (entityIds.length > 0 &&
      entityIds.every((id) =>
        branches.some((b) => b.entityId === id && isStaffRole(b)),
      ))
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Staff access covers these branches. No membership is required. Choose a plan for a branch where they are a student.",
    });
  }
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
  // A successor waiting on this membership would restore access the moment it
  // started, which is not what pausing meant (ADR 129). Say so rather than let
  // it happen quietly.
  const { month } = await currentMonthOf(ctx.db);
  const waiting = await pendingChanges(ctx.db, month);
  if (waiting.some((c) => c.sourceAssignmentId === id)) {
    throw new TRPCError({ code: "CONFLICT", message: CHANGE_PENDING });
  }

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

export const planHolderProcedures = {
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
      const done = await reconcilePlanHolders(
        ctx.db,
        ctx.organizationId,
        plan.id,
        await coverageOf(ctx.db, plan.id),
      );
      return { ...done, incomplete: reconciliationIncomplete(done) };
    }),

  /**
   * Booked sessions that need a look, branch by branch (ADR 129).
   *
   * Losing coverage cancels nothing, so this list is what an owner works from
   * instead. It is derived from the bookings and the access rules as they
   * stand: restoring coverage, or cancelling the booking from the class the
   * way staff always have, removes the item with no second write.
   *
   * One entity scope per branch, combined here, which is the shape every
   * organization read uses (ADR 124). An unpaid month is not a reason: that is
   * the dues gate's business and the overdue sweep's.
   */
  bookingsToReview: organizationManagerIdentityProcedure
    .input(BookingReviewSchema)
    .query(async ({ ctx, input }) => {
      const branches = await readOrganizationEntities(
        ctx.organizationId,
        ctx.baseDb,
      );
      const now = new Date();
      const items: (BookingToReview & { entityName: string })[] = [];

      for (const branch of branches) {
        if (items.length >= input.limit) break;
        const found = await withScope(
          { organizationId: ctx.organizationId, entityId: branch.id },
          (db) =>
            bookingsNeedingReview(db, {
              entityId: branch.id,
              now,
              personId: input.personId ?? undefined,
              limit: input.limit - items.length,
            }),
          ctx.baseDb,
        );
        for (const item of found) {
          items.push({ ...item, entityName: branch.name });
        }
      }

      items.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      return {
        items,
        // True when the page filled up, so the screen can say there is more
        // rather than imply this is everything.
        more: items.length >= input.limit,
      };
    }),

  /**
   * Everybody a membership should cover and does not, branch by branch
   * (ADR 128, spec FP8).
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
      people: { personId: string; userId: string; name: string }[];
    }[] = [];

    for (const branch of branches) {
      const people = await withScope(
        { organizationId: ctx.organizationId, entityId: branch.id },
        async (db) => {
          const active = (
            await studentRosterOf({ academyId: branch.id, db })
          ).filter((m) => m.status === "active");
          if (active.length === 0) return [];
          const standing = await loadRosterStanding(db, {
            entityId: branch.id,
            people: active.map((m) => ({
              userId: m.userId,
              status: m.status,
              role: m.role,
            })),
            now,
          });
          return active
            .filter((m) => !standing.get(m.userId)?.covered)
            .map((m) => ({
              personId: m.personId,
              userId: m.userId,
              name: m.name,
            }));
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
      const subject = await requireOrganizationPerson(
        ctx.db,
        ctx.organizationId,
        input.userId,
      );
      const rows = await ctx.db
        .select({
          id: accessAssignment.id,
          planId: accessAssignment.planId,
          planName: accessPlan.name,
          archived: accessPlan.archivedAt,
          status: accessAssignment.status,
          startMonth: accessAssignment.startMonth,
          startsOn: accessAssignment.startsOn,
          endMonth: accessAssignment.endMonth,
          assigningEntityId: accessAssignment.assigningEntityId,
        })
        .from(accessAssignment)
        .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
        .where(eq(accessAssignment.personId, subject.id))
        .orderBy(asc(accessPlan.name));

      const coverage = await ctx.db
        .select({
          planId: accessPlanEntity.planId,
          entityId: accessPlanEntity.entityId,
        })
        .from(accessPlanEntity);

      const calendar = await membershipCalendar(ctx.db);
      const month = monthOf(new Date(), calendar.timeZone);
      const standing = await membershipStanding(
        ctx.db,
        { personId: subject.id, accountUserId: subject.accountUserId },
        new Date(),
      );
      const waiting = await pendingChanges(ctx.db, month, {
        personId: subject.id,
        accountUserId: subject.accountUserId,
      });
      const planNameOf = new Map(rows.map((r) => [r.id, r.planName]));

      return rows.map((r) => {
        const now = standing.find((m) => m.assignmentId === r.id);
        const change = waiting.find((c) => c.sourceAssignmentId === r.id);
        return {
          id: r.id,
          planId: r.planId,
          planName: r.planName,
          planArchived: r.archived !== null,
          status: r.status,
          startMonth: r.startMonth,
          endMonth: r.endMonth,
          assigningEntityId: r.assigningEntityId,
          entityIds: coverage
            .filter((c) => c.planId === r.planId)
            .map((c) => c.entityId)
            .sort(),
          month: now?.month ?? null,
          monthLabel: now ? formatMonth(now.month, calendar.timeZone) : null,
          paid: now?.paid ?? false,
          paymentRequired: now?.paymentRequired ?? true,
          amount: now?.amount ?? null,
          appliesNow: appliesInMonth(r, month),
          // The plan waiting for the 1st, so the profile can say what happens
          // next and offer to take it back (ADR 129).
          pendingChange: change
            ? {
                id: change.id,
                effectiveMonth: change.effectiveMonth,
                effectiveMonthLabel: formatMonth(
                  change.effectiveMonth,
                  calendar.timeZone,
                ),
                targetAssignmentId: change.targetAssignmentId,
                targetPlanName:
                  planNameOf.get(change.targetAssignmentId) ?? null,
              }
            : null,
        };
      });
    }),
} satisfies TRPCRouterRecord;
