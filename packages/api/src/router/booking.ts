import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import {
  and,
  bumpScheduleRevision,
  desc,
  eq,
  isNull,
  lockAndReadScheduleRevision,
  or,
  recordActivity,
  recordMilestone,
} from "@matops/db";
import { classInstance, classParticipation } from "@matops/db/schema";
import {
  BookClassSchema,
  BookForSchema,
  CancelBookingSchema,
} from "@matops/validators";

import { academyContext } from "../academy-tz";
import { findBranchPerson } from "../branch-person";
import { releaseSeats } from "../classes";
import { bookForMember } from "../member-booking";
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
      const result = await bookForMember(ctx.db, {
        entity: ctx.entity,
        membership: ctx.membership,
        accountUserId: ctx.session.user.id,
        classId: input.classId,
        academyId: ctx.academyId,
        organizationId: ctx.organizationId,
        bookingWindowDays: academy.bookingWindowDays,
        timeZone: academy.timeZone,
      });

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

      return { ok: true as const, tier: result.tier };
    }),

  /**
   * Book a named member onto a class from the staff desk (ADR 139). The desk
   * check-in write only reaches about a day ahead, because it records
   * attendance; this is how staff reception holds a place on a class further
   * out. Same shared write as the member's own booking, so the admission rules,
   * the branch booking window and the capacity accounting are theirs, not a
   * staff override.
   */
  bookFor: staffProcedure
    .input(BookForSchema)
    .mutation(async ({ ctx, input }) => {
      const subject = await findBranchPerson(ctx.db, ctx, input.personId);
      if (!subject) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That person does not have active access to this academy",
        });
      }
      const academy = await academyContext(ctx);
      const result = await bookForMember(ctx.db, {
        entity: ctx.entity,
        membership: subject,
        accountUserId: subject.accountUserId,
        classId: input.classId,
        academyId: ctx.academyId,
        organizationId: ctx.organizationId,
        bookingWindowDays: academy.bookingWindowDays,
        timeZone: academy.timeZone,
      });
      return { ok: true as const, tier: result.tier, booked: result.booked };
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
