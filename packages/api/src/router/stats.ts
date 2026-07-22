import type { TRPCRouterRecord } from "@trpc/server";

import { and, eq, gte, inArray, listMembersOf, sql } from "@matops/db";
import { classInstance, classParticipation } from "@matops/db/schema";
import { classifyDrift, gymInsights, trainingStats } from "@matops/domain";

import { academyTimeZone } from "../academy-tz";
import { enrolledProcedure, ownerProcedure, staffProcedure } from "../trpc";

/** Days of marked attendance the gym-insights window looks back over. */
const GYM_WINDOW_DAYS = 30;

/** Same calendar month (in the academy zone) for the new-member growth count. */
function sameMonth(a: Date, b: Date, timeZone: string): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  });
  return fmt.format(a) === fmt.format(b);
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
    const timeZone = await academyTimeZone(ctx.db);
    return trainingStats(sessions, new Date(), timeZone);
  }),

  /**
   * Gym-activity insights for the owner dashboard (spec O1, C.1). Marked
   * attendance (present + absent) over a 30-day window → the pure `gymInsights`
   * (visits this week/month, busiest classes, attendance rate — null unless
   * absent marks exist, by-weekday), plus new members this month from the
   * roster. Staff-visible; every value is an aggregate count, no names.
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
    const members = await listMembersOf(ctx.academyId);
    const newMembersThisMonth = members.filter(
      (m) => m.status !== "removed" && sameMonth(m.createdAt, now, timeZone),
    ).length;
    return {
      ...gymInsights(
        // `attendanceStatus` is the enum union; the window guarantees these two.
        marked as { startsAt: Date; title: string; status: "present" | "absent" }[],
        now,
        timeZone,
      ),
      newMembersThisMonth,
    };
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

    const members = await listMembersOf(ctx.academyId);
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
