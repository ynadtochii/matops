import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import {
  and,
  desc,
  eq,
  isNull,
  ne,
  recordActivity,
  recordMilestone,
} from "@matops/db";
import { classInstance, classParticipation } from "@matops/db/schema";
import { bookingTier, canBook, notBookableMessage } from "@matops/domain";
import { BookClassSchema, CancelBookingSchema } from "@matops/validators";

import {
  claimSeat,
  releaseSeats,
  requireClassFacts,
  SESSION_FULL,
} from "../classes";
import { CLASS_NOT_FOUND } from "../messages";
import { bookingGate } from "../payments-gate";
import { enrolledProcedure, memberProcedure } from "../trpc";

// ponytail: newest 300 by start time. A student who trains daily loses past rows
// past ~10 months; `stats.me` is the lifetime figure, not this list. Paginate if
// the Past list ever needs to go further back.
const MINE_LIMIT = 300;

export const bookingRouter = {
  /**
   * May the caller book at this branch right now, and if not, why?
   *
   * ONE answer for both clients, through the same `bookingGate` the booking
   * mutation itself uses, so what a screen shows and what the server does can
   * never disagree. It covers whichever gate the branch runs on, so neither
   * client needs to know that the legacy dues path exists.
   *
   * Deliberately about NOW and not about a particular class: a screen showing a
   * week of classes wants one line at the top, and the mutation still checks the
   * individual class's own start before it books.
   */
  access: enrolledProcedure.query(async ({ ctx }) => {
    const gate = await bookingGate(ctx.db, {
      entity: ctx.entity,
      membership: ctx.membership,
      userId: ctx.session.user.id,
    });
    return { locked: gate.locked, message: gate.message };
  }),

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
      .orderBy(desc(classInstance.startsAt))
      .limit(MINE_LIMIT);
  }),

  /**
   * Book (or re-book) a class. Idempotent: a second tap on an already-booked
   * class is a no-op that does not double-count. Re-booking a cancelled row
   * flips it back to `booked` (the `ON CONFLICT` upsert) and re-claims the spot.
   */
  book: memberProcedure
    .input(BookClassSchema)
    .mutation(async ({ ctx, input }) => {
      // 1. Pre-read for a precise, friendly error (NOT the race guard — that is
      //    the atomic upsert + increment below). RLS scopes this to the academy.
      const cls = await requireClassFacts(ctx.db, input.classId);
      const bookable = canBook(cls, new Date());
      if (bookable.reason === "deleted") {
        throw new TRPCError({ code: "NOT_FOUND", message: CLASS_NOT_FOUND });
      }
      if (bookable.reason) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: notBookableMessage(bookable.reason),
        });
      }

      const tier = bookingTier(ctx.membership);

      const gate = await bookingGate(ctx.db, {
        entity: ctx.entity,
        membership: ctx.membership,
        userId: ctx.session.user.id,
        sessionAt: cls.startsAt,
      });
      if (gate.locked) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: gate.message ?? "Booking is locked for you.",
        });
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
      //    confirmed booking. Provisional bookings never touch the count
      //    (docs/issues/22). A `soft` class cannot refuse, so the BJJ rule is
      //    unchanged; a `strict` one can, and the throw rolls the participation
      //    row above back with it, so nobody is booked into a full session.
      if (transition && tier === "confirmed") {
        const took = await claimSeat(ctx.db, input.classId);
        if (!took) {
          throw new TRPCError({ code: "CONFLICT", message: SESSION_FULL });
        }
      }

      if (ctx.membership.role === "student") {
        ctx.afterCommit(async (exec) => {
          const event = {
            organizationId: ctx.organizationId,
            entityId: ctx.entityId,
            actorRole: "student" as const,
          };
          await recordMilestone({ ...event, name: "first_booking" }, exec);
          await recordActivity({ ...event, name: "student_booking" }, exec);
        });
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
        await releaseSeats(ctx.db, [input.classId]);
      }

      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
