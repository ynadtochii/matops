import type { DbExec } from "@matops/db/client";
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
  membershipMonth,
  membershipPolicy,
} from "@matops/db/schema";
import {
  appliesInMonth,
  isFreeMembershipMonth,
  membershipWarning,
  monthOf,
  monthVerdict,
  payDeadline,
  priceForMonth,
  resolveAcademyTimeZone,
} from "@matops/domain";

import type { PushSender } from "./notify";
import { loadStaffAccess } from "./membership-access";
import { notifyMembershipDue } from "./notify";

const DEFAULT_MEMBERSHIP_GRACE_DAYS = 7;

export interface CancellationSweepOptions {
  now?: Date;
  /** Most assignments to look at in one run. Keeps a tick bounded. */
  limit?: number;
  /** Start after this assignment id. Assignments are read in id order. */
  after?: string;
}

export interface CancellationSweepResult {
  /** Assignments examined. */
  checked: number;
  /** Assignments found past their deadline with no other coverage. */
  blocked: number;
  /** Future bookings cancelled. */
  cancelled: number;
  /** Pass back as `after` to read the next page, or null when there is none. */
  nextCursor: string | null;
}

interface Calendar {
  graceDays: number;
  timeZone: string;
}

interface HeldAssignment {
  id: string;
  organizationId: string;
  userId: string;
  personId: string | null;
  accountUserId: string | null;
  planId: string;
  startMonth: string;
  endMonth: string | null;
  createdAt: Date;
}

interface PaidRow {
  assignmentId: string;
  month: string;
  paid: boolean;
}

/**
 * Cancel the future bookings of a membership whose month went unpaid past the
 * grace window (ADR 126).
 *
 * Runs cross-organization on the BASE connection, like the other sweeps, so it
 * is outside the tenant seam and every read filters by organization itself.
 *
 * Three properties this has to hold, and how:
 *
 *  - **A payment that lands mid-sweep must not lose somebody their class.** The
 *    paid flag is re-read INSIDE the same transaction that does the cancelling,
 *    after the row is locked, so a confirmation racing with this run wins.
 *  - **A place is released exactly once.** The update only matches rows still
 *    `booked`, and only the rows it actually changed decrement a count, so a
 *    retry finds nothing to change and moves nothing.
 *  - **Another valid membership protects its classes.** A branch the person
 *    still reaches through a second active, unblocked membership is left alone,
 *    and every membership they hold is read for that, not only the ones in this
 *    page.
 */
export async function runMembershipCancellationSweep(
  exec: DbExec,
  { now = new Date(), limit = 500, after }: CancellationSweepOptions = {},
): Promise<CancellationSweepResult> {
  const all = await exec
    .select({
      id: accessAssignment.id,
      organizationId: accessAssignment.organizationId,
      userId: sql<string>`coalesce(${accessAssignment.personId}::text, ${accessAssignment.userId})`,
      personId: accessAssignment.personId,
      accountUserId: accessAssignment.userId,
      planId: accessAssignment.planId,
      startMonth: accessAssignment.startMonth,
      endMonth: accessAssignment.endMonth,
      createdAt: accessAssignment.createdAt,
    })
    .from(accessAssignment)
    .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
    .where(
      after
        ? and(
            eq(accessAssignment.status, "active"),
            gt(accessAssignment.id, after),
          )
        : eq(accessAssignment.status, "active"),
    )
    .orderBy(asc(accessAssignment.id))
    .limit(limit);
  const nextCursor =
    all.length === limit ? (all[all.length - 1]?.id ?? null) : null;
  const nothing = { checked: 0, blocked: 0, cancelled: 0, nextCursor };
  if (all.length === 0) return nothing;

  const calendars = await loadCalendars(exec, [
    ...new Set(all.map((a) => a.organizationId)),
  ]);
  // An assignment outside its period is not a reason to cancel anything, and
  // it does not protect anything either (ADR 129). A membership that ended, or
  // a successor that has not started, is simply not in this month's picture.
  const live = all.filter((a) => {
    const calendar = calendars.get(a.organizationId);
    return calendar
      ? appliesInMonth(a, monthOf(now, calendar.timeZone))
      : false;
  });
  if (live.length === 0) return nothing;
  const coverage = await exec
    .select({
      planId: accessPlanEntity.planId,
      entityId: accessPlanEntity.entityId,
    })
    .from(accessPlanEntity);
  const entitiesOf = (planId: string) =>
    coverage.filter((c) => c.planId === planId).map((c) => c.entityId);

  const enforced = new Set(
    (
      await exec
        .select({
          id: entity.id,
          membershipEnforcedAt: entity.membershipEnforcedAt,
        })
        .from(entity)
        .where(
          inArray(
            entity.id,
            coverage.map((c) => c.entityId),
          ),
        )
    )
      .filter((e) => e.membershipEnforcedAt !== null)
      .map((e) => e.id),
  );

  const paidRows = await exec
    .select({
      assignmentId: membershipMonth.assignmentId,
      month: membershipMonth.month,
      paid: membershipMonth.paid,
    })
    .from(membershipMonth)
    .where(
      inArray(
        membershipMonth.assignmentId,
        live.map((a) => a.id),
      ),
    );

  const prices = await exec.select().from(accessPlanPrice);

  const isBlocked = (a: HeldAssignment): boolean => {
    const calendar = calendars.get(a.organizationId);
    if (!calendar) return false;
    const month = monthOf(now, calendar.timeZone);
    if (
      isFreeMembershipMonth(
        priceForMonth(
          prices.filter((p) => p.planId === a.planId),
          month,
        ),
      )
    )
      return false;
    const paid =
      paidRows.find((m) => m.assignmentId === a.id && m.month === month)
        ?.paid ?? false;
    return (
      monthVerdict({
        month,
        startMonth: a.startMonth,
        joinedOn: a.createdAt.toISOString().slice(0, 10),
        policy: calendar,
        paid,
        now,
      }) === "blocked"
    );
  };

  const blocked = live.filter(isBlocked);
  // Every membership these people hold, not only the ones this page read. A
  // paid alternative sitting past the limit protects their classes just as much
  // as one inside it, and cancelling because we did not look would take away
  // classes they are entitled to.
  const held =
    blocked.length === 0 ? [] : await loadAllHeld(exec, blocked, now);
  for (const row of held) {
    paidRows.push(...row.months);
    calendars.set(row.assignment.organizationId, row.calendar);
  }
  const protectors = held
    .map((h) => h.assignment)
    .filter((a) =>
      appliesInMonth(
        a,
        monthOf(now, calendars.get(a.organizationId)?.timeZone ?? "UTC"),
      ),
    );

  let cancelled = 0;
  for (const assignment of blocked) {
    // What this membership covered, minus everything the person still reaches
    // through another membership that is active and not itself blocked.
    const stillCovered = new Set(
      protectors
        .filter(
          (o) =>
            o.userId === assignment.userId &&
            o.id !== assignment.id &&
            !isBlocked(o),
        )
        .flatMap((o) => entitiesOf(o.planId)),
    );
    const losing = entitiesOf(assignment.planId).filter(
      (id) => enforced.has(id) && !stillCovered.has(id),
    );
    if (losing.length === 0) continue;

    cancelled += await cancelFutureBookings(exec, {
      assignmentId: assignment.id,
      organizationId: assignment.organizationId,
      userId: assignment.personId,
      accountUserId: assignment.accountUserId,
      entityIds: losing,
      month: monthOf(
        now,
        calendars.get(assignment.organizationId)?.timeZone ?? "UTC",
      ),
      now,
    });
  }

  return {
    checked: live.length,
    blocked: blocked.length,
    cancelled,
    nextCursor,
  };
}

/**
 * Every active membership the blocked people hold, with the months and
 * calendars needed to judge them. Read separately from the page so a protecting
 * membership is never missed because it sorted after the limit.
 */
async function loadAllHeld(
  exec: DbExec,
  blocked: { userId: string }[],
  now: Date,
): Promise<
  {
    assignment: HeldAssignment;
    calendar: Calendar;
    months: PaidRow[];
  }[]
> {
  const rows = await exec
    .select({
      id: accessAssignment.id,
      organizationId: accessAssignment.organizationId,
      userId: sql<string>`coalesce(${accessAssignment.personId}::text, ${accessAssignment.userId})`,
      personId: accessAssignment.personId,
      accountUserId: accessAssignment.userId,
      planId: accessAssignment.planId,
      startMonth: accessAssignment.startMonth,
      endMonth: accessAssignment.endMonth,
      createdAt: accessAssignment.createdAt,
    })
    .from(accessAssignment)
    .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
    .where(
      and(
        eq(accessAssignment.status, "active"),
        inArray(
          sql<string>`coalesce(${accessAssignment.personId}::text, ${accessAssignment.userId})`,
          [...new Set(blocked.map((b) => b.userId))],
        ),
      ),
    );
  if (rows.length === 0) return [];

  const calendars = await loadCalendars(exec, [
    ...new Set(rows.map((a) => a.organizationId)),
  ]);
  const months = await exec
    .select({
      assignmentId: membershipMonth.assignmentId,
      month: membershipMonth.month,
      paid: membershipMonth.paid,
    })
    .from(membershipMonth)
    .where(
      inArray(
        membershipMonth.assignmentId,
        rows.map((a) => a.id),
      ),
    );

  return rows.flatMap((assignment) => {
    const calendar = calendars.get(assignment.organizationId);
    if (!calendar) return [];
    const month = monthOf(now, calendar.timeZone);
    return [
      {
        assignment,
        calendar,
        months: months.filter(
          (m) => m.assignmentId === assignment.id && m.month === month,
        ),
      },
    ];
  });
}

/** Each organization's grace and zone, falling back the way the readers do. */
async function loadCalendars(
  exec: DbExec,
  organizationIds: string[],
): Promise<Map<string, Calendar>> {
  const policies = await exec
    .select({
      organizationId: membershipPolicy.organizationId,
      graceDays: membershipPolicy.graceDays,
      calendarTimeZone: membershipPolicy.calendarTimeZone,
    })
    .from(membershipPolicy)
    .where(inArray(membershipPolicy.organizationId, organizationIds));
  const homes = await exec
    .select({
      organizationId: entity.organizationId,
      timeZone: entity.timeZone,
    })
    .from(entity)
    .where(
      and(
        inArray(entity.organizationId, organizationIds),
        eq(entity.isDefault, true),
        isNull(entity.deletedAt),
      ),
    );

  return new Map(
    organizationIds.map((id) => {
      const policy = policies.find((p) => p.organizationId === id);
      const home = homes.find((h) => h.organizationId === id);
      return [
        id,
        {
          graceDays: policy?.graceDays ?? DEFAULT_MEMBERSHIP_GRACE_DAYS,
          timeZone:
            policy?.calendarTimeZone ?? resolveAcademyTimeZone(home?.timeZone),
        },
      ];
    }),
  );
}

/**
 * Cancel this person's future bookings at these branches, in one transaction
 * that re-reads the payment first.
 *
 * The re-read is the whole point: a scan can be seconds or minutes old, and an
 * owner ticking the month in that gap must not have their member's classes
 * taken away. The row is locked for update so the check and the cancel cannot
 * be separated by another writer.
 */
async function cancelFutureBookings(
  exec: DbExec,
  input: {
    assignmentId: string;
    organizationId: string;
    userId: string | null;
    accountUserId: string | null;
    entityIds: string[];
    month: string;
    now: Date;
  },
): Promise<number> {
  return exec.transaction(async (tx) => {
    if (input.accountUserId) {
      await tx
        .select({ id: member.id })
        .from(member)
        .where(
          and(
            eq(member.organizationId, input.organizationId),
            eq(member.userId, input.accountUserId),
          ),
        )
        .orderBy(asc(member.id))
        .for("share");
    }
    await tx
      .select({ id: entityMembership.id })
      .from(entityMembership)
      .where(
        and(
          eq(entityMembership.organizationId, input.organizationId),
          or(
            input.userId
              ? eq(entityMembership.personId, input.userId)
              : undefined,
            input.accountUserId
              ? and(
                  isNull(entityMembership.personId),
                  eq(entityMembership.userId, input.accountUserId),
                )
              : undefined,
          ),
          inArray(entityMembership.entityId, input.entityIds),
        ),
      )
      .orderBy(asc(entityMembership.id))
      .for("share");

    const locked = await tx
      .select({ paid: membershipMonth.paid })
      .from(membershipMonth)
      .where(
        and(
          eq(membershipMonth.assignmentId, input.assignmentId),
          eq(membershipMonth.month, input.month),
        ),
      )
      .for("update");
    // Paid while this run was thinking. Leave everything alone.
    if (locked[0]?.paid === true) return 0;

    const staff = input.accountUserId
      ? await loadStaffAccess(tx, {
          entityIds: input.entityIds,
          userIds: [input.accountUserId],
        })
      : new Map<string, Set<string>>();
    const losing = input.entityIds.filter(
      (id) => !input.accountUserId || !staff.get(id)?.has(input.accountUserId),
    );
    if (losing.length === 0) return 0;

    const future = await tx
      .select({
        id: classParticipation.id,
        classId: classParticipation.classId,
        tier: classParticipation.bookingTier,
      })
      .from(classParticipation)
      .innerJoin(
        classInstance,
        eq(classInstance.id, classParticipation.classId),
      )
      .where(
        and(
          or(
            input.userId
              ? eq(classParticipation.personId, input.userId)
              : undefined,
            input.accountUserId
              ? and(
                  isNull(classParticipation.personId),
                  eq(classParticipation.studentId, input.accountUserId),
                )
              : undefined,
          ),
          eq(classParticipation.bookingStatus, "booked"),
          inArray(classParticipation.academyId, losing),
          gt(classInstance.startsAt, input.now),
          isNull(classInstance.deletedAt),
        ),
      );
    if (future.length === 0) return 0;

    // Only rows still `booked` come back, so a retry cancels nothing twice and
    // releases no place twice.
    const done = await tx
      .update(classParticipation)
      .set({ bookingStatus: "cancelled" })
      .where(
        and(
          inArray(
            classParticipation.id,
            future.map((f) => f.id),
          ),
          eq(classParticipation.bookingStatus, "booked"),
        ),
      )
      .returning({
        id: classParticipation.id,
        classId: classParticipation.classId,
        tier: classParticipation.bookingTier,
      });

    // A provisional booking never took a place, so releasing one would push the
    // count below the truth.
    const freed = done
      .filter((d) => d.tier === "confirmed")
      .map((d) => d.classId);
    for (const classId of freed) {
      await tx
        .update(classInstance)
        .set({
          bookingCount: sql`GREATEST(${classInstance.bookingCount} - 1, 0)`,
        })
        .where(eq(classInstance.id, classId));
    }
    return done.length;
  });
}

export interface ReminderSweepResult {
  /** Memberships examined. */
  checked: number;
  /** Members told this run. */
  sent: number;
  nextCursor: string | null;
}

/**
 * Warn about an unpaid month while there is still time to do something (ADR 126).
 *
 * ONE message per membership, never one per covered branch: somebody whose plan
 * covers a mat and a gym owes one payment, so they hear about it once. The
 * message is filed against a single branch, the one the owner assigned it from
 * where that is known, else the first branch the plan covers.
 *
 * Deduplicated by claiming before sending. `membership_month.reminded_at` is
 * stamped in the same statement that finds the unclaimed rows, so a second run,
 * or two runs at once, find nothing left to claim. That mirrors the class
 * reminder cron: a claimed-but-unsent message is lost rather than repeated,
 * which is the right way round for a warning somebody may act on.
 *
 * Only warns inside the grace window. After the deadline the member is blocked
 * and the cancellation sweep has already acted, so another "please pay" would
 * be telling them something they can see for themselves.
 */
export async function runMembershipReminderSweep(
  exec: DbExec,
  {
    now = new Date(),
    limit = 500,
    after,
    send,
  }: CancellationSweepOptions & { send?: PushSender } = {},
): Promise<ReminderSweepResult> {
  const live = await exec
    .select({
      id: accessAssignment.id,
      organizationId: accessAssignment.organizationId,
      userId: sql<string>`coalesce(${accessAssignment.personId}::text, ${accessAssignment.userId})`,
      accountUserId: accessAssignment.userId,
      planId: accessAssignment.planId,
      planName: accessPlan.name,
      assigningEntityId: accessAssignment.assigningEntityId,
      startMonth: accessAssignment.startMonth,
      endMonth: accessAssignment.endMonth,
      createdAt: accessAssignment.createdAt,
    })
    .from(accessAssignment)
    .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
    .where(
      after
        ? and(
            eq(accessAssignment.status, "active"),
            gt(accessAssignment.id, after),
          )
        : eq(accessAssignment.status, "active"),
    )
    .orderBy(asc(accessAssignment.id))
    .limit(limit);
  const nextCursor =
    live.length === limit ? (live[live.length - 1]?.id ?? null) : null;
  if (live.length === 0) return { checked: 0, sent: 0, nextCursor };

  const calendars = await loadCalendars(exec, [
    ...new Set(live.map((a) => a.organizationId)),
  ]);
  const coverage = await exec
    .select({
      planId: accessPlanEntity.planId,
      entityId: accessPlanEntity.entityId,
    })
    .from(accessPlanEntity);

  const months = await exec
    .select({
      assignmentId: membershipMonth.assignmentId,
      month: membershipMonth.month,
      paid: membershipMonth.paid,
      remindedAt: membershipMonth.remindedAt,
    })
    .from(membershipMonth)
    .where(
      inArray(
        membershipMonth.assignmentId,
        live.map((a) => a.id),
      ),
    );

  const prices = await exec.select().from(accessPlanPrice);

  const due: { assignment: (typeof live)[number]; month: string }[] = [];
  for (const assignment of live) {
    const calendar = calendars.get(assignment.organizationId);
    if (!calendar) continue;
    const month = monthOf(now, calendar.timeZone);
    // Nothing is owed on a month the membership does not cover (ADR 129).
    if (
      !appliesInMonth(assignment, month) ||
      isFreeMembershipMonth(
        priceForMonth(
          prices.filter((p) => p.planId === assignment.planId),
          month,
        ),
      )
    )
      continue;
    const held = months.find(
      (m) => m.assignmentId === assignment.id && m.month === month,
    );
    if (held?.paid === true || held?.remindedAt) continue;

    const shared = {
      month,
      startMonth: assignment.startMonth,
      joinedOn: assignment.createdAt.toISOString().slice(0, 10),
      policy: calendar,
    };
    if (monthVerdict({ ...shared, paid: false, now }) !== "within-grace") {
      continue;
    }
    due.push({ assignment, month });
  }
  if (due.length === 0) return { checked: live.length, sent: 0, nextCursor };

  // Claim first. The upsert only stamps a row whose `reminded_at` is still
  // null, so a concurrent run claims nothing and sends nothing.
  const claimed: typeof due = [];
  for (const item of due) {
    const stamped = await exec
      .insert(membershipMonth)
      .values({
        organizationId: item.assignment.organizationId,
        assignmentId: item.assignment.id,
        month: item.month,
        paid: false,
        remindedAt: now,
      })
      .onConflictDoUpdate({
        target: [membershipMonth.assignmentId, membershipMonth.month],
        set: { remindedAt: now },
        setWhere: isNull(membershipMonth.remindedAt),
      })
      .returning({ id: membershipMonth.id });
    if (stamped.length > 0) claimed.push(item);
  }
  if (claimed.length === 0)
    return { checked: live.length, sent: 0, nextCursor };

  await notifyMembershipDue(
    claimed.flatMap(({ assignment, month }) => {
      const calendar = calendars.get(assignment.organizationId);
      if (!calendar) return [];
      const covered = coverage
        .filter((c) => c.planId === assignment.planId)
        .map((c) => c.entityId)
        .sort();
      const academyId = assignment.assigningEntityId ?? covered[0];
      if (!academyId) return [];
      const warning = membershipWarning({
        verdict: "within-grace",
        month,
        deadline: payDeadline({
          month,
          startMonth: assignment.startMonth,
          joinedOn: assignment.createdAt.toISOString().slice(0, 10),
          policy: calendar,
        }),
        planName: assignment.planName,
        timeZone: calendar.timeZone,
      });
      if (!warning || !assignment.accountUserId) return [];
      return [
        {
          academyId,
          userId: assignment.accountUserId,
          headline: warning.headline,
          detail: warning.detail,
        },
      ];
    }),
    exec,
    send,
  );

  return { checked: live.length, sent: claimed.length, nextCursor };
}
