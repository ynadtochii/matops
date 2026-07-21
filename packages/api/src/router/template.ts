import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import { and, desc, eq, gt, isNull, materializeTemplate } from "@matops/db";
import { classInstance, classTemplate } from "@matops/db/schema";
import { normalizeDaysOfWeek, templateTimingChanged } from "@matops/domain";
import {
  CreateClassTemplateSchema,
  TemplateIdSchema,
  TemplateStatusSchema,
  UpdateClassTemplateSchema,
} from "@matops/validators";

import { staffProcedure } from "../trpc";

/**
 * Recurring class templates (spec O3, docs/issues/08, 16). Staff-only CRUD.
 *
 * Every query runs on `ctx.db` — the per-request tenant transaction — so Postgres
 * RLS scopes reads and writes to the active academy (docs/issues/12); the router
 * never filters by academy_id itself, and `WITH CHECK` blocks writing a foreign
 * academy_id. Slice 2.2 wires lazy materialization into create/update; here the
 * rows just persist.
 */
export const templateRouter = {
  /** All live templates for the active academy, newest first. */
  list: staffProcedure.query(({ ctx }) => {
    return ctx.db
      .select()
      .from(classTemplate)
      .where(isNull(classTemplate.deletedAt))
      .orderBy(desc(classTemplate.createdAt));
  }),

  /** Create a recurring template. `instructorId` defaults to the acting staff member. */
  create: staffProcedure
    .input(CreateClassTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(classTemplate)
        .values({
          academyId: ctx.academyId,
          instructorId: input.instructorId ?? ctx.session.user.id,
          title: input.title,
          discipline: input.discipline ?? null,
          daysOfWeek: normalizeDaysOfWeek(input.daysOfWeek),
          startsAtMinutes: input.startsAtMinutes,
          durationMinutes: input.durationMinutes,
          timeZone: input.timeZone,
          capacity: input.capacity,
        })
        .returning();
      // Lazy materialization (docs/issues/16): fill the near-term classes in the
      // same request/tx (RLS-scoped to this academy) so they appear immediately.
      if (row) await materializeTemplate(ctx.db, row);
      return row;
    }),

  /**
   * Edit a template's recurring definition. RLS scopes the row to this academy.
   *
   * Propagates to FUTURE, non-cancelled instances only (spec §4) — past and
   * cancelled classes are untouched. A TIMING change (days / start / zone) moves
   * or adds/removes occurrences, so future scheduled instances are dropped and
   * re-materialized. A content-only change (title / discipline / instructor /
   * capacity / duration) is applied in place, preserving the instance rows.
   */
  update: staffProcedure
    .input(UpdateClassTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      const [prev] = await ctx.db
        .select()
        .from(classTemplate)
        .where(
          and(eq(classTemplate.id, input.id), isNull(classTemplate.deletedAt)),
        );
      if (!prev) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }

      const [row] = await ctx.db
        .update(classTemplate)
        .set({
          instructorId: input.instructorId ?? ctx.session.user.id,
          title: input.title,
          discipline: input.discipline ?? null,
          daysOfWeek: normalizeDaysOfWeek(input.daysOfWeek),
          startsAtMinutes: input.startsAtMinutes,
          durationMinutes: input.durationMinutes,
          timeZone: input.timeZone,
          capacity: input.capacity,
        })
        .where(eq(classTemplate.id, prev.id))
        .returning();
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }

      const now = new Date();
      const futureScheduled = and(
        eq(classInstance.templateId, row.id),
        eq(classInstance.status, "scheduled"),
        isNull(classInstance.deletedAt),
        gt(classInstance.startsAt, now),
      );

      if (templateTimingChanged(prev, row)) {
        // Regenerate: drop future scheduled instances, then re-materialize from
        // now with the new timing (cursor reset via generatedUntil: null).
        await ctx.db.delete(classInstance).where(futureScheduled);
        await materializeTemplate(
          ctx.db,
          { ...row, generatedUntil: null },
          { now },
        );
      } else {
        // Content-only: update the future scheduled instances in place.
        await ctx.db
          .update(classInstance)
          .set({
            title: row.title,
            discipline: row.discipline,
            instructorId: row.instructorId,
            durationMinutes: row.durationMinutes,
            capacity: row.capacity,
          })
          .where(futureScheduled);
      }
      return row;
    }),

  /** Pause (stop future generation) or resume a template (spec O3, docs/issues/16). */
  setStatus: staffProcedure
    .input(TemplateStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .update(classTemplate)
        .set({ status: input.status })
        .where(
          and(eq(classTemplate.id, input.id), isNull(classTemplate.deletedAt)),
        )
        .returning();
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }
      // Resuming fills the horizon at once so classes reappear immediately (O2).
      if (row.status === "active") await materializeTemplate(ctx.db, row);
      return row;
    }),

  /**
   * Soft-delete a template + cancel its FUTURE classes (spec §4). Stops
   * generation; past and already-cancelled classes are kept, and booking/
   * attendance history on any instance is preserved (cancel is status-only).
   */
  delete: staffProcedure
    .input(TemplateIdSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const [row] = await ctx.db
        .update(classTemplate)
        .set({ deletedAt: now })
        .where(
          and(eq(classTemplate.id, input.id), isNull(classTemplate.deletedAt)),
        )
        .returning({ id: classTemplate.id });
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }
      await ctx.db
        .update(classInstance)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(classInstance.templateId, row.id),
            eq(classInstance.status, "scheduled"),
            isNull(classInstance.deletedAt),
            gt(classInstance.startsAt, now),
          ),
        );
      // TODO(phase 4): notify booked students of each cancelled class.
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
