import { TRPCError } from "@trpc/server";

import type { TenantTx } from "@matops/db";
import { and, eq, inArray, isNull, or, sql } from "@matops/db";
import {
  accessAssignment,
  accessAssignmentChange,
  accessPlan,
  accessPlanEntity,
  entityMembership,
  person,
} from "@matops/db/schema";
import { changeIsPending, monthOf, nextMonth } from "@matops/domain";

import { loadStaffAccess } from "../../membership-access";
import {
  assignmentAppliesInMonth,
  membershipCalendar,
} from "../../membership-status";

const PLAN_NOT_FOUND = "That membership plan is gone";

export type PlanRow = typeof accessPlan.$inferSelect;

/**
 * The plan, or a 404. RLS has already limited the table to this organization,
 * so "not mine" and "not there" are the same answer, which is what we want: a
 * missing plan and another gym's plan must be indistinguishable.
 */
export async function loadPlan(
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
 * The plan changes that have not started and have not been taken back, for one
 * person or for the whole gym.
 *
 * Pending is read off the calendar rather than stored, so a job that does not
 * run cannot leave a change in a state nobody asked for (ADR 129).
 */
export async function pendingChanges(
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
export async function currentMonthOf(db: TenantTx): Promise<{
  month: string;
  next: string;
  timeZone: string;
}> {
  const calendar = await membershipCalendar(db);
  const month = monthOf(new Date(), calendar.timeZone);
  return { month, next: nextMonth(month), timeZone: calendar.timeZone };
}

/** The entity ids one plan covers today. */
export async function coverageOf(
  db: TenantTx,
  planId: string,
): Promise<string[]> {
  const rows = await db
    .select({ entityId: accessPlanEntity.entityId })
    .from(accessPlanEntity)
    .where(eq(accessPlanEntity.planId, planId));
  return rows.map((r) => r.entityId).sort();
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
export async function enrolInCoveredBranches(
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

export interface PlanReconciliation {
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
export async function reconcilePlanHolders(
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

/** Is there work the last coverage run could not finish? */
export function reconciliationIncomplete(r: PlanReconciliation): boolean {
  return r.failed.length > 0 || r.needsDecision.length > 0;
}
