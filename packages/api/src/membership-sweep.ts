import type { DbExec } from "@matops/db/client";
import { and, eq, gt, inArray, isNull, sql } from "@matops/db";
import {
  accessAssignment,
  accessPlan,
  accessPlanEntity,
  classInstance,
  classParticipation,
  entity,
  membershipMonth,
  membershipPolicy,
} from "@matops/db/schema";
import {
  membershipWarning,
  monthOf,
  monthVerdict,
  payDeadline,
  resolveAcademyTimeZone,
} from "@matops/domain";

import type { PushSender } from "./notify";
import { notifyMembershipDue } from "./notify";

const DEFAULT_MEMBERSHIP_GRACE_DAYS = 7;

export interface CancellationSweepOptions {
  now?: Date;
  /** Most assignments to look at in one run. Keeps a tick bounded. */
  limit?: number;
}

export interface CancellationSweepResult {
  /** Assignments examined. */
  checked: number;
  /** Assignments found past their deadline with no other coverage. */
  blocked: number;
  /** Future bookings cancelled. */
  cancelled: number;
}

interface Calendar {
  graceDays: number;
  timeZone: string;
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
 *    still reaches through a second active, unblocked membership is left alone.
 */
export async function runMembershipCancellationSweep(
  exec: DbExec,
  { now = new Date(), limit = 500 }: CancellationSweepOptions = {},
): Promise<CancellationSweepResult> {
  const live = await exec
    .select({
      id: accessAssignment.id,
      organizationId: accessAssignment.organizationId,
      userId: accessAssignment.userId,
      planId: accessAssignment.planId,
      startMonth: accessAssignment.startMonth,
      createdAt: accessAssignment.createdAt,
    })
    .from(accessAssignment)
    .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
    .where(eq(accessAssignment.status, "active"))
    .limit(limit);
  if (live.length === 0) return { checked: 0, blocked: 0, cancelled: 0 };

  const calendars = await loadCalendars(exec, [
    ...new Set(live.map((a) => a.organizationId)),
  ]);
  const coverage = await exec
    .select({
      planId: accessPlanEntity.planId,
      entityId: accessPlanEntity.entityId,
    })
    .from(accessPlanEntity);
  const entitiesOf = (planId: string) =>
    coverage.filter((c) => c.planId === planId).map((c) => c.entityId);

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

  const isBlocked = (a: (typeof live)[number]): boolean => {
    const calendar = calendars.get(a.organizationId);
    if (!calendar) return false;
    const month = monthOf(now, calendar.timeZone);
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
  let cancelled = 0;
  for (const assignment of blocked) {
    // What this membership covered, minus everything the person still reaches
    // through another membership that is active and not itself blocked.
    const stillCovered = new Set(
      live
        .filter(
          (o) =>
            o.userId === assignment.userId &&
            o.id !== assignment.id &&
            !isBlocked(o),
        )
        .flatMap((o) => entitiesOf(o.planId)),
    );
    const losing = entitiesOf(assignment.planId).filter(
      (id) => !stillCovered.has(id),
    );
    if (losing.length === 0) continue;

    cancelled += await cancelFutureBookings(exec, {
      assignmentId: assignment.id,
      userId: assignment.userId,
      entityIds: losing,
      month: monthOf(
        now,
        calendars.get(assignment.organizationId)?.timeZone ?? "UTC",
      ),
      now,
    });
  }

  return { checked: live.length, blocked: blocked.length, cancelled };
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
    userId: string;
    entityIds: string[];
    month: string;
    now: Date;
  },
): Promise<number> {
  return exec.transaction(async (tx) => {
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
          eq(classParticipation.studentId, input.userId),
          eq(classParticipation.bookingStatus, "booked"),
          inArray(classParticipation.academyId, input.entityIds),
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
    send,
  }: CancellationSweepOptions & { send?: PushSender } = {},
): Promise<ReminderSweepResult> {
  const live = await exec
    .select({
      id: accessAssignment.id,
      organizationId: accessAssignment.organizationId,
      userId: accessAssignment.userId,
      planId: accessAssignment.planId,
      planName: accessPlan.name,
      assigningEntityId: accessAssignment.assigningEntityId,
      startMonth: accessAssignment.startMonth,
      createdAt: accessAssignment.createdAt,
    })
    .from(accessAssignment)
    .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
    .where(eq(accessAssignment.status, "active"))
    .limit(limit);
  if (live.length === 0) return { checked: 0, sent: 0 };

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

  const due: { assignment: (typeof live)[number]; month: string }[] = [];
  for (const assignment of live) {
    const calendar = calendars.get(assignment.organizationId);
    if (!calendar) continue;
    const month = monthOf(now, calendar.timeZone);
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
  if (due.length === 0) return { checked: live.length, sent: 0 };

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
  if (claimed.length === 0) return { checked: live.length, sent: 0 };

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
      if (!warning) return [];
      return [
        {
          academyId,
          userId: assignment.userId,
          headline: warning.headline,
          detail: warning.detail,
        },
      ];
    }),
    exec,
    send,
  );

  return { checked: live.length, sent: claimed.length };
}
