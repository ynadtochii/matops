import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import { and, asc, eq, gte, isNull, lt, or, sql } from "@matops/db";
import { classInstance, classParticipation } from "@matops/db/schema";
import {
  bookingTier,
  canCheckIn,
  checkInFetchWindow,
  resolveCheckInClass,
} from "@matops/domain";
import { CheckInSchema } from "@matops/validators";

import { claimSeat, requireClassFacts, SESSION_FULL } from "../classes";
import { bookingGate } from "../payments-gate";
import { enrolledProcedure, memberProcedure } from "../trpc";

export const checkinRouter = {
  /**
   * The class(es) the caller can check into right now (spec S8) — resolved
   * server-side via `resolveCheckInClass` so the rule lives in one tested place
   * (the Expo app doesn't depend on `@matops/domain`). RLS scopes to the academy.
   * Returns 0 (No class right now), 1 (check straight in), or 2+ (pick which).
   */
  today: enrolledProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const window = checkInFetchWindow(now);
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
          gte(classInstance.startsAt, window.from),
          lt(classInstance.startsAt, window.to),
        ),
      )
      .orderBy(asc(classInstance.startsAt));
    return resolveCheckInClass(rows, now).map((c) => ({
      id: c.id,
      title: c.title,
      startsAt: c.startsAt,
    }));
  }),

  checkIn: memberProcedure
    .input(CheckInSchema)
    .mutation(async ({ ctx, input }) => {
      const cls = await requireClassFacts(ctx.db, input.classId);
      if (cls.status === "cancelled" || cls.deletedAt) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "That class isn't running",
        });
      }
      if (!canCheckIn(cls, new Date())) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No class to check into right now",
        });
      }

      const tier = bookingTier(ctx.membership);
      const me = ctx.session.user.id;
      const now = new Date();

      const gate = await bookingGate(ctx.db, {
        entity: ctx.entity,
        membership: ctx.membership,
        accountUserId: me,
        sessionAt: cls.startsAt,
      });
      if (gate.locked) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: gate.message ?? "Booking is locked for you.",
        });
      }
      if (!ctx.membership.personId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Your account is not linked to a person record.",
        });
      }

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
            or(
              eq(classParticipation.personId, ctx.membership.personId),
              and(
                isNull(classParticipation.personId),
                eq(classParticipation.studentId, me),
              ),
            ),
          ),
        );
      const willBook = !existing || existing.bookingStatus === "cancelled";

      await ctx.db
        .insert(classParticipation)
        .values({
          academyId: ctx.academyId,
          classId: input.classId,
          personOrganizationId: ctx.organizationId,
          personId: ctx.membership.personId,
          studentId: me,
          bookingStatus: "booked",
          bookingTier: tier,
          attendanceStatus: "present",
          attendedAt: now,
          cancelledAt: null,
        })
        .onConflictDoUpdate({
          target: [classParticipation.classId, classParticipation.personId],
          targetWhere: sql`person_id is not null`,
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
        // A full session is full at the door too: staff standing there does not
        // conjure a place, and the room only holds so many (ADR 126). The throw
        // rolls the participation row above back with it. A `soft` class never
        // refuses, so a BJJ walk-in is unchanged.
        const took = await claimSeat(ctx.db, input.classId);
        if (!took) {
          throw new TRPCError({ code: "CONFLICT", message: SESSION_FULL });
        }
      }

      return { ok: true as const, tier, booked: willBook };
    }),
} satisfies TRPCRouterRecord;
