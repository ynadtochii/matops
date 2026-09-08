import type { DbReader, TenantTx } from "@matops/db";
import type { AccessVerdict, ApplicableAssignment } from "@matops/domain";
import { and, asc, eq, gt, inArray, isNull, or, sql } from "@matops/db";
import {
  accessAssignment,
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
  organization,
  person,
  user,
} from "@matops/db/schema";
import {
  appliesInMonth,
  isFreeMembershipMonth,
  isStaff,
  membershipAccess,
  monthOf,
  payDeadline,
  priceForMonth,
} from "@matops/domain";

import { membershipCalendar } from "./membership-status";

export async function loadStaffAccess(
  db: DbReader,
  input: { entityIds: string[]; userIds: string[] },
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  if (input.entityIds.length === 0 || input.userIds.length === 0) return result;
  const rows = await db
    .select({
      entityId: entity.id,
      userId: member.userId,
      organizationRole: member.role,
      role: entityMembership.role,
      status: entityMembership.status,
    })
    .from(entity)
    .innerJoin(organization, eq(organization.id, entity.organizationId))
    .innerJoin(member, eq(member.organizationId, entity.organizationId))
    .leftJoin(
      entityMembership,
      and(
        eq(entityMembership.entityId, entity.id),
        eq(entityMembership.userId, member.userId),
      ),
    )
    .where(
      and(
        inArray(entity.id, input.entityIds),
        inArray(member.userId, input.userIds),
        isNull(entity.deletedAt),
        isNull(organization.deletedAt),
      ),
    );
  for (const row of rows) {
    const inherited =
      row.organizationRole === "owner" || row.organizationRole === "manager";
    if (
      !inherited &&
      !isStaff({ role: row.role ?? "student", status: row.status ?? "removed" })
    )
      continue;
    const users = result.get(row.entityId) ?? new Set<string>();
    users.add(row.userId);
    result.set(row.entityId, users);
  }
  return result;
}

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
  accessSource: "staff" | "membership" | null;
}

interface AccessQuery {
  personId?: string;
  accountUserId?: string | null;
  userId?: string;
  entityId: string;
  /** Their standing at this branch, or null for an owner who holds none. */
  membership: { status: string; role?: string } | null;
  now: Date;
  /** When the class starts. Defaults to `now` for a question about today. */
  sessionAt?: Date;
}

export async function loadMembershipAccess(
  db: TenantTx,
  input: AccessQuery,
): Promise<MembershipAccess> {
  const personId = input.personId;
  const accountUserId = input.accountUserId ?? input.userId ?? null;
  const staff = accountUserId
    ? await loadStaffAccess(db, {
        entityIds: [input.entityId],
        userIds: [accountUserId],
      })
    : new Map<string, Set<string>>();
  if (accountUserId && staff.get(input.entityId)?.has(accountUserId)) {
    return {
      now: "ok",
      atSession: "ok",
      assignments: [],
      accessSource: "staff",
    };
  }
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
      startsOn: accessAssignment.startsOn,
      endMonth: accessAssignment.endMonth,
      createdAt: accessAssignment.createdAt,
    })
    .from(accessAssignment)
    .where(personId ? eq(accessAssignment.personId, personId) : sql`false`);

  if (held.length === 0) {
    const verdict = membershipAccess({
      entityId: input.entityId,
      membership: input.membership,
      assignments: [],
      at: input.now,
    });
    return {
      now: verdict,
      atSession: verdict,
      assignments: [],
      accessSource: null,
    };
  }

  const coverage = await db
    .select({
      planId: accessPlanEntity.planId,
      entityId: accessPlanEntity.entityId,
    })
    .from(accessPlanEntity);

  const prices = await db.select().from(accessPlanPrice);

  const months = await db
    .select({
      assignmentId: membershipMonth.assignmentId,
      month: membershipMonth.month,
      status: membershipMonth.status,
      priceMinor: membershipMonth.priceMinor,
      currency: membershipMonth.currency,
      deadline: membershipMonth.deadline,
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

  const holds = personId
    ? await db
        .select({ assignmentId: membershipAccessHold.assignmentId })
        .from(membershipAccessHold)
        .where(
          and(
            eq(membershipAccessHold.personId, personId),
            eq(membershipAccessHold.entityId, input.entityId),
            isNull(membershipAccessHold.resolvedAt),
          ),
        )
    : [];
  const heldAssignmentIds = new Set(holds.map((hold) => hold.assignmentId));

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
        paymentRequired: !isFreeMembershipMonth(
          (() => {
            const recorded = months.find(
              (m) => m.assignmentId === a.id && m.month === month,
            );
            return recorded?.priceMinor !== null &&
              recorded?.priceMinor !== undefined &&
              recorded.currency
              ? {
                  priceMinor: recorded.priceMinor,
                  currency: recorded.currency,
                }
              : priceForMonth(
                  prices.filter((p) => p.planId === a.planId),
                  month,
                );
          })(),
        ),
        paid:
          months.find((m) => m.assignmentId === a.id && m.month === month)
            ?.status === "confirmed",
        paymentStatus:
          (months.find((m) => m.assignmentId === a.id && m.month === month)
            ?.status as ApplicableAssignment["paymentStatus"]) ?? "unpaid",
        held: heldAssignmentIds.has(a.id),
        deadline:
          months.find((m) => m.assignmentId === a.id && m.month === month)
            ?.deadline ??
          payDeadline({
            month,
            startMonth: a.startMonth,
            joinedOn: a.startsOn,
            policy: calendar,
          }),
      }));

  const nowAssignments = forMonth(nowMonth);
  const nowVerdict = membershipAccess({
    entityId: input.entityId,
    membership: input.membership,
    assignments: nowAssignments,
    at: input.now,
  });
  const sessionVerdict = membershipAccess({
    entityId: input.entityId,
    membership: input.membership,
    assignments:
      sessionMonth === nowMonth ? nowAssignments : forMonth(sessionMonth),
    at: sessionAt,
  });
  return {
    now: nowVerdict,
    atSession: sessionVerdict,
    assignments: nowAssignments,
    accessSource: nowAssignments.some(
      (a) => a.status === "active" && a.entityIds.includes(input.entityId),
    )
      ? "membership"
      : null,
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
  accessSource: "staff" | "membership" | null;
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
    people: { userId: string; status: string; role?: string }[];
    now: Date;
  },
): Promise<Map<string, RosterStanding>> {
  const answer = new Map<string, RosterStanding>();
  if (input.people.length === 0) return answer;

  const userIds = input.people.map((p) => p.userId);
  const staff = await loadStaffAccess(db, {
    entityIds: [input.entityId],
    userIds,
  });
  const held = await db
    .select({
      id: accessAssignment.id,
      personId: person.id,
      accountUserId: person.accountUserId,
      status: accessAssignment.status,
      planId: accessAssignment.planId,
      planName: accessPlan.name,
      startMonth: accessAssignment.startMonth,
      endMonth: accessAssignment.endMonth,
      createdAt: accessAssignment.createdAt,
    })
    .from(accessAssignment)
    .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
    .innerJoin(person, eq(person.id, accessAssignment.personId))
    .where(
      or(inArray(person.id, userIds), inArray(person.accountUserId, userIds)),
    );
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

  const prices = held.length ? await db.select().from(accessPlanPrice) : [];

  for (const person of input.people) {
    const theirs = held
      .filter(
        (a) =>
          (a.personId === person.userId || a.accountUserId === person.userId) &&
          appliesInMonth(a, month),
      )
      .map((a) => ({
        id: a.id,
        status: a.status as ApplicableAssignment["status"],
        planName: a.planName,
        entityIds: coverage
          .filter((c) => c.planId === a.planId)
          .map((c) => c.entityId),
        paymentRequired: !isFreeMembershipMonth(
          priceForMonth(
            prices.filter((p) => p.planId === a.planId),
            month,
          ),
        ),
        paid:
          months.find((m) => m.assignmentId === a.id)?.status === "confirmed",
        paymentStatus:
          (months.find((m) => m.assignmentId === a.id)
            ?.status as ApplicableAssignment["paymentStatus"]) ?? "unpaid",
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
      accessSource: staff.get(input.entityId)?.has(person.userId)
        ? "staff"
        : covering.length > 0
          ? "membership"
          : null,
      verdict: staff.get(input.entityId)?.has(person.userId)
        ? "ok"
        : membershipAccess({
            entityId: input.entityId,
            membership: { status: person.status },
            assignments: theirs,
            at: input.now,
          }),
    });
  }
  return answer;
}

/** Bookings read per pass while looking for ones that need a review. */
const REVIEW_SCAN_PAGE = 200;

/** The most bookings one call reads, so a full schedule cannot stall a request. */
const MAX_REVIEW_SCAN = 2000;

/** One booked session whose branch will not admit the member when it starts. */
export interface BookingToReview {
  participationId: string;
  classId: string;
  entityId: string;
  title: string;
  startsAt: Date;
  userId: string;
  personId: string;
  accountUserId: string | null;
  name: string;
  /** Why it needs a look. Never "the month is unpaid": that is the dues gate. */
  reason:
    "not-covered" | "suspended" | "membership-inactive" | "payment-declined";
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
    personId?: string;
    limit: number;
  },
): Promise<BookingToReview[]> {
  const calendar = await membershipCalendar(db);
  const coverage = await db
    .select({
      planId: accessPlanEntity.planId,
      entityId: accessPlanEntity.entityId,
    })
    .from(accessPlanEntity);

  const items: BookingToReview[] = [];
  // The limit counts ITEMS, not bookings read. Cutting the query at it would
  // hide an uncovered session sitting behind fifty covered ones, and report
  // nothing more to find, so the scan keeps reading pages until it has enough.
  for (
    let offset = 0;
    offset < MAX_REVIEW_SCAN && items.length < input.limit;
    offset += REVIEW_SCAN_PAGE
  ) {
    const booked = await db
      .select({
        participationId: classParticipation.id,
        classId: classParticipation.classId,
        personId: classParticipation.personId,
        userId: sql<string>`coalesce(${classParticipation.personId}::text, ${classParticipation.studentId})`,
        accountUserId: sql<
          string | null
        >`coalesce(${person.accountUserId}, ${classParticipation.studentId})`,
        name: sql<string>`coalesce(${person.name}, ${user.name})`,
        title: classInstance.title,
        startsAt: classInstance.startsAt,
      })
      .from(classParticipation)
      .innerJoin(
        classInstance,
        eq(classInstance.id, classParticipation.classId),
      )
      .leftJoin(person, eq(person.id, classParticipation.personId))
      .leftJoin(user, eq(user.id, classParticipation.studentId))
      .where(
        and(
          eq(classParticipation.academyId, input.entityId),
          eq(classParticipation.bookingStatus, "booked"),
          gt(classInstance.startsAt, input.now),
          isNull(classInstance.deletedAt),
          input.personId
            ? eq(
                sql<string>`coalesce(${classParticipation.personId}::text, ${classParticipation.studentId})`,
                input.personId,
              )
            : undefined,
        ),
      )
      .orderBy(asc(classInstance.startsAt), asc(classParticipation.id))
      .limit(REVIEW_SCAN_PAGE)
      .offset(offset);
    if (booked.length === 0) break;

    const personIds = [
      ...new Set(booked.flatMap((b) => (b.personId ? [b.personId] : []))),
    ];
    const accountUserIds = [
      ...new Set(
        booked.flatMap((b) => (b.accountUserId ? [b.accountUserId] : [])),
      ),
    ];
    const held = await db
      .select({
        id: accessAssignment.id,
        userId: accessAssignment.personId,
        status: accessAssignment.status,
        planId: accessAssignment.planId,
        startMonth: accessAssignment.startMonth,
        endMonth: accessAssignment.endMonth,
      })
      .from(accessAssignment)
      .where(inArray(accessAssignment.personId, personIds));
    const holds = personIds.length
      ? await db
          .select({ personId: membershipAccessHold.personId })
          .from(membershipAccessHold)
          .where(
            and(
              inArray(membershipAccessHold.personId, personIds),
              eq(membershipAccessHold.entityId, input.entityId),
              isNull(membershipAccessHold.resolvedAt),
            ),
          )
      : [];
    // This branch's own memberships. Someone active here and suspended at the
    // gym across town must not be read as suspended here (ADR 129).
    const standing = await db
      .select({
        userId: sql<string>`coalesce(${entityMembership.personId}::text, ${entityMembership.userId})`,
        status: entityMembership.status,
      })
      .from(entityMembership)
      .where(
        and(
          eq(entityMembership.entityId, input.entityId),
          or(
            inArray(entityMembership.personId, personIds),
            accountUserIds.length
              ? and(
                  isNull(entityMembership.personId),
                  inArray(entityMembership.userId, accountUserIds),
                )
              : undefined,
          ),
        ),
      );

    const staff = await loadStaffAccess(db, {
      entityIds: [input.entityId],
      userIds: accountUserIds,
    });

    for (const b of booked) {
      if (b.accountUserId && staff.get(input.entityId)?.has(b.accountUserId))
        continue;
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
      const coveredAssignments = held.filter(
        (a) =>
          a.userId === b.userId &&
          appliesInMonth(a, month) &&
          coverage.some(
            (c) => c.planId === a.planId && c.entityId === input.entityId,
          ),
      );
      const paymentDeclined = holds.some(
        (hold) => hold.personId === b.personId,
      );
      const local = standing.find((m) => m.userId === b.userId)?.status;
      const blocked =
        local !== undefined && local !== "active" && local !== "pending";
      if (!paymentDeclined && !blocked && covers) continue;
      items.push({
        participationId: b.participationId,
        classId: b.classId,
        entityId: input.entityId,
        title: b.title,
        startsAt: b.startsAt,
        userId: b.userId,
        personId: b.userId,
        accountUserId: b.accountUserId,
        name: b.name,
        reason: paymentDeclined
          ? "payment-declined"
          : blocked
            ? "suspended"
            : coveredAssignments.length > 0
              ? "membership-inactive"
              : "not-covered",
      });
      if (items.length >= input.limit) break;
    }
    if (booked.length < REVIEW_SCAN_PAGE) break;
  }
  return items;
}
