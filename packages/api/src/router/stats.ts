import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { ClassMark, CoachClass, CoachWindowKey } from "@matops/domain";
import {
  and,
  eq,
  gte,
  inArray,
  isNull,
  listMembersOf,
  lt,
  sql,
} from "@matops/db";
import {
  classInstance,
  classParticipation,
  paymentClaim,
} from "@matops/db/schema";
import {
  classifyDrift,
  COACH_WINDOWS,
  coachBreakdown,
  coachWindowRange,
  coachWorkload,
  coachWorkloadFor,
  groupMoneyByCurrency,
  gymInsights,
  isOnRoster,
  isOwner,
  monthBucket,
  trainingStats,
} from "@matops/domain";
import { CoachDetailSchema, CoachStatsSchema } from "@matops/validators";

import type { TimeZoneCtx } from "../academy-tz";
import type { MemberScope } from "../members";
import { academyTimeZone } from "../academy-tz";
import { staffAmong } from "../members";
import { enrolledProcedure, ownerProcedure, staffProcedure } from "../trpc";

/**
 * How far back the revenue read pulls confirmed claims. This month plus last
 * month is at most 62 days on any calendar; 70 leaves room for the academy time
 * zone shifting a boundary either way. The exact month split is done in code
 * with `monthBucket`, so this bound only keeps the query from growing forever.
 */
const REVENUE_WINDOW_DAYS = 70;

/** Days of marked attendance the gym-insights window looks back over. */
const GYM_WINDOW_DAYS = 30;

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
    classes: rows.map(({ status, ...c }) => ({
      ...c,
      cancelled: status === "cancelled",
    })),
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
    instructorIds: staffAmong(members).map((m) => m.userId),
    nameByUser: new Map(members.map((m) => [m.userId, m.name])),
  };
}

/**
 * Personal & gym statistics derived from stored attendance (v1.2 — ADR 39). A
 * "session" is a `present` participation joined to its class; all reads run on
 * the RLS-scoped `ctx.db`, so every number is per-academy. The math is the pure
 * `@matops/domain` stats engine; this router only fetches rows and picks the
 * academy time zone.
 */
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
   * Gym-activity insights for the owner dashboard (spec O1, C.1). Marked
   * attendance (present + absent) over a 30-day window → the pure `gymInsights`
   * (visits this week/month, busiest classes, attendance rate — null unless
   * absent marks exist, by-weekday). Staff-visible; every value is an aggregate
   * count, no names. `newMembers` is the one owner-only figure (spec O1, D.4),
   * so it comes back null for an instructor and the member read is skipped.
   */
  gym: staffProcedure.query(async ({ ctx }) => {
    const now = new Date();
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
      .innerJoin(
        classInstance,
        eq(classParticipation.classId, classInstance.id),
      )
      .where(
        and(
          inArray(classParticipation.attendanceStatus, ["present", "absent"]),
          gte(classInstance.startsAt, windowStart),
        ),
      );
    const timeZone = await academyTimeZone(ctx);
    // Growth, this month against last. Both sides count only retained members,
    // so a joiner who has since been removed is missing from either — the two
    // numbers are biased the same way and stay comparable.
    const owner = isOwner(ctx.membership);
    const members = owner ? await listMembersOf(ctx.academyId, ctx.db) : [];
    const thisMonth = monthBucket(now, timeZone);
    const joined = members
      .filter(isOnRoster)
      .map((m) => monthBucket(m.createdAt, timeZone));
    const newMembers = owner
      ? {
          thisMonth: joined.filter((b) => b === thisMonth).length,
          lastMonth: joined.filter((b) => b === thisMonth - 1).length,
        }
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
  }),

  /**
   * Every coach's workload over the window (spec O10, K.3). Owner-only: the O10
   * roster compares staff, and ADR 38/52 keeps cross-staff views with the owner.
   * A coach reads their own card through `coach` below.
   *
   * Rows come back name-ordered, with any coach who has left the roster last —
   * dropping their classes would make the per-coach figures stop adding up.
   */
  coaches: ownerProcedure
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
      if (instructorId !== ctx.session.user.id && !isOwner(ctx.membership)) {
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

  /**
   * Owner-confirmed payment money for this academy month against last (spec O1,
   * D.5). Owner-only: the O1 insights row is staff-visible, and instructors
   * never see money (ADR 38 / 52 role split). "Confirmed" is the only honest
   * basis — dues are manual bank transfers (ADR 40), so money exists once the
   * owner has matched a transfer to a claim, never before.
   *
   * Currencies are never added together (the O9 rule): the result is one entry
   * per currency, each carrying its own previous-month figure, and a currency
   * billed in either month appears in both so a drop to zero is visible.
   */
  revenue: ownerProcedure.query(async ({ ctx }) => {
    const now = new Date();
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
    const timeZone = await academyTimeZone(ctx);
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
      amountMinor:
        current.find((m) => m.currency === currency)?.amountMinor ?? 0,
      previousMinor: previous.get(currency) ?? 0,
    }));
  }),

  /**
   * Members who used to train here but have gone quiet (spec O1 "who's
   * drifting", C.1). For every non-staff member with ≥1 attended session, band
   * their recency with the pure `classifyDrift`; return those past `active`,
   * stalest first, each linking to their detail (C.2). Never-attended members
   * are excluded — they never started, so they aren't "drifting". Owner-only.
   */
  drifting: ownerProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const lastByStudent = await ctx.db
      .select({
        studentId: classParticipation.studentId,
        last: sql<string>`max(${classInstance.startsAt})`,
      })
      .from(classParticipation)
      .innerJoin(
        classInstance,
        eq(classParticipation.classId, classInstance.id),
      )
      .where(eq(classParticipation.attendanceStatus, "present"))
      .groupBy(classParticipation.studentId);
    const lastByUser = new Map(
      lastByStudent.map((r) => [r.studentId, new Date(r.last)]),
    );

    const members = await listMembersOf(ctx.academyId, ctx.db);
    const drifting = members
      .filter(
        (m) =>
          m.status === "active" &&
          m.role !== "owner" &&
          m.role !== "instructor" &&
          lastByUser.has(m.userId),
      )
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
          (a.lastAttendance?.getTime() ?? 0) -
          (b.lastAttendance?.getTime() ?? 0),
      );
    return drifting;
  }),
} satisfies TRPCRouterRecord;
