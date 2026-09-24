import type { TRPCRouterRecord } from "@trpc/server";

import { and, asc, gte, isNull, lt } from "@matops/db";
import { classInstance } from "@matops/db/schema";
import { checkInFetchWindow, resolveCheckInClass } from "@matops/domain";
import { CheckInSchema } from "@matops/validators";

import { checkInMember } from "../member-checkin";
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
      return checkInMember(ctx.db, {
        classId: input.classId,
        entity: ctx.entity,
        organizationId: ctx.organizationId,
        membership: ctx.membership,
        accountUserId: ctx.session.user.id,
      });
    }),
} satisfies TRPCRouterRecord;
