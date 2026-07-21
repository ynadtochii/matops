import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import { and, asc, eq, gte, isNull, lt, sql } from "@matops/db";
import { classInstance, classParticipation } from "@matops/db/schema";
import {
  bookingTier,
  canMarkAttendance,
  resolveCheckInClass,
} from "@matops/domain";
import { CheckInSchema } from "@matops/validators";

import { enrolledProcedure } from "../trpc";

/** Window of classes the app fetches to resolve "check in now" (before + after). */
const LOOKBACK_MS = 3 * 60 * 60 * 1000; // 3h back (a class that just ran)
const LOOKAHEAD_MS = 6 * 60 * 60 * 1000; // 6h ahead (today's later classes)

/**
 * QR self check-in (slice 3.4, spec S8; docs/issues/24). `enrolledProcedure`, so
 * a pending member can check in too (provisional). Check-in = **book + attend**:
 * it books the class if needed (soft cap — never blocked, present even if full)
 * and marks the caller present. Booking alone (slice 3.1) does not attend; this
 * does both. The client resolves which class via `resolveCheckInClass`.
 */
export const checkinRouter = {
  /**
   * The class(es) the caller can check into right now (spec S8) — resolved
   * server-side via `resolveCheckInClass` so the rule lives in one tested place
   * (the Expo app doesn't depend on `@matops/domain`). RLS scopes to the academy.
   * Returns 0 (No class right now), 1 (check straight in), or 2+ (pick which).
   */
  today: enrolledProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const rows = await ctx.db
      .select({
        id: classInstance.id,
        title: classInstance.title,
        startsAt: classInstance.startsAt,
        durationMinutes: classInstance.durationMinutes,
        status: classInstance.status,
      })
      .from(classInstance)
      .where(
        and(
          isNull(classInstance.deletedAt),
          gte(classInstance.startsAt, new Date(now.getTime() - LOOKBACK_MS)),
          lt(classInstance.startsAt, new Date(now.getTime() + LOOKAHEAD_MS)),
        ),
      )
      .orderBy(asc(classInstance.startsAt));
    return resolveCheckInClass(rows, now).map((c) => ({
      id: c.id,
      title: c.title,
      startsAt: c.startsAt,
    }));
  }),

  /**
   * Check in to a class: book-if-needed + mark present, even if full. Idempotent
   * — re-scanning keeps you present. Books a `confirmed` spot for an active
   * member (increments the count), `provisional` for a pending one (uncounted).
   */
  checkIn: enrolledProcedure
    .input(CheckInSchema)
    .mutation(async ({ ctx, input }) => {
      const [cls] = await ctx.db
        .select({
          status: classInstance.status,
          startsAt: classInstance.startsAt,
          deletedAt: classInstance.deletedAt,
        })
        .from(classInstance)
        .where(eq(classInstance.id, input.classId));
      if (!cls) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Class not found" });
      }
      if (cls.status === "cancelled" || cls.deletedAt) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "That class isn't running",
        });
      }
      // Reuse the attendance window as the check-in window guard: today / recent.
      if (!canMarkAttendance(cls, new Date())) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No class to check into right now",
        });
      }

      const tier = bookingTier(ctx.membership);
      const me = ctx.session.user.id;
      const now = new Date();

      // Read the caller's current row (if any) to know whether this check-in is a
      // NEW booking transition — that decides the confirmed-count increment. A
      // single user tapping once; a rare double-tap self-race is corrected by the
      // reconciliation cron (slice 5.1), and never double-books (UNIQUE).
      const [existing] = await ctx.db
        .select({ bookingStatus: classParticipation.bookingStatus })
        .from(classParticipation)
        .where(
          and(
            eq(classParticipation.classId, input.classId),
            eq(classParticipation.studentId, me),
          ),
        );
      const willBook = !existing || existing.bookingStatus === "cancelled";

      await ctx.db
        .insert(classParticipation)
        .values({
          academyId: ctx.academyId,
          classId: input.classId,
          studentId: me,
          bookingStatus: "booked",
          bookingTier: tier,
          attendanceStatus: "present",
          attendedAt: now,
          cancelledAt: null,
        })
        .onConflictDoUpdate({
          target: [classParticipation.classId, classParticipation.studentId],
          // Always mark present; only (re)book when they weren't already booked
          // (a cancelled row flips back; a walk-in `none` / active `booked` stays).
          set: willBook
            ? {
                bookingStatus: "booked",
                bookingTier: tier,
                cancelledAt: null,
                attendanceStatus: "present",
                attendedAt: now,
              }
            : { attendanceStatus: "present", attendedAt: now },
        });

      if (willBook && tier === "confirmed") {
        await ctx.db
          .update(classInstance)
          .set({ bookingCount: sql`${classInstance.bookingCount} + 1` })
          .where(eq(classInstance.id, input.classId));
      }

      return { ok: true as const, tier, booked: willBook };
    }),
} satisfies TRPCRouterRecord;
