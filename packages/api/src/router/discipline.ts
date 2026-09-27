import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import {
  and,
  asc,
  bumpScheduleRevision,
  eq,
  gt,
  isNull,
  lockAndReadScheduleRevision,
  ne,
  sql,
} from "@matops/db";
import {
  academyDiscipline,
  classInstance,
  classTemplate,
} from "@matops/db/schema";
import {
  AddDisciplineSchema,
  DisciplineIdSchema,
  RenameDisciplineSchema,
} from "@matops/validators";

import { branchManagerProcedure, enrolledProcedure } from "../trpc";

const duplicateName = () =>
  new TRPCError({
    code: "CONFLICT",
    message: "This discipline is already in the academy's list.",
  });

const missingDiscipline = () =>
  new TRPCError({
    code: "NOT_FOUND",
    message: "Discipline not found in this academy.",
  });

export const disciplineRouter = {
  list: enrolledProcedure.query(({ ctx }) =>
    ctx.db
      .select({ id: academyDiscipline.id, name: academyDiscipline.name })
      .from(academyDiscipline)
      .where(eq(academyDiscipline.academyId, ctx.academyId))
      .orderBy(asc(academyDiscipline.name)),
  ),

  add: branchManagerProcedure
    .input(AddDisciplineSchema)
    .mutation(async ({ ctx, input }) => {
      await lockAndReadScheduleRevision(ctx.db, ctx.academyId);
      const [row] = await ctx.db
        .insert(academyDiscipline)
        .values({ academyId: ctx.academyId, name: input.name })
        .onConflictDoNothing()
        .returning({ id: academyDiscipline.id, name: academyDiscipline.name });
      if (!row) throw duplicateName();
      await bumpScheduleRevision(ctx.db, ctx.academyId);
      return row;
    }),

  rename: branchManagerProcedure
    .input(RenameDisciplineSchema)
    .mutation(async ({ ctx, input }) => {
      await lockAndReadScheduleRevision(ctx.db, ctx.academyId);
      const [existing] = await ctx.db
        .select({ name: academyDiscipline.name })
        .from(academyDiscipline)
        .where(
          and(
            eq(academyDiscipline.id, input.id),
            eq(academyDiscipline.academyId, ctx.academyId),
          ),
        )
        .limit(1);
      if (!existing) throw missingDiscipline();
      if (existing.name === input.name)
        return { id: input.id, name: input.name };
      const [duplicate] = await ctx.db
        .select({ id: academyDiscipline.id })
        .from(academyDiscipline)
        .where(
          and(
            eq(academyDiscipline.academyId, ctx.academyId),
            ne(academyDiscipline.id, input.id),
            eq(
              sql`lower(${academyDiscipline.name})`,
              sql`lower(${input.name})`,
            ),
          ),
        )
        .limit(1);
      if (duplicate) throw duplicateName();
      const [row] = await ctx.db
        .update(academyDiscipline)
        .set({ name: input.name })
        .where(
          and(
            eq(academyDiscipline.id, input.id),
            eq(academyDiscipline.academyId, ctx.academyId),
          ),
        )
        .returning({ id: academyDiscipline.id, name: academyDiscipline.name });
      if (!row) throw missingDiscipline();
      await ctx.db
        .update(classTemplate)
        .set({ discipline: row.name })
        .where(
          and(
            eq(classTemplate.academyId, ctx.academyId),
            eq(classTemplate.discipline, existing.name),
          ),
        );
      await ctx.db
        .update(classInstance)
        .set({ discipline: row.name })
        .where(
          and(
            eq(classInstance.academyId, ctx.academyId),
            eq(classInstance.discipline, existing.name),
            eq(classInstance.status, "scheduled"),
            isNull(classInstance.deletedAt),
            gt(classInstance.startsAt, new Date()),
          ),
        );
      await bumpScheduleRevision(ctx.db, ctx.academyId);
      return row;
    }),

  remove: branchManagerProcedure
    .input(DisciplineIdSchema)
    .mutation(async ({ ctx, input }) => {
      await lockAndReadScheduleRevision(ctx.db, ctx.academyId);
      const [existing] = await ctx.db
        .delete(academyDiscipline)
        .where(
          and(
            eq(academyDiscipline.id, input.id),
            eq(academyDiscipline.academyId, ctx.academyId),
          ),
        )
        .returning({ name: academyDiscipline.name });
      if (!existing) throw missingDiscipline();
      await ctx.db
        .update(classTemplate)
        .set({ discipline: null })
        .where(
          and(
            eq(classTemplate.academyId, ctx.academyId),
            eq(classTemplate.discipline, existing.name),
          ),
        );
      await ctx.db
        .update(classInstance)
        .set({ discipline: null })
        .where(
          and(
            eq(classInstance.academyId, ctx.academyId),
            eq(classInstance.discipline, existing.name),
            eq(classInstance.status, "scheduled"),
            isNull(classInstance.deletedAt),
            gt(classInstance.startsAt, new Date()),
          ),
        );
      await bumpScheduleRevision(ctx.db, ctx.academyId);
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
