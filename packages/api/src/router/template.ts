import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import {
  and,
  bumpScheduleRevision,
  desc,
  eq,
  eventRole,
  getTableColumns,
  gt,
  inArray,
  isNull,
  lockAndReadScheduleRevision,
  materializeTemplate,
  planRebuild,
  rebuildSchedule,
  recordActivity,
  recordMilestone,
} from "@matops/db";
import { classInstance, classTemplate, user } from "@matops/db/schema";
import { normalizeDaysOfWeek, templateEditStrategy } from "@matops/domain";
import {
  CreateClassTemplateSchema,
  RebuildScheduleSchema,
  TemplateIdSchema,
  TemplateStatusSchema,
  UpdateClassTemplateSchema,
} from "@matops/validators";

import { requireCatalogDiscipline } from "../discipline";
import { requireInstructor } from "../members";
import { TEMPLATE_NOT_FOUND } from "../messages";
import { notifyClassCancelled, notifyClassChanged } from "../notify";
import { branchManagerProcedure, staffProcedure } from "../trpc";
import { notifyBooked } from "./class";

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
      .select({
        ...getTableColumns(classTemplate),
        instructorName: user.name,
      })
      .from(classTemplate)
      .leftJoin(user, eq(user.id, classTemplate.instructorId))
      .where(isNull(classTemplate.deletedAt))
      .orderBy(desc(classTemplate.createdAt));
  }),

  /** Create a recurring template. `instructorId` defaults to the acting staff member. */
  create: staffProcedure
    .input(CreateClassTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      await lockAndReadScheduleRevision(ctx.db, ctx.academyId);
      await requireCatalogDiscipline(ctx.db, ctx.academyId, input.discipline);
      const instructorId = input.instructorId ?? ctx.session.user.id;
      if (instructorId !== ctx.session.user.id) {
        await requireInstructor(ctx, instructorId);
      }
      const [row] = await ctx.db
        .insert(classTemplate)
        .values({
          academyId: ctx.academyId,
          instructorId,
          title: input.title,
          description: input.description,
          discipline: input.discipline ?? null,
          capacityPolicy: "soft",
          daysOfWeek: normalizeDaysOfWeek(input.daysOfWeek),
          startsAtMinutes: input.startsAtMinutes,
          durationMinutes: input.durationMinutes,
          timeZone: input.timeZone,
          capacity: input.capacity,
        })
        .returning();
      // Lazy materialization (docs/issues/16): fill the near-term classes in the
      // same request/tx (RLS-scoped to this academy) so they appear immediately.
      if (row) {
        await materializeTemplate(ctx.db, row);
        await bumpScheduleRevision(ctx.db, ctx.academyId);
      }
      ctx.afterCommit(async (exec) => {
        const event = {
          organizationId: ctx.organizationId,
          entityId: ctx.academyId,
          actorRole: eventRole(ctx.membership.role),
        };
        await recordMilestone({ ...event, name: "first_schedule" }, exec);
        await recordActivity({ ...event, name: "staff_action" }, exec);
      });
      return row;
    }),

  /**
   * Edit a template's recurring definition. RLS scopes the row to this academy.
   *
   * Propagates to FUTURE, non-cancelled instances only (spec §4) — past and
   * cancelled classes are untouched. A TIMING change (days / start / zone) moves
   * or adds/removes occurrences, so future scheduled instances are cancelled and
   * re-materialized (the ones the new timing still covers are revived). A content-only change (title / discipline / instructor /
   * capacity / duration) is applied in place, preserving the instance rows.
   */
  update: staffProcedure
    .input(UpdateClassTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      await lockAndReadScheduleRevision(ctx.db, ctx.academyId);
      await requireCatalogDiscipline(ctx.db, ctx.academyId, input.discipline);
      const [prev] = await ctx.db
        .select()
        .from(classTemplate)
        .where(
          and(eq(classTemplate.id, input.id), isNull(classTemplate.deletedAt)),
        );
      if (!prev) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: TEMPLATE_NOT_FOUND,
        });
      }

      // `null` is an answer: "nobody teaches this". Only a MISSING field falls
      // back to the coach the template already had.
      const instructorId =
        input.instructorId === undefined
          ? prev.instructorId
          : input.instructorId;
      if (instructorId !== null && instructorId !== prev.instructorId) {
        await requireInstructor(ctx, instructorId);
      }
      const [row] = await ctx.db
        .update(classTemplate)
        .set({
          // On EDIT the fallback is the template's own instructor. A client that
          // sends nothing must not hand the template to whoever opened the form.
          instructorId,
          title: input.title,
          description: input.description,
          discipline: input.discipline ?? null,
          capacityPolicy: "soft",
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
          message: TEMPLATE_NOT_FOUND,
        });
      }

      const now = new Date();
      const futureScheduled = and(
        eq(classInstance.templateId, row.id),
        eq(classInstance.status, "scheduled"),
        isNull(classInstance.deletedAt),
        gt(classInstance.startsAt, now),
      );

      const strategy = templateEditStrategy(prev, row);
      if (strategy === "regenerate") {
        // CANCEL the future scheduled instances rather than deleting them:
        // `class_participation` and `drop_in_visit` both reference `class.id`
        // with ON DELETE no action, so a hard delete fails the moment one
        // student has booked, and the owner could never move that template
        // again.
        const affected = await ctx.db
          .update(classInstance)
          .set({ status: "cancelled" })
          .where(futureScheduled)
          .returning({ id: classInstance.id });
        await materializeTemplate(
          ctx.db,
          { ...row, generatedUntil: null },
          { now, reviveCancelled: true },
        );
        if (affected.length > 0) {
          const cancelled = await ctx.db
            .select({
              id: classInstance.id,
              title: classInstance.title,
              startsAt: classInstance.startsAt,
              updatedAt: classInstance.updatedAt,
            })
            .from(classInstance)
            .where(
              and(
                inArray(
                  classInstance.id,
                  affected.map((item) => item.id),
                ),
                eq(classInstance.status, "cancelled"),
              ),
            );
          for (const item of cancelled) {
            await notifyBooked(
              ctx,
              item,
              "class_cancelled",
              notifyClassCancelled,
            );
          }
        }
      } else if (strategy === "update-in-place") {
        const affected = await ctx.db
          .update(classInstance)
          .set({
            title: row.title,
            description: row.description,
            discipline: row.discipline,
            instructorId: row.instructorId,
            durationMinutes: row.durationMinutes,
            capacity: row.capacity,
          })
          .where(futureScheduled)
          .returning({
            id: classInstance.id,
            title: classInstance.title,
            startsAt: classInstance.startsAt,
            updatedAt: classInstance.updatedAt,
          });
        if (row.instructorId !== prev.instructorId) {
          for (const item of affected) {
            await notifyBooked(ctx, item, "class_changed", notifyClassChanged);
          }
        }
      }
      await bumpScheduleRevision(ctx.db, ctx.academyId);
      return row;
    }),

  /** Pause (stop future generation) or resume a template (spec O3, docs/issues/16). */
  setStatus: staffProcedure
    .input(TemplateStatusSchema)
    .mutation(async ({ ctx, input }) => {
      await lockAndReadScheduleRevision(ctx.db, ctx.academyId);
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
          message: TEMPLATE_NOT_FOUND,
        });
      }
      // Resuming fills the horizon at once so classes reappear immediately (O2).
      if (row.status === "active") await materializeTemplate(ctx.db, row);
      await bumpScheduleRevision(ctx.db, ctx.academyId);
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
      await lockAndReadScheduleRevision(ctx.db, ctx.academyId);
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
          message: TEMPLATE_NOT_FOUND,
        });
      }
      const cancelled = await ctx.db
        .update(classInstance)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(classInstance.templateId, row.id),
            eq(classInstance.status, "scheduled"),
            isNull(classInstance.deletedAt),
            gt(classInstance.startsAt, now),
          ),
        )
        .returning({
          id: classInstance.id,
          title: classInstance.title,
          startsAt: classInstance.startsAt,
          updatedAt: classInstance.updatedAt,
        });
      for (const item of cancelled) {
        await notifyBooked(ctx, item, "class_cancelled", notifyClassCancelled);
      }
      await bumpScheduleRevision(ctx.db, ctx.academyId);
      return { ok: true as const };
    }),

  /**
   * What a rebuild would remove, so the confirm dialog can name the damage
   * before the owner commits to it. Reads only.
   */
  rebuildPreview: branchManagerProcedure.query(async ({ ctx }) => {
    const version = await lockAndReadScheduleRevision(ctx.db, ctx.academyId);
    const plan = await planRebuild(ctx.db);
    return { ...plan, version };
  }),

  extend: branchManagerProcedure.mutation(async ({ ctx }) => {
    await lockAndReadScheduleRevision(ctx.db, ctx.academyId);
    const templates = await ctx.db
      .select()
      .from(classTemplate)
      .where(
        and(
          eq(classTemplate.status, "active"),
          isNull(classTemplate.deletedAt),
        ),
      );
    let created = 0;
    for (const template of templates) {
      created += await materializeTemplate(ctx.db, template);
    }
    if (templates.length > 0) {
      await bumpScheduleRevision(ctx.db, ctx.academyId);
    }
    const plan = await planRebuild(ctx.db);
    return { created, generatedThrough: plan.generatedThrough };
  }),

  /**
   * Rebuild the forward schedule from the active templates (spec O3, ADR 79).
   * Owner-only: an instructor runs the desk, not a destructive regeneration of
   * everyone's calendar. Past classes and their attendance are never touched,
   * and a one-off the owner entered by hand survives.
   */
  rebuild: branchManagerProcedure
    .input(RebuildScheduleSchema)
    .mutation(async ({ ctx, input }) => {
      const version = await lockAndReadScheduleRevision(ctx.db, ctx.academyId);
      if (version !== input.version) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "The schedule changed. Review the rebuild again.",
        });
      }
      try {
        const result = await rebuildSchedule(ctx.db);
        if (result.cancelled + result.created > 0 || result.generatedThrough) {
          await bumpScheduleRevision(ctx.db, ctx.academyId);
        }
        return result;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("active bookings")
        ) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        throw error;
      }
    }),
} satisfies TRPCRouterRecord;
