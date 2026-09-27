import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import type { DbExec, MemberRow } from "@matops/db";
import type { ClassMark, CoachClass, CoachWindowKey } from "@matops/domain";
import {
  and,
  attendanceReviewSnapshot,
  eq,
  getEntityInOrganization,
  getEntityMembership,
  gte,
  inArray,
  isNull,
  listMembersOf,
  lt,
  sql,
  withScope,
} from "@matops/db";
import {
  classInstance,
  classParticipation,
  entityMembership,
  membershipMonth,
} from "@matops/db/schema";
import {
  canEnroll,
  canReadCoachFigures,
  classifyDrift,
  COACH_WINDOWS,
  coachBreakdown,
  coachWindowRange,
  coachWorkload,
  coachWorkloadFor,
  isActiveMember,
  isPendingCoach,
  isStaff,
  runsBranch,
  runsOrganization,
} from "@matops/domain";
import {
  CoachDetailSchema,
  CoachStatsSchema,
  IdSchema,
} from "@matops/validators";

import type { TimeZoneCtx } from "../academy-tz";
import type { MemberScope } from "../members";
import { academyTimeZone } from "../academy-tz";
import {
  staffAmong,
  studentRosterOf,
  nameByUser as userNames,
} from "../members";
import {
  branchManagerProcedure,
  organizationMemberIdentityProcedure,
  staffProcedure,
} from "../trpc";

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
      attendanceReviewedAt: classInstance.attendanceReviewedAt,
      attendanceReviewFingerprint: classInstance.attendanceReviewFingerprint,
      snapshot: attendanceReviewSnapshot().as("attendance_snapshot"),
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
      studentId: sql<string>`coalesce(${classParticipation.personId}::text, ${classParticipation.studentId})`,
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
    classes: rows.flatMap(
      ({
        status,
        instructorId,
        attendanceReviewedAt,
        attendanceReviewFingerprint,
        snapshot,
        ...c
      }) =>
        instructorId === null
          ? []
          : [
              {
                ...c,
                instructorId,
                cancelled: status === "cancelled",
                reviewed:
                  attendanceReviewedAt !== null &&
                  attendanceReviewFingerprint === snapshot.fingerprint,
              },
            ],
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
  const members = await listMembersOf(ctx.academyId, ctx.db);
  return {
    now,
    timeZone,
    range,
    classes,
    marks,
    instructorIds: staffAmong(members).flatMap((m) =>
      m.accountUserId ? [m.accountUserId] : [],
    ),
    nameByUser: userNames(members),
  };
}

const navigationCount = (count: number) => ({
  state: "ready" as const,
  count,
});

const unavailableNavigationCount = { state: "unavailable" as const };

async function readBranchNavigationCounts(
  organizationId: string,
  entityId: string,
  baseDb: DbExec,
) {
  return withScope(
    { organizationId, entityId },
    async (db) => {
      const pending = await db
        .select({
          invitedRole: entityMembership.invitedRole,
          status: entityMembership.status,
        })
        .from(entityMembership)
        .where(
          and(
            eq(entityMembership.entityId, entityId),
            eq(entityMembership.status, "pending"),
          ),
        );
      const coaches = pending.filter(isPendingCoach).length;
      return {
        roster: pending.length - coaches,
        coaches,
      };
    },
    baseDb,
  );
}

async function readOrganizationClaimCount(
  organizationId: string,
  baseDb: DbExec,
) {
  return withScope(
    { organizationId },
    async (db) => {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(membershipMonth)
        .where(eq(membershipMonth.status, "reported"));
      return row?.count ?? 0;
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

async function readDrifting(
  ctx: DashboardScope,
  now: Date,
  members: MemberRow[],
) {
  const lastByStudent = await ctx.db
    .select({
      studentId: sql<string>`coalesce(${classParticipation.personId}::text, ${classParticipation.studentId})`,
      last: sql<string>`max(${classInstance.startsAt})`,
    })
    .from(classParticipation)
    .innerJoin(classInstance, eq(classParticipation.classId, classInstance.id))
    .where(eq(classParticipation.attendanceStatus, "present"))
    .groupBy(
      sql`coalesce(${classParticipation.personId}::text, ${classParticipation.studentId})`,
    );
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
    const owner = runsBranch(ctx.membership);
    const members = owner ? await studentRosterOf(ctx) : null;

    return {
      drifting: members ? await readDrifting(ctx, now, members) : null,
    };
  }),

  navigationSummary: organizationMemberIdentityProcedure
    .input(
      z.object({
        organizationId: IdSchema,
        branchId: IdSchema.nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const runsGym = runsOrganization(ctx.orgMembership);
      const claims = runsGym
        ? await readOrganizationClaimCount(ctx.organizationId, ctx.baseDb)
        : null;
      const branch = input.branchId
        ? await getEntityInOrganization(
            input.branchId,
            ctx.organizationId,
            ctx.baseDb,
          )
        : null;
      const held = branch
        ? await getEntityMembership(ctx.session.user.id, branch.id, ctx.baseDb)
        : null;
      const membership = branch
        ? held
          ? {
              ...held,
              role:
                held.role === "owner"
                  ? "owner"
                  : runsGym
                    ? ctx.orgMembership.role
                    : held.role,
              status: runsGym ? "active" : held.status,
            }
          : runsGym
            ? {
                memberId: null,
                joinedAt: ctx.orgMembership.joinedAt,
                role: ctx.orgMembership.role,
                status: "active",
              }
            : null
        : null;
      const mayOpenBranch = membership ? canEnroll(membership) : false;
      const counts =
        branch && mayOpenBranch && membership
          ? await readBranchNavigationCounts(
              ctx.organizationId,
              branch.id,
              ctx.baseDb,
            )
          : null;
      const staff = membership ? isStaff(membership) : false;
      const manager = membership ? runsBranch(membership) : false;
      return {
        counts: {
          memberships:
            claims !== null
              ? navigationCount(claims)
              : unavailableNavigationCount,
          roster:
            counts && staff
              ? navigationCount(counts.roster)
              : unavailableNavigationCount,
          coaches:
            counts && manager
              ? navigationCount(counts.coaches)
              : unavailableNavigationCount,
        },
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
