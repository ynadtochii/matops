import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import {
  and,
  bumpScheduleRevision,
  desc,
  eq,
  isNull,
  lockAndReadScheduleRevision,
  ne,
  or,
  recordActivity,
  recordMilestone,
  sql,
} from "@matops/db";
import { classInstance, classParticipation } from "@matops/db/schema";
import {
  BOOKING_LOCKED,
  bookingTier,
  canBook,
  isOwner,
  notBookableMessage,
} from "@matops/domain";
import {
  BookClassSchema,
  CancelBookingSchema,
  CancelForSchema,
} from "@matops/validators";

import { academyContext } from "../academy-tz";
import { claimSeat, releaseSeats, requireClassFacts } from "../classes";
import { CLASS_NOT_FOUND } from "../messages";
import { bookingGate } from "../payments-gate";
import { enrolledProcedure, memberProcedure, staffProcedure } from "../trpc";

const MINE_LIMIT = 300;

export const bookingRouter = {
  access: enrolledProcedure.query(async ({ ctx }) => {
    const gate = await bookingGate(ctx.db, {
      entity: ctx.entity,
      membership: ctx.membership,
      accountUserId: ctx.session.user.id,
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
          or(
            ctx.membership.personId
              ? eq(classParticipation.personId, ctx.membership.personId)
              : undefined,
            and(
              isNull(classParticipation.personId),
              eq(classParticipation.studentId, ctx.session.user.id),
            ),
          ),
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
      const academy = await academyContext(ctx);
      await lockAndReadScheduleRevision(ctx.db, ctx.academyId);
      const cls = await requireClassFacts(ctx.db, input.classId);
      const bookable = canBook(cls, new Date(), {
        bookingWindowDays: academy.bookingWindowDays,
        timeZone: academy.timeZone,
      });
      if (bookable.reason === "deleted") {
        throw new TRPCError({ code: "NOT_FOUND", message: CLASS_NOT_FOUND });
      }
      if (bookable.reason) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: notBookableMessage(
            bookable.reason,
            academy.bookingWindowDays,
          ),
        });
      }
      const gate = await bookingGate(ctx.db, {
        entity: ctx.entity,
        membership: ctx.membership,
        accountUserId: ctx.session.user.id,
        sessionAt: cls.startsAt,
      });
      if (gate.locked) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: gate.message ?? BOOKING_LOCKED,
        });
      }
      const tier = gate.provisional
        ? ("provisional" as const)
        : bookingTier(ctx.membership);

      if (ctx.membership.personId && ctx.session.user.id) {
        await ctx.db
          .update(classParticipation)
          .set({
            personOrganizationId: ctx.organizationId,
            personId: ctx.membership.personId,
          })
          .where(
            and(
              eq(classParticipation.classId, input.classId),
              eq(classParticipation.studentId, ctx.session.user.id),
              isNull(classParticipation.personId),
            ),
          );
      }

      const [transition] = await ctx.db
        .insert(classParticipation)
        .values({
          academyId: ctx.academyId,
          classId: input.classId,
          personOrganizationId: ctx.membership.personId
            ? ctx.organizationId
            : null,
          personId: ctx.membership.personId,
          studentId: ctx.session.user.id,
          bookingStatus: "booked",
          bookingTier: tier,
          cancelledAt: null,
        })
        .onConflictDoUpdate({
          target: ctx.membership.personId
            ? [classParticipation.classId, classParticipation.personId]
            : [classParticipation.classId, classParticipation.studentId],
          targetWhere: ctx.membership.personId
            ? sql`person_id is not null`
            : undefined,
          set: {
            bookingStatus: "booked",
            bookingTier: tier,
            cancelledAt: null,
          },
          setWhere: ne(classParticipation.bookingStatus, "booked"),
        })
        .returning({ id: classParticipation.id });

      if (transition && tier === "confirmed") {
        await claimSeat(ctx.db, input.classId);
      }
      if (transition) await bumpScheduleRevision(ctx.db, ctx.academyId);

      if (ctx.membership.role === "student") {
        ctx.afterCommit(async (exec) => {
          const event = {
            organizationId: ctx.organizationId,
            entityId: ctx.academyId,
            actorRole: "student" as const,
          };
          await recordMilestone({ ...event, name: "first_booking" }, exec);
          await recordActivity({ ...event, name: "student_booking" }, exec);
        });
      }

      return { ok: true as const, tier };
    }),

  /** The owner cancels a named person's booking. Idempotent, like `cancel`. */
  cancelFor: staffProcedure
    .input(CancelForSchema)
    .mutation(async ({ ctx, input }) => {
      if (!isOwner(ctx.membership)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Owner only" });
      }
      await lockAndReadScheduleRevision(ctx.db, ctx.academyId);
      const [cancelled] = await ctx.db
        .update(classParticipation)
        .set({ bookingStatus: "cancelled", cancelledAt: new Date() })
        .where(
          and(
            eq(classParticipation.classId, input.classId),
            eq(classParticipation.personId, input.personId),
            eq(classParticipation.bookingStatus, "booked"),
          ),
        )
        .returning({ tier: classParticipation.bookingTier });

      if (cancelled?.tier === "confirmed") {
        await releaseSeats(ctx.db, [input.classId]);
      }
      if (cancelled) await bumpScheduleRevision(ctx.db, ctx.academyId);

      return { ok: true as const, cancelled: !!cancelled };
    }),

  /**
   * Cancel the caller's own booking. Idempotent: cancelling a booking that is
   * not currently `booked` is a no-op. Decrements the count (floored at 0) only
   * if the cancelled booking was `confirmed` — provisional never held a spot.
   */
  cancel: enrolledProcedure
    .input(CancelBookingSchema)
    .mutation(async ({ ctx, input }) => {
      await lockAndReadScheduleRevision(ctx.db, ctx.academyId);
      const [cancelled] = await ctx.db
        .update(classParticipation)
        .set({ bookingStatus: "cancelled", cancelledAt: new Date() })
        .where(
          and(
            eq(classParticipation.classId, input.classId),
            or(
              ctx.membership.personId
                ? eq(classParticipation.personId, ctx.membership.personId)
                : undefined,
              and(
                isNull(classParticipation.personId),
                eq(classParticipation.studentId, ctx.session.user.id),
              ),
            ),
            eq(classParticipation.bookingStatus, "booked"),
          ),
        )
        .returning({ tier: classParticipation.bookingTier });

      if (cancelled?.tier === "confirmed") {
        await releaseSeats(ctx.db, [input.classId]);
      }
      if (cancelled) await bumpScheduleRevision(ctx.db, ctx.academyId);

      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
