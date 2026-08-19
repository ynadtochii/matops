import type { TRPCRouterRecord } from "@trpc/server";

import { and, eq, gte, inArray, listMembersOf, sql } from "@matops/db";
import {
  classInstance,
  classParticipation,
  paymentClaim,
} from "@matops/db/schema";
import {
  classifyDrift,
  groupMoneyByCurrency,
  gymInsights,
  monthBucket,
  trainingStats,
} from "@matops/domain";

import { academyTimeZone } from "../academy-tz";
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
    const timeZone = await academyTimeZone(ctx.db);
    return trainingStats(sessions, new Date(), timeZone);
  }),

  /**
   * Gym-activity insights for the owner dashboard (spec O1, C.1). Marked
   * attendance (present + absent) over a 30-day window → the pure `gymInsights`
   * (visits this week/month, busiest classes, attendance rate — null unless
   * absent marks exist, by-weekday), plus new members this month from the
   * member list. Staff-visible; every value is an aggregate count, no names.
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
    const timeZone = await academyTimeZone(ctx.db);
    // Growth, this month against last. Both sides count only retained members,
    // so a joiner who has since been removed is missing from either — the two
    // numbers are biased the same way and stay comparable.
    const members = await listMembersOf(ctx.academyId, ctx.baseDb);
    const thisMonth = monthBucket(now, timeZone);
    const joined = members
      .filter((m) => m.status !== "removed")
      .map((m) => monthBucket(m.createdAt, timeZone));
    const newMembersThisMonth = joined.filter((b) => b === thisMonth).length;
    const newMembersLastMonth = joined.filter(
      (b) => b === thisMonth - 1,
    ).length;
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
      newMembersThisMonth,
      newMembersLastMonth,
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
    const timeZone = await academyTimeZone(ctx.db);
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

    const members = await listMembersOf(ctx.academyId, ctx.baseDb);
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
