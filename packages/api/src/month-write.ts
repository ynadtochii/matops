import { TRPCError } from "@trpc/server";

import type { DbExec, TenantTx } from "@matops/db";
import { and, eq, gt, gte, isNull, lt, sql, withScope } from "@matops/db";
import {
  accessAssignment,
  accessPlanEntity,
  accessPlanPrice,
  classInstance,
  classParticipation,
  membershipMonth,
  membershipMonthAudit,
  person,
} from "@matops/db/schema";
import {
  appliesInMonth,
  instantFromLocalDate,
  nextMonth,
  payDeadline,
  priceForMonth,
} from "@matops/domain";

import { claimSeat } from "./classes";
import { membershipCalendar } from "./membership-status";

export type MonthStatus = "unpaid" | "reported" | "confirmed" | "rejected";

export const ASSIGNMENT_NOT_FOUND = "That membership is gone";

/** One assignment of this organization, or a 404 that cannot enumerate others. */
export async function loadAssignment(db: TenantTx, id: string) {
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

export async function lockMembershipMonth(
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

export async function monthEvidence(
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

export async function appendMonthAudit(
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
    actorId: string | null;
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

export async function promotePaidBookings(
  exec: DbExec,
  organizationId: string,
  entityIds: string[],
  personId: string,
  month: string,
  timeZone: string,
): Promise<void> {
  for (const entityId of entityIds) {
    await withScope(
      { organizationId, entityId },
      async (db) => {
        const bookings = await db
          .select({
            id: classParticipation.id,
            classId: classParticipation.classId,
          })
          .from(classParticipation)
          .innerJoin(
            classInstance,
            eq(classInstance.id, classParticipation.classId),
          )
          .where(
            and(
              eq(classParticipation.personId, personId),
              eq(classParticipation.bookingStatus, "booked"),
              eq(classParticipation.bookingTier, "provisional"),
              eq(classInstance.status, "scheduled"),
              isNull(classInstance.deletedAt),
              gt(classInstance.startsAt, new Date()),
              gte(
                classInstance.startsAt,
                instantFromLocalDate(month, 0, timeZone),
              ),
              lt(
                classInstance.startsAt,
                instantFromLocalDate(nextMonth(month), 0, timeZone),
              ),
            ),
          )
          .for("update");

        for (const booking of bookings) {
          await claimSeat(db, booking.classId);
          await db
            .update(classParticipation)
            .set({ bookingTier: "confirmed" })
            .where(eq(classParticipation.id, booking.id));
        }
      },
      exec,
    );
  }
}

export async function writeMonthDecision(
  db: TenantTx,
  input: {
    organizationId: string;
    assignment: Awaited<ReturnType<typeof loadAssignment>>;
    month: string;
    held: Awaited<ReturnType<typeof lockMembershipMonth>>;
    nextStatus: "confirmed" | "unpaid";
    evidence: Awaited<ReturnType<typeof monthEvidence>>;
    actorId: string | null;
    event: string;
    reason?: string;
    now: Date;
  },
): Promise<{
  version: number;
  promote: ((exec: DbExec) => Promise<void>) | null;
}> {
  const { held, evidence, nextStatus, now } = input;
  const [saved] = await db
    .insert(membershipMonth)
    .values({
      organizationId: input.organizationId,
      assignmentId: input.assignment.id,
      month: input.month,
      status: nextStatus,
      version: 1,
      reviewedBy: input.actorId,
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
        reviewedBy: input.actorId,
        reviewedAt: now,
        priceMinor: held?.priceMinor ?? evidence.priceMinor,
        currency: held?.currency ?? evidence.currency,
        deadline: held?.deadline ?? evidence.deadline,
        calendarTimeZone: held?.calendarTimeZone ?? evidence.calendarTimeZone,
        reportedAt: null,
      },
    })
    .returning({ version: membershipMonth.version });
  await appendMonthAudit(db, {
    organizationId: input.organizationId,
    assignmentId: input.assignment.id,
    month: input.month,
    event: input.event,
    beforeStatus: held ? (held.status as MonthStatus) : null,
    afterStatus: nextStatus,
    reason: input.reason,
    evidence,
    actorId: input.actorId,
  });
  if (nextStatus !== "confirmed") {
    return { version: saved?.version ?? 1, promote: null };
  }
  const coverage = await db
    .select({ entityId: accessPlanEntity.entityId })
    .from(accessPlanEntity)
    .where(eq(accessPlanEntity.planId, input.assignment.planId));
  // The organization transaction cannot see class rows, so each branch's
  // bookings are promoted in that branch's own scope once the month commits.
  return {
    version: saved?.version ?? 1,
    promote: (exec) =>
      promotePaidBookings(
        exec,
        input.organizationId,
        coverage.map((row) => row.entityId),
        input.assignment.personId,
        input.month,
        evidence.calendarTimeZone,
      ),
  };
}
