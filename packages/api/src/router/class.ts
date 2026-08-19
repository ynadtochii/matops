import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import {
  and,
  asc,
  eq,
  getTableColumns,
  gte,
  isNull,
  lt,
  sql,
} from "@matops/db";
import {
  classInstance,
  classParticipation,
  dropIn,
  user,
} from "@matops/db/schema";
import {
  classChange,
  instantFromLocalDate,
  isActiveMember,
  visibleAttendees,
} from "@matops/domain";
import {
  ClassIdSchema,
  CreateClassSchema,
  UpdateClassSchema,
} from "@matops/validators";

import { academyTimeZone } from "../academy-tz";
import { notifyClassCancelled, notifyClassChanged } from "../notify";
import { enrolledProcedure, staffProcedure } from "../trpc";

/**
 * Week window input shared by the staff and student schedule reads. The span is
 * capped so a hand-rolled request cannot ask for a decade of classes in one go.
 */
const WeekInput = z
  .object({ from: z.iso.datetime(), to: z.iso.datetime() })
  .refine((v) => {
    const span = Date.parse(v.to) - Date.parse(v.from);
    return span > 0 && span <= 400 * 24 * 60 * 60 * 1000;
  }, "Pick a window between 0 and 400 days");

/**
 * Concrete classes (spec O2, §4 edit rules). Staff-only. One-off create,
 * per-instance edit/cancel, and the staff week read that O2 renders. All on the
 * RLS-scoped `ctx.db`. The student-facing (enrolled) schedule read is slice 2.4.
 *
 * `status` is `scheduled | cancelled` only — "past" is derived from
 * `starts_at + duration < now()` at read time (docs/issues/19), never stored.
 */
export const classRouter = {
  /**
   * Classes in [from, to) for the active academy, soonest first (O2 week view).
   * `bookingCount` is the CONFIRMED count; `pendingCount` (slice 3.2) counts the
   * provisional bookings so the owner sees "N/cap · +M pending". `markedCount`
   * (slice D.2) counts the participations already marked present or absent, so
   * the O1 dashboard can spot a finished class whose register nobody filled in.
   * The subqueries are RLS-scoped like the outer query, so they only count this
   * academy's rows.
   */
  week: staffProcedure.input(WeekInput).query(({ ctx, input }) => {
    return ctx.db
      .select({
        ...getTableColumns(classInstance),
        instructorName: user.name,
        pendingCount: sql<number>`(
          SELECT count(*)::int FROM ${classParticipation}
          WHERE ${classParticipation.classId} = ${classInstance.id}
            AND ${classParticipation.bookingStatus} = 'booked'
            AND ${classParticipation.bookingTier} = 'provisional'
        )`,
        markedCount: sql<number>`(
          SELECT count(*)::int FROM ${classParticipation}
          WHERE ${classParticipation.classId} = ${classInstance.id}
            AND ${classParticipation.attendanceStatus} <> 'unmarked'
        )`,
      })
      .from(classInstance)
      .leftJoin(user, eq(user.id, classInstance.instructorId))
      .where(
        and(
          isNull(classInstance.deletedAt),
          gte(classInstance.startsAt, new Date(input.from)),
          lt(classInstance.startsAt, new Date(input.to)),
        ),
      )
      .orderBy(asc(classInstance.startsAt));
  }),

  /**
   * The student schedule read (spec S4) — the SAME week, but on the enrolled
   * tier so a PENDING member can browse too (view-only, docs/issues/23). RLS
   * scopes it to the caller's active academy, so a student can only ever see
   * their own gym's classes. Used by the deferred Expo student home; the fields
   * (title/time/duration/capacity/booking_count) are all a student may see —
   * attendee names are a Phase-3 booking concern, not returned here.
   */
  mine: enrolledProcedure.input(WeekInput).query(({ ctx, input }) => {
    return ctx.db
      .select({
        id: classInstance.id,
        title: classInstance.title,
        discipline: classInstance.discipline,
        startsAt: classInstance.startsAt,
        durationMinutes: classInstance.durationMinutes,
        capacity: classInstance.capacity,
        bookingCount: classInstance.bookingCount,
        status: classInstance.status,
        instructorId: classInstance.instructorId,
        instructorName: user.name,
        // The caller's OWN booking (slice 3.1): drives the inline "Booked" pill
        // (spec S4). Left-joined + filtered to studentId=me, so at most one row.
        myBooking: classParticipation.bookingStatus, // "booked" | "cancelled" | null
        myBookingTier: classParticipation.bookingTier, // "confirmed" | "provisional" | null
      })
      .from(classInstance)
      .leftJoin(user, eq(user.id, classInstance.instructorId))
      .leftJoin(
        classParticipation,
        and(
          eq(classParticipation.classId, classInstance.id),
          eq(classParticipation.studentId, ctx.session.user.id),
        ),
      )
      .where(
        and(
          isNull(classInstance.deletedAt),
          gte(classInstance.startsAt, new Date(input.from)),
          lt(classInstance.startsAt, new Date(input.to)),
        ),
      )
      .orderBy(asc(classInstance.startsAt));
  }),

  /**
   * One class by id for the student detail screen (spec S5). Enrolled tier, so a
   * PENDING member may view it too (read-only — booking is Phase 3). RLS scopes
   * it to the caller's active academy. Left-joins `user` for the instructor name
   * (matops_app has SELECT on the auth tables and `user` carries no RLS).
   */
  get: enrolledProcedure.input(ClassIdSchema).query(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .select({
        id: classInstance.id,
        title: classInstance.title,
        discipline: classInstance.discipline,
        startsAt: classInstance.startsAt,
        durationMinutes: classInstance.durationMinutes,
        capacity: classInstance.capacity,
        bookingCount: classInstance.bookingCount,
        status: classInstance.status,
        instructorId: classInstance.instructorId,
        instructorName: user.name,
        // The caller's OWN booking (slice 3.1): drives the Book vs Cancel button
        // and the "pending approval" tag on S5. Filtered to studentId=me.
        myBooking: classParticipation.bookingStatus, // "booked" | "cancelled" | null
        myBookingTier: classParticipation.bookingTier, // "confirmed" | "provisional" | null
      })
      .from(classInstance)
      .leftJoin(user, eq(user.id, classInstance.instructorId))
      .leftJoin(
        classParticipation,
        and(
          eq(classParticipation.classId, classInstance.id),
          eq(classParticipation.studentId, ctx.session.user.id),
        ),
      )
      .where(
        and(eq(classInstance.id, input.id), isNull(classInstance.deletedAt)),
      );
    if (!row) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Class not found" });
    }
    return row;
  }),

  /**
   * Who else is on a class (spec S5, §4 schedule privacy, ADR 55). Enrolled tier,
   * so a pending member may call it — they just get counts back.
   */
  attendees: enrolledProcedure
    .input(ClassIdSchema)
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          studentId: classParticipation.studentId,
          name: user.name,
          bookingStatus: classParticipation.bookingStatus,
        })
        .from(classParticipation)
        .leftJoin(user, eq(user.id, classParticipation.studentId))
        .where(eq(classParticipation.classId, input.id));

      const [dropIns] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(dropIn)
        .where(eq(dropIn.classId, input.id));

      return visibleAttendees(rows, dropIns?.count ?? 0, {
        id: ctx.session.user.id,
        approved: isActiveMember(ctx.membership),
      });
    }),

  /** Create a one-off class (`template_id` null). Local date+time → UTC instant. */
  create: staffProcedure
    .input(CreateClassSchema)
    .mutation(async ({ ctx, input }) => {
      const startsAt = instantFromLocalDate(
        input.date,
        input.startsAtMinutes,
        input.timeZone,
      );
      const [row] = await ctx.db
        .insert(classInstance)
        .values({
          academyId: ctx.academyId,
          templateId: null,
          instructorId: input.instructorId ?? ctx.session.user.id,
          title: input.title,
          discipline: input.discipline ?? null,
          startsAt,
          durationMinutes: input.durationMinutes,
          capacity: input.capacity,
        })
        .returning();
      return row;
    }),

  /** Edit one class. Optional reschedule; notifies booked students on time/instructor change (§4). */
  update: staffProcedure
    .input(UpdateClassSchema)
    .mutation(async ({ ctx, input }) => {
      const [before] = await ctx.db
        .select()
        .from(classInstance)
        .where(
          and(eq(classInstance.id, input.id), isNull(classInstance.deletedAt)),
        );
      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Class not found" });
      }

      const startsAt =
        input.date && input.startsAtMinutes !== undefined && input.timeZone
          ? instantFromLocalDate(
              input.date,
              input.startsAtMinutes,
              input.timeZone,
            )
          : before.startsAt;

      const [row] = await ctx.db
        .update(classInstance)
        .set({
          title: input.title,
          discipline: input.discipline ?? null,
          instructorId: input.instructorId,
          durationMinutes: input.durationMinutes,
          capacity: input.capacity,
          startsAt,
        })
        .where(
          and(eq(classInstance.id, input.id), isNull(classInstance.deletedAt)),
        )
        .returning();
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Class not found" });
      }

      const change = classChange(
        { startsAt: before.startsAt, instructorId: before.instructorId },
        { startsAt: row.startsAt, instructorId: row.instructorId },
      );
      if (change.shouldNotify) {
        // Notify booked students of the time/instructor change (§4, docs/issues/17).
        const booked = await ctx.db
          .select({ studentId: classParticipation.studentId })
          .from(classParticipation)
          .where(
            and(
              eq(classParticipation.classId, row.id),
              eq(classParticipation.bookingStatus, "booked"),
            ),
          );
        // Without a zone `formatWhen` labels the new time in UTC, so students
        // would be told the wrong hour. The reminder sweep already resolves one.
        const timeZone = await academyTimeZone(ctx.db);
        const studentIds = booked.map((b) => b.studentId);
        ctx.afterCommit(() =>
          notifyClassChanged({
            academyId: ctx.academyId,
            className: row.title,
            startsAt: row.startsAt,
            timeZone,
            classId: row.id,
            studentIds,
          }),
        );
      }
      return row;
    }),

  /** Cancel a class (soft — status only; bookings kept). Notifies booked students (§4). */
  cancel: staffProcedure
    .input(ClassIdSchema)
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .update(classInstance)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(classInstance.id, input.id),
            isNull(classInstance.deletedAt),
            eq(classInstance.status, "scheduled"),
          ),
        )
        .returning({
          id: classInstance.id,
          title: classInstance.title,
          startsAt: classInstance.startsAt,
        });
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Class not found or already cancelled",
        });
      }
      // Push + email every booked student (class cancelled — §4, docs/issues/17).
      const booked = await ctx.db
        .select({ studentId: classParticipation.studentId })
        .from(classParticipation)
        .where(
          and(
            eq(classParticipation.classId, row.id),
            eq(classParticipation.bookingStatus, "booked"),
          ),
        );
      const timeZone = await academyTimeZone(ctx.db);
      const studentIds = booked.map((b) => b.studentId);
      ctx.afterCommit(() =>
        notifyClassCancelled({
          academyId: ctx.academyId,
          className: row.title,
          startsAt: row.startsAt,
          timeZone,
          classId: row.id,
          studentIds,
        }),
      );
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
