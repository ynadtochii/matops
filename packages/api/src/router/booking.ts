import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import { and, desc, eq, isNull, ne, sql } from "@matops/db";
import { classInstance, classParticipation } from "@matops/db/schema";
import { bookingAccessMessage, bookingTier, canBook } from "@matops/domain";
import { BookClassSchema, CancelBookingSchema } from "@matops/validators";

import { loadBookingAccess } from "../payments-gate";
import { enrolledProcedure } from "../trpc";

/**
 * Booking (slice 3.1, spec S5, §4; docs/issues/13, 22, 23). Book / cancel a
 * concrete class from the student app. On `enrolledProcedure`, so a PENDING
 * member may book too — their booking is `provisional` (recorded, tagged
 * "pending approval", never counted). An approved member books `confirmed`,
 * which increments `class.booking_count`.
 *
 * Booking is NEVER blocked (soft cap, §4): the capacity claim is a plain atomic
 * increment with NO `booking_count < capacity` guard. Safety comes from the
 * `UNIQUE(class_id, student_id)` upsert (no double-book) and the fact the whole
 * resolver runs inside the RLS per-request transaction (`ctx.db`), so the two
 * statements commit or roll back together. See docs/issues/13.
 */
export const bookingRouter = {
  /**
   * The caller's own participations, each joined to its class (slice B.2, spec
   * S6 "My classes"). The mobile Training tab feeds these to `splitMyClasses`,
   * which divides them into Upcoming (still booked, not started — confirmed +
   * provisional) and Past (attended). Every row of the caller's is returned
   * (RLS scopes the academy); the pure split drops cancelled-and-never-attended
   * rows. Soft-deleted classes are excluded here.
   */
  mine: enrolledProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        classId: classInstance.id,
        title: classInstance.title,
        startsAt: classInstance.startsAt,
        durationMinutes: classInstance.durationMinutes,
        discipline: classInstance.discipline,
        status: classInstance.status,
        bookingStatus: classParticipation.bookingStatus,
        bookingTier: classParticipation.bookingTier,
        attendanceStatus: classParticipation.attendanceStatus,
      })
      .from(classParticipation)
      .innerJoin(
        classInstance,
        eq(classParticipation.classId, classInstance.id),
      )
      .where(
        and(
          eq(classParticipation.studentId, ctx.session.user.id),
          isNull(classInstance.deletedAt),
        ),
      )
      .orderBy(desc(classInstance.startsAt));
  }),

  /**
   * Book (or re-book) a class. Idempotent: a second tap on an already-booked
   * class is a no-op that does not double-count. Re-booking a cancelled row
   * flips it back to `booked` (the `ON CONFLICT` upsert) and re-claims the spot.
   */
  book: enrolledProcedure
    .input(BookClassSchema)
    .mutation(async ({ ctx, input }) => {
      // 1. Pre-read for a precise, friendly error (NOT the race guard — that is
      //    the atomic upsert + increment below). RLS scopes this to the academy.
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
      const bookable = canBook(cls, new Date());
      if (!bookable.ok) {
        if (bookable.reason === "deleted") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Class not found",
          });
        }
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            bookable.reason === "cancelled"
              ? "This class was cancelled"
              : bookable.reason === "too-far-ahead"
                ? "You can book up to a week ahead"
                : "This class has already started",
        });
      }

      // 2. Tier from the caller's membership: active → confirmed, pending →
      //    provisional (never counted).
      const tier = bookingTier(ctx.membership);

      if (tier === "confirmed") {
        const access = await loadBookingAccess(ctx.db, ctx.membership);
        if (access.state === "locked") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              bookingAccessMessage(access) ?? "Booking is locked for you.",
          });
        }
      }

      // 3. Transition the participation to booked, only if not already booked
      //    (idempotent). A returned row ⇒ a real transition (new insert OR
      //    cancelled → booked); no row ⇒ already booked, leave the count alone.
      const [transition] = await ctx.db
        .insert(classParticipation)
        .values({
          academyId: ctx.academyId,
          classId: input.classId,
          studentId: ctx.session.user.id,
          bookingStatus: "booked",
          bookingTier: tier,
          cancelledAt: null,
        })
        .onConflictDoUpdate({
          target: [classParticipation.classId, classParticipation.studentId],
          set: {
            bookingStatus: "booked",
            bookingTier: tier,
            cancelledAt: null,
          },
          setWhere: ne(classParticipation.bookingStatus, "booked"),
        })
        .returning({ id: classParticipation.id });

      // 4. Claim capacity atomically — ONLY on a real transition AND only for a
      //    confirmed booking. No capacity guard: the count may exceed capacity
      //    (soft cap). Provisional bookings never touch the count (docs/issues/22).
      if (transition && tier === "confirmed") {
        await ctx.db
          .update(classInstance)
          .set({ bookingCount: sql`${classInstance.bookingCount} + 1` })
          .where(eq(classInstance.id, input.classId));
      }

      return { ok: true as const, tier };
    }),

  /**
   * Cancel the caller's own booking. Idempotent: cancelling a booking that is
   * not currently `booked` is a no-op. Decrements the count (floored at 0) only
   * if the cancelled booking was `confirmed` — provisional never held a spot.
   */
  cancel: enrolledProcedure
    .input(CancelBookingSchema)
    .mutation(async ({ ctx, input }) => {
      const [cancelled] = await ctx.db
        .update(classParticipation)
        .set({ bookingStatus: "cancelled", cancelledAt: new Date() })
        .where(
          and(
            eq(classParticipation.classId, input.classId),
            eq(classParticipation.studentId, ctx.session.user.id),
            eq(classParticipation.bookingStatus, "booked"),
          ),
        )
        .returning({ tier: classParticipation.bookingTier });

      if (cancelled?.tier === "confirmed") {
        await ctx.db
          .update(classInstance)
          .set({
            bookingCount: sql`GREATEST(${classInstance.bookingCount} - 1, 0)`,
          })
          .where(eq(classInstance.id, input.classId));
      }

      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
