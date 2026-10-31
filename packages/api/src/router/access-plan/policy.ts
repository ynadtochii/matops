import type { TRPCRouterRecord } from "@trpc/server";

import { and, eq, isNull } from "@matops/db";
import { entity, membershipPolicy } from "@matops/db/schema";
import { resolveAcademyTimeZone } from "@matops/domain";
import { MembershipPolicySchema } from "@matops/validators";

import { organizationManagerProcedure } from "../../trpc";

const DEFAULT_MEMBERSHIP_GRACE_DAYS = 7;

export const membershipPolicyProcedures = {
  /**
   * The organization's membership settings, with sane answers before anybody
   * has opened the screen.
   *
   * `calendarTimeZone` is null until the owner picks one, so `effective` is
   * what the deadlines are actually counted in: their choice, else the default
   * branch's own zone, else UTC. `suggested` is what the form offers, which is
   * the same branch zone, so opening the screen and saving changes nothing.
   */
  policy: organizationManagerProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({
        graceDays: membershipPolicy.graceDays,
        calendarTimeZone: membershipPolicy.calendarTimeZone,
      })
      .from(membershipPolicy);
    const [home] = await ctx.db
      .select({ timeZone: entity.timeZone })
      .from(entity)
      .where(and(eq(entity.isDefault, true), isNull(entity.deletedAt)))
      .limit(1);

    const suggested = resolveAcademyTimeZone(home?.timeZone);
    return {
      graceDays: row?.graceDays ?? DEFAULT_MEMBERSHIP_GRACE_DAYS,
      calendarTimeZone: row?.calendarTimeZone ?? null,
      suggested,
      effective: row?.calendarTimeZone ?? suggested,
    };
  }),

  /**
   * Save them. Creates the row the first time, so nothing has to seed it.
   *
   * A REPLACE, not a patch: every field is written on every call, which is why
   * one form on the Settings screen carries all of them. Two forms writing this
   * would blank each other's field (ADR 127).
   */
  setPolicy: organizationManagerProcedure
    .input(MembershipPolicySchema)
    .mutation(async ({ ctx, input }) => {
      const next = {
        graceDays: input.graceDays,
        calendarTimeZone: input.calendarTimeZone ?? null,
      };
      await ctx.db
        .insert(membershipPolicy)
        .values({ organizationId: ctx.organizationId, ...next })
        .onConflictDoUpdate({
          target: membershipPolicy.organizationId,
          set: next,
        });
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
