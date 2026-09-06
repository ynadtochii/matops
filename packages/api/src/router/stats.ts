import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { DbExec, MemberRow } from "@matops/db";
import type {
  ClassMark,
  CoachClass,
  CoachWindowKey,
  DirectoryEntry,
  EntityMetricInput,
  EntitySummary,
  PaymentTally,
} from "@matops/domain";
import {
  and,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  sql,
  withScope,
} from "@matops/db";
import {
  accessAssignment,
  classInstance,
  classParticipation,
  dropIn,
  membershipMonth,
  paymentClaim,
} from "@matops/db/schema";
import {
  appliesInMonth,
  canReadCoachFigures,
  classifyDrift,
  COACH_WINDOWS,
  coachBreakdown,
  coachWindowRange,
  coachWorkload,
  coachWorkloadFor,
  combineDirectory,
  combineEntitySummaries,
  groupMoneyByCurrency,
  gymInsights,
  isActiveMember,
  isOnRoster,
  isStaff,
  monthBucket,
  monthOf,
  monthVerdict,
  newMemberCounts,
  organizationMetrics,
  runsBranch,
  trainingStats,
} from "@matops/domain";
import {
  CoachDetailSchema,
  CoachStatsSchema,
  OrganizationWindowSchema,
} from "@matops/validators";

import type { TimeZoneCtx } from "../academy-tz";
import type { MemberScope } from "../members";
import { academyTimeZone } from "../academy-tz";
import { rosterOf, staffAmong, nameByUser as userNames } from "../members";
import { loadRosterStanding } from "../membership-access";
import { membershipCalendar } from "../membership-status";
import { readOrganizationEntities } from "../organization-read";
import {
  branchManagerProcedure,
  enrolledProcedure,
  organizationManagerIdentityProcedure,
  staffProcedure,
} from "../trpc";

/**
 * How far back the revenue read pulls confirmed claims. This month plus last
 * month is at most 62 days on any calendar; 70 leaves room for the academy time
 * zone shifting a boundary either way. The exact month split is done in code
 * with `monthBucket`, so this bound only keeps the query from growing forever.
 */
const REVENUE_WINDOW_DAYS = 70;

/** Days of marked attendance the gym-insights window looks back over. */
const GYM_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The rows every O10 read needs: classes whose START falls in the window, plus
 * the attendance marks on them. Two bounded queries on the RLS-scoped `ctx.db`,
 * both covered by `cl_by_academy_start` / `cp_by_academy_class`; the aggregation
 * itself is the pure `@matops/domain` coach engine.
 *
 * Soft-deleted classes are excluded — they never happened as far as the gym is
 * concerned. Cancelled ones are kept, because a cancellation is a fact the O10
 * card reports.
 */
type TenantDb = TimeZoneCtx["db"];

async function readCoachRows(
  db: TenantDb,
  range: { from: Date; to: Date },
): Promise<{ classes: CoachClass[]; marks: ClassMark[] }> {
  const rows = await db
    .select({
      id: classInstance.id,
      instructorId: classInstance.instructorId,
      startsAt: classInstance.startsAt,
      durationMinutes: classInstance.durationMinutes,
      title: classInstance.title,
      discipline: classInstance.discipline,
      status: classInstance.status,
    })
    .from(classInstance)
    .where(
      and(
        gte(classInstance.startsAt, range.from),
        lt(classInstance.startsAt, range.to),
        isNull(classInstance.deletedAt),
      ),
    );
  const marked = await db
    .select({
      classId: classParticipation.classId,
      studentId: classParticipation.studentId,
      status: classParticipation.attendanceStatus,
    })
    .from(classParticipation)
    .innerJoin(classInstance, eq(classParticipation.classId, classInstance.id))
    .where(
      and(
        inArray(classParticipation.attendanceStatus, ["present", "absent"]),
        gte(classInstance.startsAt, range.from),
        lt(classInstance.startsAt, range.to),
        isNull(classInstance.deletedAt),
      ),
    );
  return {
    // A session nobody taught has no coach to credit, so it leaves the workload
    // report rather than being attributed to a placeholder (ADR 126).
    classes: rows.flatMap(({ status, instructorId, ...c }) =>
      instructorId === null
        ? []
        : [{ ...c, instructorId, cancelled: status === "cancelled" }],
    ),
    // The `where` already excludes `unmarked`; narrow rather than assert so the
    // compiler proves it instead of taking our word for it.
    marks: marked.flatMap((m) =>
      m.status === "unmarked" ? [] : [{ ...m, status: m.status }],
    ),
  };
}

/**
 * Everything both O10 reads need, from one academy read: the resolved window,
 * its classes and marks, the name-ordered active roster, and a name for every
 * member so a coach who has left still shows their own.
 */
async function loadCoachContext(
  ctx: MemberScope & { db: TenantDb },
  windowKey: CoachWindowKey,
) {
  const now = new Date();
  const timeZone = await academyTimeZone(ctx);
  const range = coachWindowRange(COACH_WINDOWS[windowKey], now, timeZone);
  const { classes, marks } = await readCoachRows(ctx.db, range);
  const members = await rosterOf(ctx);
  return {
    now,
    timeZone,
    range,
    classes,
    marks,
    instructorIds: staffAmong(members).map((m) => m.userId),
    nameByUser: userNames(members),
  };
}

/**
 * One branch's numbers for the organization overview, read in its own scope.
 *
 * Everything here is per branch. Turning branch figures into people figures is
 * `organizationMetrics`'s job, and the split is deliberate: a query cannot know
 * that the same person also trains next door.
 */
async function readEntityMetrics(
  entity: { id: string; name: string },
  organizationId: string,
  baseDb: DbExec,
  window: { from: Date; to: Date; now: Date },
): Promise<EntityMetricInput> {
  return withScope(
    { organizationId, entityId: entity.id },
    async (db) => {
      const members = await rosterOf({ academyId: entity.id, db });
      const standing = await loadRosterStanding(db, {
        entityId: entity.id,
        people: members.map((m) => ({ userId: m.userId, status: m.status })),
        now: window.now,
      });

      const present = await db
        .select({ studentId: classParticipation.studentId })
        .from(classParticipation)
        .innerJoin(
          classInstance,
          eq(classInstance.id, classParticipation.classId),
        )
        .where(
          and(
            eq(classParticipation.attendanceStatus, "present"),
            gte(classInstance.startsAt, window.from),
            lt(classInstance.startsAt, window.to),
          ),
        );

      const sessions = await db
        .select({
          capacity: classInstance.capacity,
          reserved: classInstance.bookingCount,
        })
        .from(classInstance)
        .where(
          and(
            gte(classInstance.startsAt, window.from),
            lt(classInstance.startsAt, window.to),
            ne(classInstance.status, "cancelled"),
            isNull(classInstance.deletedAt),
          ),
        );

      return {
        entityId: entity.id,
        entityName: entity.name,
        activated: true,
        members: members.map((m) => ({
          userId: m.userId,
          role: m.role,
          status: m.status,
          joinedAt: m.createdAt,
        })),
        eligibleUserIds: [...standing.entries()]
          .filter(([, v]) => v.verdict === "ok")
          .map(([userId]) => userId),
        attendedUserIds: [...new Set(present.map((p) => p.studentId))],
        visits: present.length,
        sessions,
      };
    },
    baseDb,
  );
}

/**
 * Every shared membership's standing for the current month, counted ONCE.
 *
 * Read in an organization scope rather than per entity, because the record is
 * the organization's: counting it per covered branch would say a gym with two
 * branches has twice the memberships it sold.
 */
async function readPaymentTally(
  organizationId: string,
  baseDb: DbExec,
  now: Date,
): Promise<PaymentTally> {
  return withScope(
    { organizationId },
    async (db) => {
      const tally: PaymentTally = { paid: 0, withinGrace: 0, blocked: 0 };
      const held = await db
        .select({
          id: accessAssignment.id,
          startMonth: accessAssignment.startMonth,
          endMonth: accessAssignment.endMonth,
          createdAt: accessAssignment.createdAt,
        })
        .from(accessAssignment)
        .where(eq(accessAssignment.status, "active"));
      if (held.length === 0) return tally;

      const calendar = await membershipCalendar(db);
      const month = monthOf(now, calendar.timeZone);
      const months = await db
        .select({
          assignmentId: membershipMonth.assignmentId,
          paid: membershipMonth.paid,
        })
        .from(membershipMonth)
        .where(eq(membershipMonth.month, month));

      for (const a of held.filter((r) => appliesInMonth(r, month))) {
        const paid = months.find((m) => m.assignmentId === a.id)?.paid ?? false;
        const verdict = monthVerdict({
          month,
          startMonth: a.startMonth,
          joinedOn: a.createdAt.toISOString().slice(0, 10),
          policy: calendar,
          paid,
          now,
        });
        if (verdict === "paid") tally.paid += 1;
        else if (verdict === "within-grace") tally.withinGrace += 1;
        else tally.blocked += 1;
      }
      return tally;
    },
    baseDb,
  );
}

/**
 * One branch's slice of the organization directory.
 *
 * Attendance is counted per branch and stays that way on the badge, so a branch
 * total is never mistaken for a head count of people.
 */
async function readEntityDirectory(
  entity: { id: string; name: string },
  organizationId: string,
  baseDb: DbExec,
  window: { now: Date; since: Date },
): Promise<DirectoryEntry[]> {
  return withScope(
    { organizationId, entityId: entity.id },
    async (db) => {
      const members = await rosterOf({ academyId: entity.id, db });
      if (members.length === 0) return [];

      const standing = await loadRosterStanding(db, {
        entityId: entity.id,
        people: members.map((m) => ({ userId: m.userId, status: m.status })),
        now: window.now,
      });

      const visits = await db
        .select({
          studentId: classParticipation.studentId,
          count: sql<number>`count(*)::int`,
        })
        .from(classParticipation)
        .innerJoin(
          classInstance,
          eq(classInstance.id, classParticipation.classId),
        )
        .where(
          and(
            eq(classParticipation.attendanceStatus, "present"),
            gte(classInstance.startsAt, window.since),
          ),
        )
        .groupBy(classParticipation.studentId);
      const visitByUser = new Map(visits.map((v) => [v.studentId, v.count]));

      return members.map((m) => {
        const seen = standing.get(m.userId);
        return {
          entityId: entity.id,
          entityName: entity.name,
          memberId: m.memberId,
          userId: m.userId,
          name: m.name,
          email: m.email,
          status: m.status,
          role: m.role,
          invitedRole: m.invitedRole,
          covered: seen?.covered ?? false,
          planNames: seen?.planNames ?? [],
          verdict: seen?.verdict ?? null,
          recentVisits: visitByUser.get(m.userId) ?? 0,
        };
      });
    },
    baseDb,
  );
}

/**
 * One academy's row for the overview, read through the same helpers its own
 * dashboard uses: the roster, the academy time zone and the confirmed-revenue
 * reader. Nothing here is a second implementation of a figure the entity
 * dashboard already shows.
 */
async function readEntitySummary(
  entity: { id: string; name: string },
  organizationId: string,
  baseDb: DbExec,
  now: Date,
): Promise<EntitySummary> {
  return withScope(
    { organizationId, entityId: entity.id },
    async (db) => {
      const scope = { academyId: entity.id, db };
      const timeZone = await academyTimeZone(scope);
      const members = await rosterOf(scope);
      const revenue = await readRevenue(scope, now, timeZone);

      const [leads] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(dropIn)
        .where(eq(dropIn.stage, "new"));
      const [claims] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(paymentClaim)
        .where(eq(paymentClaim.status, "pending"));
      const [classes] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(classInstance)
        .where(
          and(
            gte(classInstance.startsAt, now),
            lt(classInstance.startsAt, new Date(now.getTime() + 7 * DAY_MS)),
            ne(classInstance.status, "cancelled"),
            isNull(classInstance.deletedAt),
          ),
        );

      return {
        entityId: entity.id,
        name: entity.name,
        timeZone,
        memberUserIds: members.filter(isActiveMember).map((m) => m.userId),
        pendingMembers: members.filter((m) => m.status === "pending").length,
        newLeads: leads?.n ?? 0,
        openClaims: claims?.n ?? 0,
        upcomingClasses: classes?.n ?? 0,
        revenue: revenue.map((r) => ({
          currency: r.currency,
          amountMinor: r.amountMinor,
        })),
      };
    },
    baseDb,
  );
}

/**
 * Personal & gym statistics derived from stored attendance (v1.2 — ADR 39). A
 * "session" is a `present` participation joined to its class; all reads run on
 * the RLS-scoped `ctx.db`, so every number is per-academy. The math is the pure
 * `@matops/domain` stats engine; this router only fetches rows and picks the
 * academy time zone.
 */
type DashboardScope = MemberScope & { db: TenantDb };

async function readGymInsights(
  ctx: DashboardScope,
  now: Date,
  timeZone: string,
  members: MemberRow[] | null,
) {
  const windowStart = new Date(
    now.getTime() - GYM_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const marked = await ctx.db
    .select({
      startsAt: classInstance.startsAt,
      title: classInstance.title,
      discipline: classInstance.discipline,
      status: classParticipation.attendanceStatus,
    })
    .from(classParticipation)
    .innerJoin(classInstance, eq(classParticipation.classId, classInstance.id))
    .where(
      and(
        inArray(classParticipation.attendanceStatus, ["present", "absent"]),
        gte(classInstance.startsAt, windowStart),
      ),
    );
  const newMembers = members
    ? newMemberCounts(
        members
          .filter(isOnRoster)
          .map((m) => monthBucket(m.createdAt, timeZone)),
        monthBucket(now, timeZone),
      )
    : null;
  return {
    ...gymInsights(
      // The `where` already excludes `unmarked`; narrow rather than assert so
      // the compiler proves it instead of taking our word for it.
      marked.flatMap((r) =>
        r.status === "unmarked" ? [] : [{ ...r, status: r.status }],
      ),
      now,
      timeZone,
    ),
    newMembers,
  };
}

async function readRevenue(ctx: DashboardScope, now: Date, timeZone: string) {
  const windowStart = new Date(
    now.getTime() - REVENUE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const rows = await ctx.db
    .select({
      amountMinor: paymentClaim.amountMinor,
      currency: paymentClaim.currency,
      confirmedAt: paymentClaim.confirmedAt,
    })
    .from(paymentClaim)
    .where(
      and(
        eq(paymentClaim.status, "confirmed"),
        gte(paymentClaim.confirmedAt, windowStart),
      ),
    );
  const thisBucket = monthBucket(now, timeZone);
  const inMonth = (bucket: number) =>
    groupMoneyByCurrency(
      rows.filter(
        (r) =>
          r.confirmedAt !== null &&
          monthBucket(r.confirmedAt, timeZone) === bucket,
      ),
    );
  const current = inMonth(thisBucket);
  const previous = new Map(
    inMonth(thisBucket - 1).map((m) => [m.currency, m.amountMinor]),
  );
  const currencies = new Set([
    ...current.map((m) => m.currency),
    ...previous.keys(),
  ]);
  return [...currencies].sort().map((currency) => ({
    currency,
    amountMinor: current.find((m) => m.currency === currency)?.amountMinor ?? 0,
    previousMinor: previous.get(currency) ?? 0,
  }));
}

async function readDrifting(
  ctx: DashboardScope,
  now: Date,
  members: MemberRow[],
) {
  const lastByStudent = await ctx.db
    .select({
      studentId: classParticipation.studentId,
      last: sql<string>`max(${classInstance.startsAt})`,
    })
    .from(classParticipation)
    .innerJoin(classInstance, eq(classParticipation.classId, classInstance.id))
    .where(eq(classParticipation.attendanceStatus, "present"))
    .groupBy(classParticipation.studentId);
  const lastByUser = new Map(
    lastByStudent.map((r) => [r.studentId, new Date(r.last)]),
  );

  return members
    .filter((m) => isActiveMember(m) && !isStaff(m) && lastByUser.has(m.userId))
    .map((m) => {
      const lastAttendance = lastByUser.get(m.userId) ?? null;
      return {
        memberId: m.memberId,
        name: m.name,
        lastAttendance,
        drift: classifyDrift(lastAttendance, now),
      };
    })
    .filter((m) => m.drift !== "active")
    .sort(
      (a, b) =>
        (a.lastAttendance?.getTime() ?? 0) - (b.lastAttendance?.getTime() ?? 0),
    );
}

export const statsRouter = {
  /**
   * The caller's own training summary (spec S7, mobile "My Training" card).
   * Pending members may call it — they just have no present rows yet.
   */
  me: enrolledProcedure.query(async ({ ctx }) => {
    const sessions = await ctx.db
      .select({
        startsAt: classInstance.startsAt,
        discipline: classInstance.discipline,
        title: classInstance.title,
      })
      .from(classParticipation)
      .innerJoin(
        classInstance,
        eq(classParticipation.classId, classInstance.id),
      )
      .where(
        and(
          eq(classParticipation.studentId, ctx.session.user.id),
          eq(classParticipation.attendanceStatus, "present"),
        ),
      );
    const timeZone = await academyTimeZone(ctx);
    return trainingStats(sessions, new Date(), timeZone);
  }),

  /**
   * Everything the O1 dashboard's lower half needs, in one read (ADR 98).
   * Gym-activity insights (spec O1, C.1), who is drifting (C.1/C.2) and the
   * month's confirmed revenue used to be three owner/staff procedures. They
   * each opened their own tenant transaction, each re-read the academy time
   * zone, and two of them each read the roster.
   *
   * Staff-tier, because insights are staff-visible and every value in them is
   * an aggregate with no names. The three owner-only figures come back `null`
   * for an instructor and their reads are skipped, which is the shape `gym`
   * already used for `newMembers` (spec O1, D.4).
   */
  dashboard: staffProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const timeZone = await academyTimeZone(ctx);
    const owner = runsBranch(ctx.membership);
    const members = owner ? await rosterOf(ctx) : null;

    return {
      insights: await readGymInsights(ctx, now, timeZone, members),
      drifting: members ? await readDrifting(ctx, now, members) : null,
      revenue: owner ? await readRevenue(ctx, now, timeZone) : null,
    };
  }),

  /**
   * Every academy the organization runs, and the totals across them (ADR 124,
   * Decision 14). Owner-only, and the authorization happens BEFORE any entity
   * is enumerated: a non-owner never learns that a sibling mat exists.
   *
   * Each academy is read inside its own exact scope, one transaction per
   * entity, and the rows are combined by a pure function afterwards. There is
   * no organization-wide query and no relaxed policy: entity isolation is
   * exactly what it is on every other screen. That is slower than one big read
   * and it is the point, because the alternative is a mode where one query can
   * see two mats at once. No metrics projection until a measurement asks for
   * one (the plan's follow-up slices).
   */
  organization: organizationManagerIdentityProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const entities = await readOrganizationEntities(
      ctx.organizationId,
      ctx.baseDb,
    );
    const summaries: EntitySummary[] = [];
    for (const entity of entities) {
      summaries.push(
        await readEntitySummary(entity, ctx.organizationId, ctx.baseDb, now),
      );
    }
    return combineEntitySummaries(summaries);
  }),

  /**
   * One row per PERSON across the whole organization (ADR 126). Owner-only, and
   * the authorization happens before any entity is enumerated, exactly as
   * `organization` above does: a non-owner never learns a sibling mat exists.
   *
   * Read the same way too, one transaction per entity in its own exact scope,
   * combined by a pure function afterwards. There is no organization-wide query
   * over the tenant tables and no relaxed policy. Slower than one big read, and
   * that is the point.
   *
   * Grouping is by USER ID, never by display name: two people called Ana Silva
   * are two people, and merging them would put one member's attendance on
   * another's row.
   */
  organizationMembers: organizationManagerIdentityProcedure.query(
    async ({ ctx }) => {
      const now = new Date();
      const since = new Date(now.getTime() - 30 * DAY_MS);
      const entities = await readOrganizationEntities(
        ctx.organizationId,
        ctx.baseDb,
      );

      const entries: DirectoryEntry[] = [];
      for (const entity of entities) {
        entries.push(
          ...(await readEntityDirectory(
            entity,
            ctx.organizationId,
            ctx.baseDb,
            { now, since },
          )),
        );
      }
      return {
        entities,
        rows: combineDirectory(entries),
      };
    },
  ),

  /**
   * The organization's own figures over a window (ADR 126). Owner-only, one
   * scoped read per entity, combined by a pure function.
   *
   * A PERSON is counted once however many branches they belong to; a BRANCH
   * figure is an enrolment or a visit and may count them again. The two are
   * named apart in the payload for that reason, and are never added together.
   *
   * No revenue. A paid/unpaid tracker records that somebody ticked a box, which
   * is not the same as money arriving, and reporting it as income would be the
   * dashboard claiming more than it knows.
   */
  organizationMetrics: organizationManagerIdentityProcedure
    .input(OrganizationWindowSchema.optional())
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const to = input?.to ? new Date(input.to) : now;
      const from = input?.from
        ? new Date(input.from)
        : new Date(to.getTime() - 30 * DAY_MS);
      const entities = await readOrganizationEntities(
        ctx.organizationId,
        ctx.baseDb,
      );

      const rows: EntityMetricInput[] = [];
      for (const entity of entities) {
        rows.push(
          await readEntityMetrics(entity, ctx.organizationId, ctx.baseDb, {
            from,
            to,
            now,
          }),
        );
      }
      const payment = await readPaymentTally(
        ctx.organizationId,
        ctx.baseDb,
        now,
      );
      return {
        from,
        to,
        ...organizationMetrics(rows, payment, { from, to }),
      };
    }),

  /**
   * Every coach's workload over the window (spec O10, K.3). Owner-only: the O10
   * roster compares staff, and ADR 38/52 keeps cross-staff views with the owner.
   * A coach reads their own card through `coach` below.
   *
   * Rows come back name-ordered, with any coach who has left the roster last —
   * dropping their classes would make the per-coach figures stop adding up.
   */
  coaches: branchManagerProcedure
    .input(CoachStatsSchema)
    .query(async ({ ctx, input }) => {
      const { now, range, classes, marks, instructorIds, nameByUser } =
        await loadCoachContext(ctx, input.window);
      const active = new Set(instructorIds);
      return {
        range,
        coaches: coachWorkload({
          classes,
          marks,
          instructorIds,
          now,
          range,
        }).map((row) => ({
          ...row,
          name: nameByUser.get(row.instructorId) ?? "Former coach",
          onStaff: active.has(row.instructorId),
        })),
      };
    }),

  /**
   * One coach's card plus the breakdown behind it (spec O10, K.3). Staff-tier:
   * omit `instructorId` to read your own. Only an owner may name someone else,
   * so an instructor sees their own work and nobody else's.
   */
  coach: staffProcedure
    .input(CoachDetailSchema)
    .query(async ({ ctx, input }) => {
      const instructorId = input.instructorId ?? ctx.session.user.id;
      if (
        !canReadCoachFigures(ctx.membership, instructorId, ctx.session.user.id)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only an owner can read another coach's figures",
        });
      }
      const { now, timeZone, range, classes, marks, nameByUser } =
        await loadCoachContext(ctx, input.window);
      const base = { classes, marks, now, range };
      return {
        instructorId,
        name: nameByUser.get(instructorId) ?? "Former coach",
        range,
        workload: coachWorkloadFor(base, instructorId),
        breakdown: coachBreakdown({ ...base, instructorId, timeZone }),
      };
    }),
} satisfies TRPCRouterRecord;
