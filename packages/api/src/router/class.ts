import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { and, asc, eq, gte, isNull, lt } from "@matops/db";
import { classInstance, user } from "@matops/db/schema";
import { classChange, instantFromLocalDate } from "@matops/domain";
import {
  ClassIdSchema,
  CreateClassSchema,
  UpdateClassSchema,
} from "@matops/validators";

import { enrolledProcedure, staffProcedure } from "../trpc";

/** Week window input shared by the staff and student schedule reads. */
const WeekInput = z.object({ from: z.iso.datetime(), to: z.iso.datetime() });

/**
 * Concrete classes (spec O2, §4 edit rules). Staff-only. One-off create,
 * per-instance edit/cancel, and the staff week read that O2 renders. All on the
 * RLS-scoped `ctx.db`. The student-facing (enrolled) schedule read is slice 2.4.
 *
 * `status` is `scheduled | cancelled` only — "past" is derived from
 * `starts_at + duration < now()` at read time (docs/issues/19), never stored.
 */
export const classRouter = {
  /** Classes in [from, to) for the active academy, soonest first (O2 week view). */
  week: staffProcedure.input(WeekInput).query(({ ctx, input }) => {
    return ctx.db
      .select()
      .from(classInstance)
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
      .select()
      .from(classInstance)
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
      })
      .from(classInstance)
      .leftJoin(user, eq(user.id, classInstance.instructorId))
      .where(
        and(eq(classInstance.id, input.id), isNull(classInstance.deletedAt)),
      );
    if (!row) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Class not found" });
    }
    return row;
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
        // TODO(phase 4): push + email booked students about the time/instructor change.
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
        .returning({ id: classInstance.id });
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Class not found or already cancelled",
        });
      }
      // TODO(phase 4): push + email every booked student (class cancelled).
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
