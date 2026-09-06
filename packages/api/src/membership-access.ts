import type { TenantTx } from "@matops/db";
import type { AccessVerdict, ApplicableAssignment } from "@matops/domain";
import { and, asc, eq, gt, inArray, isNull } from "@matops/db";
import {
  accessAssignment,
  accessPlan,
  accessPlanEntity,
  classInstance,
  classParticipation,
  entityMembership,
  membershipMonth,
  user,
} from "@matops/db/schema";
import {
  appliesInMonth,
  membershipAccess,
  monthOf,
  payDeadline,
} from "@matops/domain";

import { membershipCalendar } from "./membership-status";

/**
 * Whether one person may book or come in at ONE branch (ADR 126).
 *
 * The scoped half of step 4.1's pure decision: this reads, that decides. Every
 * query runs on the request's own tenant transaction, so RLS has already
 * limited the access tables to this organization.
 *
 * Answers TWICE on purpose. `now` is whether they may act at all; `atSession`
 * is whether their membership still covers the class they are reaching for.
 * Booking a class three weeks out while this month runs out next Tuesday is the
 * case that needs both, and the two moments can fall in different months, each
 * with its own paid flag and its own deadline.
 */
export interface MembershipAccess {
  /** May they act right now? */
  now: AccessVerdict;
  /** Will the membership still cover them when the session starts? */
  atSession: AccessVerdict;
  /** The memberships considered, as judged for `now`. */
  assignments: ApplicableAssignment[];
}

interface AccessQuery {
  userId: string;
  entityId: string;
  /** Their standing at this branch, or null for an owner who holds none. */
  membership: { status: string } | null;
  now: Date;
  /** When the class starts. Defaults to `now` for a question about today. */
  sessionAt?: Date;
}

export async function loadMembershipAccess(
  db: TenantTx,
  input: AccessQuery,
): Promise<MembershipAccess> {
  const sessionAt = input.sessionAt ?? input.now;
  const calendar = await membershipCalendar(db);
  const nowMonth = monthOf(input.now, calendar.timeZone);
  const sessionMonth = monthOf(sessionAt, calendar.timeZone);

  const held = await db
    .select({
      id: accessAssignment.id,
      status: accessAssignment.status,
      planId: accessAssignment.planId,
      startMonth: accessAssignment.startMonth,
      endMonth: accessAssignment.endMonth,
      createdAt: accessAssignment.createdAt,
    })
    .from(accessAssignment)
    .where(eq(accessAssignment.userId, input.userId));

  if (held.length === 0) {
    const verdict = membershipAccess({
      entityId: input.entityId,
      membership: input.membership,
      assignments: [],
      at: input.now,
    });
    return { now: verdict, atSession: verdict, assignments: [] };
  }

  const coverage = await db
    .select({
      planId: accessPlanEntity.planId,
      entityId: accessPlanEntity.entityId,
    })
    .from(accessPlanEntity);

  const months = await db
    .select({
      assignmentId: membershipMonth.assignmentId,
      month: membershipMonth.month,
      paid: membershipMonth.paid,
    })
    .from(membershipMonth)
    .where(
      and(
        inArray(
          membershipMonth.assignmentId,
          held.map((a) => a.id),
        ),
        inArray(membershipMonth.month, [...new Set([nowMonth, sessionMonth])]),
      ),
    );

  // A membership only counts in the months its period covers (ADR 129), so a
  // plan that ended in October takes nothing with it into October and its
  // successor takes nothing back out of September.
  const forMonth = (month: string): ApplicableAssignment[] =>
    held
      .filter((a) => appliesInMonth(a, month))
      .map((a) => ({
        id: a.id,
        status: a.status as ApplicableAssignment["status"],
        entityIds: coverage
          .filter((c) => c.planId === a.planId)
          .map((c) => c.entityId),
        paid:
          months.find((m) => m.assignmentId === a.id && m.month === month)
            ?.paid ?? false,
        deadline: payDeadline({
          month,
          startMonth: a.startMonth,
          // The day they joined only counts in the month they joined.
          joinedOn: a.createdAt.toISOString().slice(0, 10),
          policy: calendar,
        }),
      }));

  const nowAssignments = forMonth(nowMonth);
  return {
    now: membershipAccess({
      entityId: input.entityId,
      membership: input.membership,
      assignments: nowAssignments,
      at: input.now,
    }),
    atSession: membershipAccess({
      entityId: input.entityId,
      membership: input.membership,
      assignments:
        sessionMonth === nowMonth ? nowAssignments : forMonth(sessionMonth),
      at: sessionAt,
    }),
    assignments: nowAssignments,
  };
}

/** Why one person is on a branch's roster, and where they stand. */
export interface RosterStanding {
  /** They hold a membership of THIS branch: they joined it, or were added. */
  enrolled: boolean;
  /** A shared membership of theirs covers this branch. */
  covered: boolean;
  /** The plans that cover them here, for the roster to name. */
  planNames: string[];
  verdict: AccessVerdict;
}

/**
 * Where every person on one roster stands, in three queries rather than three
 * per person (ADR 126).
 *
 * `enrolled` and `covered` are separate answers on purpose. Somebody can be on
 * this branch's roster because they joined it, because a shared membership
 * reaches it, or both, and the screen has to be able to say which: a person
 * whose plan covers the gym is a MEMBER of the gym, not a visitor, and calling
 * them one would be the interface disagreeing with the access rules.
 */
export async function loadRosterStanding(
  db: TenantTx,
  input: {
    entityId: string;
    people: { userId: string; status: string }[];
    now: Date;
  },
): Promise<Map<string, RosterStanding>> {
  const answer = new Map<string, RosterStanding>();
  if (input.people.length === 0) return answer;

  const userIds = input.people.map((p) => p.userId);
  const held = await db
    .select({
      id: accessAssignment.id,
      userId: accessAssignment.userId,
      status: accessAssignment.status,
      planId: accessAssignment.planId,
      planName: accessPlan.name,
      startMonth: accessAssignment.startMonth,
      endMonth: accessAssignment.endMonth,
      createdAt: accessAssignment.createdAt,
    })
    .from(accessAssignment)
    .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
    .where(inArray(accessAssignment.userId, userIds));

  const calendar = await membershipCalendar(db);
  const month = monthOf(input.now, calendar.timeZone);
  const coverage = held.length
    ? await db
        .select({
          planId: accessPlanEntity.planId,
          entityId: accessPlanEntity.entityId,
        })
        .from(accessPlanEntity)
    : [];
  const months = held.length
    ? await db
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

  for (const person of input.people) {
    const theirs = held
      .filter((a) => a.userId === person.userId && appliesInMonth(a, month))
      .map((a) => ({
        id: a.id,
        status: a.status as ApplicableAssignment["status"],
        planName: a.planName,
        entityIds: coverage
          .filter((c) => c.planId === a.planId)
          .map((c) => c.entityId),
        paid: months.find((m) => m.assignmentId === a.id)?.paid ?? false,
        deadline: payDeadline({
          month,
          startMonth: a.startMonth,
          joinedOn: a.createdAt.toISOString().slice(0, 10),
          policy: calendar,
        }),
      }));
    const covering = theirs.filter(
      (a) => a.status === "active" && a.entityIds.includes(input.entityId),
    );
    answer.set(person.userId, {
      enrolled: true,
      covered: covering.length > 0,
      planNames: [...new Set(covering.map((a) => a.planName))].sort(),
      verdict: membershipAccess({
        entityId: input.entityId,
        membership: { status: person.status },
        assignments: theirs,
        at: input.now,
      }),
    });
  }
  return answer;
}

/** One booked session whose branch will not admit the member when it starts. */
export interface BookingToReview {
  participationId: string;
  classId: string;
  entityId: string;
  title: string;
  startsAt: Date;
  userId: string;
  name: string;
  /** Why it needs a look. Never "the month is unpaid": that is the dues gate. */
  reason: "not-covered" | "suspended";
}

/**
 * Future bookings at ONE branch that the member will not be admitted to when
 * the session starts (ADR 129).
 *
 * Losing coverage cancels nothing, so this is what replaces a cancellation: the
 * reservation stays, and the gym gets a list to settle. It is DERIVED from the
 * bookings and the access rules as they stand, so restoring coverage or
 * cancelling the booking removes the item with no second write, and there is no
 * booking status and no task table to keep in step.
 *
 * An unpaid month is deliberately not a reason. That is the dues gate's job and
 * the overdue sweep's, and mixing the two would hide a coverage problem inside
 * a payment one.
 */
export async function bookingsNeedingReview(
  db: TenantTx,
  input: {
    entityId: string;
    now: Date;
    /** Narrow to one person, for a preview about them. */
    userId?: string;
    limit: number;
  },
): Promise<BookingToReview[]> {
  const booked = await db
    .select({
      participationId: classParticipation.id,
      classId: classParticipation.classId,
      userId: classParticipation.studentId,
      name: user.name,
      title: classInstance.title,
      startsAt: classInstance.startsAt,
    })
    .from(classParticipation)
    .innerJoin(classInstance, eq(classInstance.id, classParticipation.classId))
    .innerJoin(user, eq(user.id, classParticipation.studentId))
    .where(
      and(
        eq(classParticipation.bookingStatus, "booked"),
        gt(classInstance.startsAt, input.now),
        isNull(classInstance.deletedAt),
        input.userId
          ? eq(classParticipation.studentId, input.userId)
          : undefined,
      ),
    )
    .orderBy(asc(classInstance.startsAt))
    .limit(input.limit);
  if (booked.length === 0) return [];

  const userIds = [...new Set(booked.map((b) => b.userId))];
  const calendar = await membershipCalendar(db);
  const held = await db
    .select({
      id: accessAssignment.id,
      userId: accessAssignment.userId,
      status: accessAssignment.status,
      planId: accessAssignment.planId,
      startMonth: accessAssignment.startMonth,
      endMonth: accessAssignment.endMonth,
    })
    .from(accessAssignment)
    .where(inArray(accessAssignment.userId, userIds));
  const coverage = await db
    .select({
      planId: accessPlanEntity.planId,
      entityId: accessPlanEntity.entityId,
    })
    .from(accessPlanEntity);
  const standing = await db
    .select({
      userId: entityMembership.userId,
      status: entityMembership.status,
    })
    .from(entityMembership)
    .where(inArray(entityMembership.userId, userIds));

  const items: BookingToReview[] = [];
  for (const b of booked) {
    const month = monthOf(b.startsAt, calendar.timeZone);
    // The session's own month decides, not today's: a booking three weeks out
    // is judged against the membership that will be running then.
    const covers = held.some(
      (a) =>
        a.userId === b.userId &&
        a.status === "active" &&
        appliesInMonth(a, month) &&
        coverage.some(
          (c) => c.planId === a.planId && c.entityId === input.entityId,
        ),
    );
    const local = standing.find((m) => m.userId === b.userId)?.status;
    const blocked =
      local !== undefined && local !== "active" && local !== "pending";
    if (!blocked && covers) continue;
    items.push({
      participationId: b.participationId,
      classId: b.classId,
      entityId: input.entityId,
      title: b.title,
      startsAt: b.startsAt,
      userId: b.userId,
      name: b.name,
      reason: blocked ? "suspended" : "not-covered",
    });
  }
  return items;
}
