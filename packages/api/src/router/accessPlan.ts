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
  gt,
  gte,
  inArray,
  isNull,
  lt,
  or,
  recordActivity,
  recordMilestone,
  sql,
  withScope,
} from "@matops/db";
import {
  accessAssignment,
  accessAssignmentChange,
  accessPlan,
  accessPlanEntity,
  accessPlanPrice,
  classInstance,
  classParticipation,
  entity,
  entityMembership,
  member,
  membershipAccessHold,
  membershipMonth,
  membershipMonthAudit,
  membershipPolicy,
  person,
} from "@matops/db/schema";
import {
  affectedByCoverageChange,
  appliesInMonth,
  canEditPlan,
  canPriceFrom,
  changeIsPending,
  formatDeadline,
  formatMonth,
  instantFromLocalDate,
  isFreeMembershipMonth,
  isStaffRole,
  localDateISO,
  monthOf,
  nextMonth,
  payDeadline,
  paymentReference,
  periodsOverlap,
  priceForMonth,
  resolveAcademyTimeZone,
  runsOrganization,
} from "@matops/domain";
import {
  AccessPlanIdSchema,
  ArchiveAccessPlanSchema,
  AssignMembershipSchema,
  AssignmentIdSchema,
  BookingReviewSchema,
  BulkAssignMembershipSchema,
  CancelPlanChangeSchema,
  ClaimMembershipMonthSchema,
  CreateAccessPlanSchema,
  MarkMembershipMonthSchema,
  MemberAssignmentsSchema,
  MembershipMonthsSchema,
  MembershipPolicySchema,
  PlanChangeSchema,
  RejectMembershipClaimSchema,
  SetAccessPlanCoverageSchema,
  SetAccessPlanPriceSchema,
} from "@matops/validators";

import type { BookingToReview } from "../membership-access";
import { claimSeat } from "../classes";
import { studentRosterOf } from "../members";
import {
  bookingsNeedingReview,
  loadRosterStanding,
  loadStaffAccess,
} from "../membership-access";
import {
  assignmentAppliesInMonth,
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
const CHANGE_NOT_FOUND = "That plan change is gone";
const CHANGE_ALREADY_STARTED =
  "That change has already started. Schedule a new one for next month instead.";
const CHANGE_PENDING =
  "This membership already has a plan change waiting. Cancel that one first.";
const SAME_PLAN = "They are already on that plan from that month";
const TARGET_OVERLAPS =
  "They already hold that plan over those months. Open the membership they have instead.";
const TARGET_ARCHIVED_DEPENDENCY =
  "A scheduled plan change still points at this plan. Cancel that change first.";
const COVERAGE_MOVED =
  "Somebody changed this plan's branches while you were looking. Check the list again and save.";

const DEFAULT_MEMBERSHIP_GRACE_DAYS = 7;

type PlanRow = typeof accessPlan.$inferSelect;

async function promotePaidBookings(
  db: TenantTx,
  assignment: Pick<typeof accessAssignment.$inferSelect, "personId" | "planId">,
  month: string,
  timeZone: string,
): Promise<number> {
  const coverage = await db
    .select({ entityId: accessPlanEntity.entityId })
    .from(accessPlanEntity)
    .where(eq(accessPlanEntity.planId, assignment.planId));
  if (coverage.length === 0) return 0;

  const bookings = await db
    .select({ id: classParticipation.id, classId: classParticipation.classId })
    .from(classParticipation)
    .innerJoin(classInstance, eq(classInstance.id, classParticipation.classId))
    .where(
      and(
        eq(classParticipation.personId, assignment.personId),
        eq(classParticipation.bookingStatus, "booked"),
        eq(classParticipation.bookingTier, "provisional"),
        inArray(
          classInstance.academyId,
          coverage.map((row) => row.entityId),
        ),
        eq(classInstance.status, "scheduled"),
        isNull(classInstance.deletedAt),
        gt(classInstance.startsAt, new Date()),
        gte(classInstance.startsAt, instantFromLocalDate(month, 0, timeZone)),
        lt(
          classInstance.startsAt,
          instantFromLocalDate(nextMonth(month), 0, timeZone),
        ),
      ),
    )
    .for("update");

  let promoted = 0;
  for (const booking of bookings) {
    if (!(await claimSeat(db, booking.classId))) continue;
    await db
      .update(classParticipation)
      .set({ bookingTier: "confirmed" })
      .where(eq(classParticipation.id, booking.id));
    promoted += 1;
  }
  return promoted;
}

/**
 * What the caller last saw the plan's coverage as (ADR 129). Every coverage
 * edit touches `updated_at`, so the timestamp IS the version: a preview carries
 * it and the save refuses a list computed against an older one.
 */
function coverageVersion(plan: Pick<PlanRow, "updatedAt">): string {
  return plan.updatedAt.toISOString();
}

/**
 * The plan, or a 404. RLS has already limited the table to this organization,
 * so "not mine" and "not there" are the same answer, which is what we want: a
 * missing plan and another gym's plan must be indistinguishable.
 */
async function loadPlan(
  db: TenantTx,
  id: string,
  { lock = false }: { lock?: boolean } = {},
): Promise<PlanRow> {
  const query = db.select().from(accessPlan).where(eq(accessPlan.id, id));
  // `lock` holds the row for the rest of the transaction, so two coverage
  // edits queue instead of both reading the same version and both passing the
  // check. The loser then reads the winner's `updated_at` and is refused.
  const [row] = lock ? await query.for("update") : await query;
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

/**
 * Every assignment this person holds, locked for the length of the transaction
 * (ADR 129).
 *
 * Two staff scheduling a change at the same moment would otherwise both read
 * "no overlap" and both write one. The lock is on the PERSON's rows, which is
 * the smallest thing that makes overlap decidable.
 */
async function lockAssignmentsOf(
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

/**
 * The plan changes that have not started and have not been taken back, for one
 * person or for the whole gym.
 *
 * Pending is read off the calendar rather than stored, so a job that does not
 * run cannot leave a change in a state nobody asked for (ADR 129).
 */
async function pendingChanges(
  db: TenantTx,
  currentMonth: string,
  subject?: { personId: string | null; accountUserId: string | null },
) {
  const rows = await db
    .select({
      id: accessAssignmentChange.id,
      userId: accessAssignmentChange.personId,
      sourceAssignmentId: accessAssignmentChange.sourceAssignmentId,
      targetAssignmentId: accessAssignmentChange.targetAssignmentId,
      effectiveMonth: accessAssignmentChange.effectiveMonth,
      cancelledAt: accessAssignmentChange.cancelledAt,
    })
    .from(accessAssignmentChange)
    .where(
      subject
        ? and(
            isNull(accessAssignmentChange.cancelledAt),
            subject.personId
              ? eq(accessAssignmentChange.personId, subject.personId)
              : sql`false`,
          )
        : isNull(accessAssignmentChange.cancelledAt),
    );
  return rows.filter((r) => changeIsPending(r, currentMonth));
}

/** The gym's current month, in its own membership calendar. */
async function currentMonthOf(db: TenantTx): Promise<{
  month: string;
  next: string;
  timeZone: string;
}> {
  const calendar = await membershipCalendar(db);
  const month = monthOf(new Date(), calendar.timeZone);
  return { month, next: nextMonth(month), timeZone: calendar.timeZone };
}

/** One assignment of this organization, or a 404 that cannot enumerate others. */
async function loadAssignment(db: TenantTx, id: string) {
  const [row] = await db
    .select({
      id: accessAssignment.id,
      userId: accessAssignment.personId,
      personId: accessAssignment.personId,
      accountUserId: person.accountUserId,
      planId: accessAssignment.planId,
      status: accessAssignment.status,
      startMonth: accessAssignment.startMonth,
      startsOn: accessAssignment.startsOn,
      endMonth: accessAssignment.endMonth,
      assigningEntityId: accessAssignment.assigningEntityId,
    })
    .from(accessAssignment)
    .innerJoin(person, eq(person.id, accessAssignment.personId))
    .where(eq(accessAssignment.id, id));
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: ASSIGNMENT_NOT_FOUND });
  }
  return row;
}

/**
 * Every branch this person still reaches in a given month through memberships
 * OTHER than one. The honest half of a plan change: a branch dropped by the new
 * plan is only a loss when nothing else of theirs covers it.
 */
async function coverageElsewhere(
  db: TenantTx,
  userId: string,
  exceptAssignmentId: string,
  month: string,
): Promise<Set<string>> {
  const rows = await db
    .select({
      id: accessAssignment.id,
      status: accessAssignment.status,
      startMonth: accessAssignment.startMonth,
      endMonth: accessAssignment.endMonth,
      entityId: accessPlanEntity.entityId,
    })
    .from(accessAssignment)
    .innerJoin(
      accessPlanEntity,
      eq(accessPlanEntity.planId, accessAssignment.planId),
    )
    .where(eq(accessAssignment.personId, userId));
  return new Set(
    rows
      .filter(
        (r) =>
          r.id !== exceptAssignmentId &&
          r.status === "active" &&
          appliesInMonth(r, month),
      )
      .map((r) => r.entityId),
  );
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

interface Reconciliation {
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
  personId: string | null,
  accountUserId: string | null,
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
        or(
          personId ? eq(entityMembership.personId, personId) : undefined,
          accountUserId
            ? and(
                isNull(entityMembership.personId),
                eq(entityMembership.userId, accountUserId),
              )
            : undefined,
        ),
        inArray(entityMembership.entityId, entityIds),
      ),
    );
  const byEntity = new Map(held.map((h) => [h.entityId, h.status]));

  const staffAccess = accountUserId
    ? await loadStaffAccess(db, { entityIds, userIds: [accountUserId] })
    : new Map<string, Set<string>>();
  const missing = entityIds.filter(
    (id) =>
      !byEntity.has(id) &&
      (!accountUserId || !staffAccess.get(id)?.has(accountUserId)),
  );
  if (missing.length > 0) {
    await db
      .insert(entityMembership)
      .values(
        missing.map((entityId) => ({
          organizationId,
          entityId,
          personId,
          userId: accountUserId,
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

interface PlanReconciliation {
  checked: number;
  enrolled: { userId: string; name: string; entityIds: string[] }[];
  needsDecision: {
    userId: string;
    name: string;
    entityId: string;
    status: string;
  }[];
  failed: { userId: string; name: string; reason: string }[];
}

/**
 * Enrol every live holder of one plan at every branch it covers (spec FP8,
 * ADR 129).
 *
 * Coverage can change after people are already on a plan, so something has to
 * close the gap. This is that something, and it is now part of the coverage
 * edit itself rather than a second button an owner has to find.
 *
 * **Repeatable by construction.** It reads the state each time and enrols only
 * what is missing, with `onConflictDoNothing` underneath, so running it twice
 * does nothing the second time and running it after a partial failure finishes
 * the job.
 *
 * One person's failure does not stop the rest, and the run names who could not
 * be updated, because an owner cannot chase a count.
 */
async function reconcilePlanHolders(
  db: TenantTx,
  organizationId: string,
  planId: string,
  entityIds: string[],
): Promise<PlanReconciliation> {
  const { month } = await currentMonthOf(db);
  const holders = await db
    .select({
      userId: accessAssignment.personId,
      personId: accessAssignment.personId,
      accountUserId: person.accountUserId,
      name: person.name,
    })
    .from(accessAssignment)
    .innerJoin(person, eq(person.id, accessAssignment.personId))
    .where(
      and(
        eq(accessAssignment.planId, planId),
        eq(accessAssignment.status, "active"),
        // A membership that has ended enrols nobody: adding a branch to an old
        // plan must not put its former holders back on a mat (ADR 129).
        assignmentAppliesInMonth(month),
      ),
    );

  const done: PlanReconciliation = {
    checked: holders.length,
    enrolled: [],
    needsDecision: [],
    failed: [],
  };

  for (const holder of holders) {
    try {
      const one = await enrolInCoveredBranches(
        db,
        organizationId,
        holder.personId,
        holder.accountUserId,
        entityIds,
      );
      if (one.enrolled.length > 0) {
        done.enrolled.push({ ...holder, entityIds: one.enrolled });
      }
      for (const d of one.needsDecision) {
        done.needsDecision.push({ ...holder, ...d });
      }
    } catch (error) {
      done.failed.push({
        ...holder,
        reason:
          error instanceof Error
            ? error.message
            : "Couldn't update them. Try again.",
      });
    }
  }
  return done;
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

/** Is there work the last coverage run could not finish? */
function reconciliationIncomplete(r: PlanReconciliation): boolean {
  return r.failed.length > 0 || r.needsDecision.length > 0;
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

type MonthStatus = "unpaid" | "reported" | "confirmed" | "rejected";

async function lockMembershipMonth(
  db: TenantTx,
  assignmentId: string,
  month: string,
) {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext(${assignmentId}), hashtext(${month}))`,
  );
  const [row] = await db
    .select()
    .from(membershipMonth)
    .where(
      and(
        eq(membershipMonth.assignmentId, assignmentId),
        eq(membershipMonth.month, month),
      ),
    )
    .for("update");
  return row;
}

function requireMonthVersion(
  current: { version: number } | undefined,
  expectedVersion: number | undefined,
) {
  if (expectedVersion !== undefined && expectedVersion !== current?.version) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "This payment changed while you were looking. Refresh and try again.",
    });
  }
}

async function monthEvidence(
  db: TenantTx,
  assignment: Awaited<ReturnType<typeof loadAssignment>>,
  month: string,
) {
  if (!appliesInMonth(assignment, month)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This membership does not apply in that month.",
    });
  }
  const calendar = await membershipCalendar(db);
  const prices = await db
    .select({
      effectiveMonth: accessPlanPrice.effectiveMonth,
      priceMinor: accessPlanPrice.priceMinor,
      currency: accessPlanPrice.currency,
    })
    .from(accessPlanPrice)
    .where(eq(accessPlanPrice.planId, assignment.planId));
  const amount = priceForMonth(prices, month);
  if (!amount) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This membership has no price for that month.",
    });
  }
  return {
    ...amount,
    deadline: payDeadline({
      month,
      startMonth: assignment.startMonth,
      policy: calendar,
    }),
    calendarTimeZone: calendar.timeZone,
  };
}

async function appendMonthAudit(
  db: TenantTx,
  input: {
    organizationId: string;
    assignmentId: string;
    month: string;
    event: string;
    beforeStatus: MonthStatus | null;
    afterStatus: MonthStatus;
    reason?: string;
    evidence: Awaited<ReturnType<typeof monthEvidence>>;
    actorId: string;
  },
) {
  await db.insert(membershipMonthAudit).values({
    organizationId: input.organizationId,
    assignmentId: input.assignmentId,
    month: input.month,
    event: input.event,
    beforeStatus: input.beforeStatus,
    afterStatus: input.afterStatus,
    reason: input.reason,
    priceMinor: input.evidence.priceMinor,
    currency: input.evidence.currency,
    deadline: input.evidence.deadline,
    calendarTimeZone: input.evidence.calendarTimeZone,
    actorId: input.actorId,
  });
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
    const gaps = await coverageGaps(ctx.db);

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
      gaps: gaps.get(p.id) ?? { missing: 0, needsDecision: 0 },
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
              error instanceof TRPCError
                ? error.message
                : "Couldn't add it. Try again.",
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

  /**
   * What changing somebody's plan would do, before it is scheduled (ADR 129).
   *
   * The month is computed here rather than taken from the caller, so a laptop
   * clock cannot move a boundary. Everything the owner needs to decide is in
   * one answer: when it starts, what the new plan costs that month, which
   * branches they gain and lose, and which of their booked sessions the change
   * would leave without coverage.
   */
  previewChange: organizationManagerProcedure
    .input(PlanChangeSchema)
    .query(async ({ ctx, input }) => {
      const { month, next, timeZone } = await currentMonthOf(ctx.db);
      const source = await loadAssignment(ctx.db, input.assignmentId);
      const target = await loadPlan(ctx.db, input.targetPlanId);

      const from = await coverageOf(ctx.db, source.planId);
      const to = await coverageOf(ctx.db, target.id);
      const elsewhere = await coverageElsewhere(
        ctx.db,
        source.userId,
        source.id,
        next,
      );

      const prices = await ctx.db
        .select({
          planId: accessPlanPrice.planId,
          effectiveMonth: accessPlanPrice.effectiveMonth,
          priceMinor: accessPlanPrice.priceMinor,
          currency: accessPlanPrice.currency,
        })
        .from(accessPlanPrice)
        .where(eq(accessPlanPrice.planId, target.id));

      const staff = await loadStaffAccess(ctx.db, {
        entityIds: [...new Set([...from, ...to])],
        userIds: source.accountUserId ? [source.accountUserId] : [],
      });
      const losing = from.filter(
        (id) =>
          !to.includes(id) &&
          !elsewhere.has(id) &&
          (!source.accountUserId || !staff.get(id)?.has(source.accountUserId)),
      );
      return {
        effectiveMonth: next,
        effectiveMonthLabel: formatMonth(next, timeZone),
        currentMonth: month,
        sourcePlanId: source.planId,
        targetPlanId: target.id,
        targetPlanName: target.name,
        targetArchived: target.archivedAt !== null,
        amount: priceForMonth(prices, next),
        gains: to
          .filter(
            (id) =>
              !from.includes(id) &&
              (!source.accountUserId ||
                !staff.get(id)?.has(source.accountUserId)),
          )
          .sort(),
        loses: losing.sort(),
        userId: source.userId,
        pending: (await pendingChanges(ctx.db, month)).some(
          (c) => c.sourceAssignmentId === source.id,
        ),
      };
    }),

  /**
   * Move one membership onto another plan from the first of next month.
   *
   * The month they are in is left exactly as it is: the old plan runs to the
   * end of it with its amount, its paid flag and its claim intact, and the new
   * one starts on the 1st with a clean record of its own. Nothing is prorated
   * and nothing is refunded (ADR 129).
   *
   * One transaction, over rows locked for this person, so two staff pressing at
   * once make one change rather than two overlapping memberships.
   */
  scheduleChange: organizationManagerProcedure
    .input(PlanChangeSchema)
    .mutation(async ({ ctx, input }) => {
      const { month, next } = await currentMonthOf(ctx.db);
      const source = await loadAssignment(ctx.db, input.assignmentId);
      const periods = await lockAssignmentsOf(
        ctx.db,
        source.personId,
        source.accountUserId,
        ctx.organizationId,
      );
      if (source.status !== "active") {
        throw new TRPCError({
          code: "CONFLICT",
          message: MEMBERSHIP_NOT_ACTIVE,
        });
      }
      if (source.endMonth !== null && source.endMonth <= next) {
        throw new TRPCError({
          code: "CONFLICT",
          message: CHANGE_ALREADY_STARTED,
        });
      }
      if (source.planId === input.targetPlanId) {
        throw new TRPCError({ code: "CONFLICT", message: SAME_PLAN });
      }

      const target = await loadPlan(ctx.db, input.targetPlanId);
      await requireStudentCoverage(
        ctx.db,
        ctx.organizationId,
        source.personId,
        source.accountUserId,
        await coverageOf(ctx.db, target.id),
      );
      if (target.archivedAt !== null) {
        throw new TRPCError({ code: "CONFLICT", message: PLAN_CLOSED });
      }
      if (
        (
          await pendingChanges(ctx.db, month, {
            personId: source.personId,
            accountUserId: source.accountUserId,
          })
        ).some((c) => c.sourceAssignmentId === source.id)
      ) {
        throw new TRPCError({ code: "CONFLICT", message: CHANGE_PENDING });
      }
      requireNoOverlap(periods, target.id, {
        startMonth: next,
        endMonth: null,
      });

      await ctx.db
        .update(accessAssignment)
        .set({ endMonth: next })
        .where(eq(accessAssignment.id, source.id));

      const [successor] = await ctx.db
        .insert(accessAssignment)
        .values({
          organizationId: ctx.organizationId,
          personId: source.personId,
          planId: target.id,
          assigningEntityId: source.assigningEntityId,
          startMonth: next,
          startsOn: next,
          assignedBy: ctx.session.user.id,
        })
        .returning({ id: accessAssignment.id });
      if (!successor) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Couldn't schedule the change. Try again.",
        });
      }

      const [change] = await ctx.db
        .insert(accessAssignmentChange)
        .values({
          organizationId: ctx.organizationId,
          personId: source.personId,
          sourceAssignmentId: source.id,
          targetAssignmentId: successor.id,
          effectiveMonth: next,
          previousSourceEndMonth: source.endMonth,
          scheduledBy: ctx.session.user.id,
        })
        .returning({ id: accessAssignmentChange.id });

      // Branch memberships are prepared now so the 1st needs no second action.
      // They grant nothing on their own: access still asks for a membership
      // whose period covers the month, and the successor's does not start yet.
      const enrolment = await enrolInCoveredBranches(
        ctx.db,
        ctx.organizationId,
        source.personId,
        source.accountUserId,
        await coverageOf(ctx.db, target.id),
      );

      return {
        changeId: change?.id ?? null,
        successorId: successor.id,
        effectiveMonth: next,
        ...enrolment,
      };
    }),

  /**
   * Take back a change that has not started (ADR 129).
   *
   * It ends the successor that never ran and puts the source's end month back
   * to whatever this change found there, in one transaction. The change row
   * survives, marked cancelled: the record that somebody scheduled it and
   * thought again is worth keeping. After the boundary there is no undo, only a
   * new change for the month after this one.
   */
  cancelScheduledChange: organizationManagerProcedure
    .input(CancelPlanChangeSchema)
    .mutation(async ({ ctx, input }) => {
      const { month } = await currentMonthOf(ctx.db);
      const [change] = await ctx.db
        .select()
        .from(accessAssignmentChange)
        .where(eq(accessAssignmentChange.id, input.changeId));
      if (change?.cancelledAt !== null) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: CHANGE_NOT_FOUND,
        });
      }
      await lockAssignmentsOf(
        ctx.db,
        change.personId,
        null,
        ctx.organizationId,
      );
      if (!changeIsPending(change, month)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: CHANGE_ALREADY_STARTED,
        });
      }

      await ctx.db
        .update(accessAssignment)
        .set({ status: "cancelled" })
        .where(eq(accessAssignment.id, change.targetAssignmentId));
      await ctx.db
        .update(accessAssignment)
        .set({ endMonth: change.previousSourceEndMonth })
        .where(eq(accessAssignment.id, change.sourceAssignmentId));
      await ctx.db
        .update(accessAssignmentChange)
        .set({ cancelledAt: new Date(), cancelledBy: ctx.session.user.id })
        .where(eq(accessAssignmentChange.id, change.id));

      return { changeId: change.id, cancelled: true as const };
    }),

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
      const assignment = await loadAssignment(ctx.db, input.assignmentId);
      const held = await lockMembershipMonth(
        ctx.db,
        input.assignmentId,
        input.month,
      );
      requireMonthVersion(held, input.expectedVersion);
      const nextStatus: MonthStatus = input.paid ? "confirmed" : "unpaid";
      const currentStatus = (held?.status ?? "unpaid") as MonthStatus;
      if (currentStatus === nextStatus) {
        return {
          changed: false,
          paid: input.paid,
          status: nextStatus,
          version: held?.version ?? 0,
        };
      }
      const evidence = await monthEvidence(ctx.db, assignment, input.month);
      const now = new Date();
      const [saved] = await ctx.db
        .insert(membershipMonth)
        .values({
          organizationId: ctx.organizationId,
          assignmentId: input.assignmentId,
          month: input.month,
          status: nextStatus,
          version: 1,
          reviewedBy: ctx.session.user.id,
          reviewedAt: now,
          priceMinor: evidence.priceMinor,
          currency: evidence.currency,
          deadline: evidence.deadline,
          calendarTimeZone: evidence.calendarTimeZone,
          reportedAt: null,
        })
        .onConflictDoUpdate({
          target: [membershipMonth.assignmentId, membershipMonth.month],
          set: {
            status: nextStatus,
            version: sql`${membershipMonth.version} + 1`,
            reviewedBy: ctx.session.user.id,
            reviewedAt: now,
            priceMinor: held?.priceMinor ?? evidence.priceMinor,
            currency: held?.currency ?? evidence.currency,
            deadline: held?.deadline ?? evidence.deadline,
            calendarTimeZone:
              held?.calendarTimeZone ?? evidence.calendarTimeZone,
            reportedAt: null,
          },
        })
        .returning({ version: membershipMonth.version });
      await appendMonthAudit(ctx.db, {
        organizationId: ctx.organizationId,
        assignmentId: input.assignmentId,
        month: input.month,
        event: input.paid ? "confirmed" : "corrected",
        beforeStatus: held ? currentStatus : null,
        afterStatus: nextStatus,
        reason: input.reason,
        evidence,
        actorId: ctx.session.user.id,
      });
      if (input.paid) {
        await promotePaidBookings(
          ctx.db,
          assignment,
          input.month,
          evidence.calendarTimeZone,
        );
      }
      if (input.paid && input.resolveHoldReason && held) {
        await ctx.db
          .update(membershipAccessHold)
          .set({
            resolvedBy: ctx.session.user.id,
            resolutionReason: input.resolveHoldReason,
            resolvedAt: now,
          })
          .where(
            and(
              eq(membershipAccessHold.assignmentId, input.assignmentId),
              eq(membershipAccessHold.membershipMonthId, held.id),
              isNull(membershipAccessHold.resolvedAt),
            ),
          );
      }
      return {
        changed: true,
        paid: input.paid,
        status: nextStatus,
        version: saved?.version ?? 1,
      };
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
        userId: accessAssignment.personId,
        name: person.name,
        email: person.email,
        planId: accessAssignment.planId,
        planName: accessPlan.name,
        startMonth: accessAssignment.startMonth,
        startsOn: accessAssignment.startsOn,
        endMonth: accessAssignment.endMonth,
        createdAt: accessAssignment.createdAt,
      })
      .from(accessAssignment)
      .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
      .innerJoin(person, eq(person.id, accessAssignment.personId))
      .where(
        and(
          eq(accessAssignment.status, "active"),
          // The board is this month's bill, so a membership that ended and one
          // that has not started are both off it (ADR 129).
          assignmentAppliesInMonth(month),
        ),
      )
      .orderBy(asc(person.name));

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
            status: membershipMonth.status,
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
      const amount = priceForMonth(
        prices.filter((p) => p.planId === a.planId),
        month,
      );
      const paymentRequired = !isFreeMembershipMonth(amount);
      const deadline = payDeadline({
        month,
        startMonth: a.startMonth,
        joinedOn: a.startsOn,
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
        paid:
          months.find((m) => m.assignmentId === a.id)?.status === "confirmed",
        // What THIS month cost, which a later price change must not rewrite.
        amount,
        paymentRequired,
        deadline,
        deadlineLabel: formatDeadline(deadline, calendar.timeZone),
        overdue: paymentRequired && deadline.getTime() <= Date.now(),
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
          status: membershipMonth.status,
          version: membershipMonth.version,
          reportedAt: membershipMonth.reportedAt,
          reviewedAt: membershipMonth.reviewedAt,
          reviewedBy: membershipMonth.reviewedBy,
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
      if (!ctx.membership.personId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Your account is not linked to a person record.",
        });
      }
      const [assignment] = await ctx.db
        .select({
          id: accessAssignment.id,
          personId: accessAssignment.personId,
          planId: accessAssignment.planId,
          status: accessAssignment.status,
          startMonth: accessAssignment.startMonth,
          startsOn: accessAssignment.startsOn,
          endMonth: accessAssignment.endMonth,
          assigningEntityId: accessAssignment.assigningEntityId,
          accountUserId: person.accountUserId,
          userId: accessAssignment.personId,
        })
        .from(accessAssignment)
        .innerJoin(person, eq(person.id, accessAssignment.personId))
        .where(
          and(
            eq(accessAssignment.id, input.assignmentId),
            eq(accessAssignment.personId, ctx.membership.personId),
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
      const held = await lockMembershipMonth(ctx.db, assignment.id, month);
      requireMonthVersion(held, input.expectedVersion);
      const currentStatus = (held?.status ?? "unpaid") as MonthStatus;
      if (currentStatus !== "unpaid") {
        return {
          claimed: false,
          month,
          status: currentStatus,
          version: held?.version ?? 0,
        };
      }
      const [openHold] = await ctx.db
        .select({ id: membershipAccessHold.id })
        .from(membershipAccessHold)
        .where(
          and(
            eq(membershipAccessHold.assignmentId, assignment.id),
            isNull(membershipAccessHold.resolvedAt),
          ),
        )
        .limit(1);
      if (openHold) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "An owner must resolve the rejected payment before you can report again.",
        });
      }
      const evidence = await monthEvidence(ctx.db, assignment, month);
      if (evidence.priceMinor === 0) {
        return { claimed: false, month, status: "unpaid" as const, version: 0 };
      }
      if (
        input.priceMinor !== undefined &&
        (input.priceMinor !== evidence.priceMinor ||
          input.currency !== evidence.currency)
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "The membership price changed. Refresh before reporting payment.",
        });
      }
      const now = new Date();
      const [saved] = await ctx.db
        .insert(membershipMonth)
        .values({
          organizationId: ctx.organizationId,
          assignmentId: input.assignmentId,
          month,
          status: "reported",
          version: 1,
          claimedBy: ctx.session.user.id,
          priceMinor: evidence.priceMinor,
          currency: evidence.currency,
          deadline: evidence.deadline,
          calendarTimeZone: evidence.calendarTimeZone,
          reportedAt: now,
        })
        .onConflictDoUpdate({
          target: [membershipMonth.assignmentId, membershipMonth.month],
          set: {
            status: "reported",
            version: sql`${membershipMonth.version} + 1`,
            claimedBy: ctx.session.user.id,
            reportedAt: now,
            priceMinor: held?.priceMinor ?? evidence.priceMinor,
            currency: held?.currency ?? evidence.currency,
            deadline: held?.deadline ?? evidence.deadline,
            calendarTimeZone:
              held?.calendarTimeZone ?? evidence.calendarTimeZone,
          },
        })
        .returning({ version: membershipMonth.version });
      await appendMonthAudit(ctx.db, {
        organizationId: ctx.organizationId,
        assignmentId: input.assignmentId,
        month,
        event: "reported",
        beforeStatus: held ? currentStatus : null,
        afterStatus: "reported",
        evidence,
        actorId: ctx.session.user.id,
      });
      return {
        claimed: true,
        month,
        status: "reported" as const,
        version: saved?.version ?? 1,
      };
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
        reportedAt: membershipMonth.reportedAt,
        personId: accessAssignment.personId,
        userId: accessAssignment.personId,
        name: person.name,
        email: person.email,
        planName: accessPlan.name,
      })
      .from(membershipMonth)
      .innerJoin(
        accessAssignment,
        eq(accessAssignment.id, membershipMonth.assignmentId),
      )
      .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
      .innerJoin(person, eq(person.id, accessAssignment.personId))
      .where(eq(membershipMonth.status, "reported"))
      .orderBy(asc(membershipMonth.reportedAt));
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
      const assignment = await loadAssignment(ctx.db, input.assignmentId);
      const held = await lockMembershipMonth(
        ctx.db,
        input.assignmentId,
        input.month,
      );
      requireMonthVersion(held, input.expectedVersion);
      if (held?.status !== "reported") {
        return { cleared: false, status: held?.status ?? "unpaid" };
      }
      if (!assignment.personId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "This membership must belong to a person before its payment can be rejected.",
        });
      }
      const personId = assignment.personId;
      const evidence = await monthEvidence(ctx.db, assignment, input.month);
      const now = new Date();
      const [saved] = await ctx.db
        .update(membershipMonth)
        .set({
          status: "rejected",
          version: sql`${membershipMonth.version} + 1`,
          reviewedBy: ctx.session.user.id,
          reviewedAt: now,
        })
        .where(eq(membershipMonth.id, held.id))
        .returning({ version: membershipMonth.version });
      const coverage = await coverageOf(ctx.db, assignment.planId);
      if (coverage.length > 0) {
        await ctx.db
          .insert(membershipAccessHold)
          .values(
            coverage.map((entityId) => ({
              organizationId: ctx.organizationId,
              personId,
              assignmentId: assignment.id,
              membershipMonthId: held.id,
              entityId,
              rejectedBy: ctx.session.user.id,
              rejectionReason: input.reason,
            })),
          )
          .onConflictDoNothing();
      }
      await appendMonthAudit(ctx.db, {
        organizationId: ctx.organizationId,
        assignmentId: input.assignmentId,
        month: input.month,
        event: "rejected",
        beforeStatus: "reported",
        afterStatus: "rejected",
        reason: input.reason,
        evidence,
        actorId: ctx.session.user.id,
      });
      return {
        cleared: true,
        status: "rejected" as const,
        version: saved?.version ?? held.version + 1,
      };
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
      {
        personId: ctx.membership.personId,
        accountUserId: ctx.session.user.id,
      },
      new Date(),
    );
    const { month, timeZone } = await currentMonthOf(ctx.db);
    // A change waiting for the 1st is the member's business too: they should
    // read what they will be on and what it costs before it happens (ADR 129).
    const waiting = await pendingChanges(ctx.db, month, {
      personId: ctx.membership.personId,
      accountUserId: ctx.session.user.id,
    });
    const successors = waiting.length
      ? await ctx.db
          .select({
            id: accessAssignment.id,
            planId: accessAssignment.planId,
            planName: accessPlan.name,
          })
          .from(accessAssignment)
          .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
          .where(
            inArray(
              accessAssignment.id,
              waiting.map((c) => c.targetAssignmentId),
            ),
          )
      : [];
    const prices = successors.length
      ? await ctx.db
          .select({
            planId: accessPlanPrice.planId,
            effectiveMonth: accessPlanPrice.effectiveMonth,
            priceMinor: accessPlanPrice.priceMinor,
            currency: accessPlanPrice.currency,
          })
          .from(accessPlanPrice)
      : [];
    const coverage = successors.length
      ? await ctx.db
          .select({
            planId: accessPlanEntity.planId,
            entityId: accessPlanEntity.entityId,
          })
          .from(accessPlanEntity)
      : [];

    return {
      bankDetails: await membershipBankDetails(ctx.db),
      // The reference is derived here and never stored, the way ADR 40's
      // already is: it survives a rename and cannot go stale.
      memberships: memberships.map((m) => {
        const change = waiting.find(
          (c) => c.sourceAssignmentId === m.assignmentId,
        );
        const next = change
          ? successors.find((a) => a.id === change.targetAssignmentId)
          : undefined;
        return {
          ...m,
          reference: paymentReference(ctx.session.user.name, m.assignmentId),
          next:
            change && next
              ? {
                  planName: next.planName,
                  effectiveMonth: change.effectiveMonth,
                  effectiveMonthLabel: formatMonth(
                    change.effectiveMonth,
                    timeZone,
                  ),
                  amount: priceForMonth(
                    prices.filter((p) => p.planId === next.planId),
                    change.effectiveMonth,
                  ),
                  entityIds: coverage
                    .filter((c) => c.planId === next.planId)
                    .map((c) => c.entityId)
                    .sort(),
                }
              : null,
        };
      }),
    };
  }),
} satisfies TRPCRouterRecord;
