import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { TenantTx } from "@matops/db";
import { asc, desc, eq, inArray, sql } from "@matops/db";
import {
  classInstance,
  classTemplate,
  curriculumBlock,
  curriculumBlockTemplate,
  curriculumTrack,
} from "@matops/db/schema";
import {
  academyDay,
  canonicalCategory,
  categoryNames,
  editableFloor,
  endOfBlock,
  insertPlacement,
  isActiveMember,
  isStaff,
  MAX_SLOT_BLOCKS,
  movePlacement,
  placementForDate,
  placementState,
  removePlacement,
  rippleFrom,
} from "@matops/domain";
import {
  ClassIdSchema,
  CreateCurriculumBlockSchema,
  CreateCurriculumTrackSchema,
  CurriculumBlockIdSchema,
  CurriculumBoardSchema,
  CurriculumPlacementIdSchema,
  CurriculumSlotIdSchema,
  CurriculumTrackIdSchema,
  MoveCurriculumBlockSchema,
  PlaceCurriculumBlockSchema,
  RenameCurriculumTrackSchema,
  ResizeCurriculumBlockSchema,
  SetCurriculumRunNoteSchema,
  UpdateCurriculumBlockSchema,
} from "@matops/validators";

import { academyContext, academyTimeZone } from "../academy-tz";
import { liveClass } from "../classes";
import { curriculumEnrolledProcedure, curriculumStaffProcedure } from "../trpc";

interface BlockCtx {
  db: TenantTx;
  academyId: string;
}

interface SlotTheme {
  placementId: string;
  templateId: string;
  note: string | null;
}

/**
 * One stretch of weeks on a track. Several blocks can be taught over the same
 * stretch, so the sequence unit is the slot and the themes ride along on it.
 * The shape the domain rules see is unchanged, so `id` here is the SLOT id, the
 * thing every sequence rule and every ripple addresses. A single placed row is
 * addressed by `themes[].placementId`.
 */
interface StoredPlacement {
  id: string;
  startsOn: string;
  endsOn: string;
  weeks: number;
  themes: SlotTheme[];
}

interface Track {
  id: string;
  name: string;
  isDefault: boolean;
}

const TRACK_NOT_FOUND = "Track not found";

async function today(ctx: BlockCtx): Promise<string> {
  return academyDay(new Date(), await academyTimeZone(ctx));
}

/** Every track, the default first, then oldest first — the chip order on screen. */
function loadTracks(ctx: BlockCtx): Promise<Track[]> {
  return ctx.db
    .select({
      id: curriculumTrack.id,
      name: curriculumTrack.name,
      isDefault: curriculumTrack.isDefault,
    })
    .from(curriculumTrack)
    .orderBy(desc(curriculumTrack.isDefault), asc(curriculumTrack.createdAt));
}

/**
 * The track a read or write applies to. No id means the academy's default; the
 * ordering also covers an academy whose default row somehow went missing, so a
 * curriculum never becomes unreachable.
 */
async function resolveTrack(ctx: BlockCtx, trackId?: string): Promise<Track> {
  const tracks = await loadTracks(ctx);
  const track = trackId ? tracks.find((t) => t.id === trackId) : tracks[0];
  if (!track) {
    throw new TRPCError({ code: "NOT_FOUND", message: TRACK_NOT_FOUND });
  }
  return track;
}

/** The track one slot sits on — every ripple is scoped to it. */
async function trackOfSlot(ctx: BlockCtx, slotId: string): Promise<string> {
  const [row] = await ctx.db
    .select({ trackId: curriculumBlock.trackId })
    .from(curriculumBlock)
    .where(eq(curriculumBlock.slotId, slotId))
    .limit(1);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Block not found" });
  }
  return row.trackId;
}

function loadLibrary(ctx: BlockCtx) {
  return ctx.db
    .select({
      id: curriculumBlockTemplate.id,
      theme: curriculumBlockTemplate.theme,
      notes: curriculumBlockTemplate.notes,
      category: curriculumBlockTemplate.category,
      defaultWeeks: curriculumBlockTemplate.defaultWeeks,
    })
    .from(curriculumBlockTemplate)
    .orderBy(asc(curriculumBlockTemplate.theme));
}

async function loadPlan(
  ctx: BlockCtx,
  trackId: string,
): Promise<StoredPlacement[]> {
  const rows = await ctx.db
    .select({
      id: curriculumBlock.id,
      slotId: curriculumBlock.slotId,
      templateId: curriculumBlock.templateId,
      note: curriculumBlock.notes,
      startsOn: curriculumBlock.startsOn,
      endsOn: curriculumBlock.endsOn,
      weeks: curriculumBlock.weeks,
    })
    .from(curriculumBlock)
    .where(eq(curriculumBlock.trackId, trackId))
    .orderBy(asc(curriculumBlock.startsOn), asc(curriculumBlock.createdAt));
  const slots = new Map<string, StoredPlacement>();
  for (const row of rows) {
    const theme = {
      placementId: row.id,
      templateId: row.templateId,
      note: row.note,
    };
    const slot = slots.get(row.slotId);
    if (slot) slot.themes.push(theme);
    else {
      slots.set(row.slotId, {
        id: row.slotId,
        startsOn: row.startsOn,
        endsOn: row.endsOn,
        weeks: row.weeks,
        themes: [theme],
      });
    }
  }
  return [...slots.values()];
}

/**
 * Where each library block is placed, across EVERY track. The library is shared,
 * so a block used only in No-gi must still read as used while the owner stands
 * in Fundamentals — otherwise the delete guard lets it go.
 */
function loadUsage(ctx: BlockCtx) {
  return ctx.db
    .select({
      templateId: curriculumBlock.templateId,
      endsOn: curriculumBlock.endsOn,
      trackName: curriculumTrack.name,
    })
    .from(curriculumBlock)
    .innerJoin(
      curriculumTrack,
      eq(curriculumTrack.id, curriculumBlock.trackId),
    );
}

/**
 * The library rows a slot teaches, in the order they were added to it, each with
 * the note written for this run of it. The block's own notes say what the block
 * covers; the run note says what this stretch of weeks is doing about it.
 */
async function loadThemes(ctx: BlockCtx, placement: StoredPlacement) {
  const ids = placement.themes.map((on) => on.templateId);
  if (!ids.length) return [];
  const rows = await ctx.db
    .select({
      id: curriculumBlockTemplate.id,
      theme: curriculumBlockTemplate.theme,
      notes: curriculumBlockTemplate.notes,
    })
    .from(curriculumBlockTemplate)
    .where(inArray(curriculumBlockTemplate.id, ids));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return placement.themes.flatMap((on) => {
    const block = byId.get(on.templateId);
    return block
      ? [{ theme: block.theme, notes: block.notes, run: on.note }]
      : [];
  });
}

function locate(plan: StoredPlacement[], id: string) {
  const index = plan.findIndex((p) => p.id === id);
  const placement = plan[index];
  if (!placement) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Block not found" });
  }
  return { index, placement };
}

function planEnd(plan: StoredPlacement[], fallback: string): string {
  return plan.at(-1)?.endsOn ?? fallback;
}

/**
 * Write a whole rippled plan in one statement. A ripple from the top of a long
 * plan moves every slot after it, and one round trip per slot is the shape this
 * avoids. The domain already handed us the finished dates.
 */
async function writePlan(
  ctx: BlockCtx,
  before: StoredPlacement[],
  after: StoredPlacement[],
) {
  const was = new Map(before.map((p) => [p.id, p]));
  const changed = after.filter((placement) => {
    const prev = was.get(placement.id);
    return !(
      prev?.startsOn === placement.startsOn &&
      prev.endsOn === placement.endsOn &&
      prev.weeks === placement.weeks
    );
  });
  if (!changed.length) return;
  const rows = changed.map(
    (p) =>
      sql`(${p.id}::uuid, ${p.startsOn}::date, ${p.endsOn}::date, ${p.weeks}::integer)`,
  );
  await ctx.db.execute(sql`
    update ${curriculumBlock} as b
    set starts_on = v.starts_on,
        ends_on = v.ends_on,
        weeks = v.weeks,
        updated_at = now()
    from (values ${sql.join(rows, sql`, `)})
      as v(slot_id, starts_on, ends_on, weeks)
    where b.slot_id = v.slot_id
  `);
}

function requireEditable(
  plan: StoredPlacement[],
  index: number,
  day: string,
  message: string,
) {
  if (index < editableFloor(plan, day)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message });
  }
}

export const curriculumRouter = {
  board: curriculumStaffProcedure
    .input(CurriculumBoardSchema.optional())
    .query(async ({ ctx, input }) => {
      const day = await today(ctx);
      const tracks = await loadTracks(ctx);
      const active = input?.trackId
        ? tracks.find((t) => t.id === input.trackId)
        : tracks[0];
      if (!active) {
        throw new TRPCError({ code: "NOT_FOUND", message: TRACK_NOT_FOUND });
      }
      const library = await loadLibrary(ctx);
      const plan = await loadPlan(ctx, active.id);
      const usage = await loadUsage(ctx);
      const byTemplate = new Map<
        string,
        { used: number; lastEndsOn: string; tracks: Set<string> }
      >();
      for (const row of usage) {
        const seen = byTemplate.get(row.templateId);
        byTemplate.set(row.templateId, {
          used: (seen?.used ?? 0) + 1,
          lastEndsOn:
            !seen || row.endsOn > seen.lastEndsOn
              ? row.endsOn
              : seen.lastEndsOn,
          tracks: (seen?.tracks ?? new Set<string>()).add(row.trackName),
        });
      }
      const theme = new Map(library.map((b) => [b.id, b]));
      return {
        today: day,
        tracks: tracks.map(({ id, name, isDefault }) => ({
          id,
          name,
          isDefault,
        })),
        activeTrackId: active.id,
        firstEditableIndex: editableFloor(plan, day),
        categories: categoryNames(library),
        blocks: library.map((block) => {
          const seen = byTemplate.get(block.id);
          return {
            ...block,
            used: seen?.used ?? 0,
            lastEndsOn: seen?.lastEndsOn ?? null,
            tracks: seen
              ? [...seen.tracks].sort((a, b) => a.localeCompare(b))
              : [],
          };
        }),
        plan: plan.map((placement) => ({
          ...placement,
          themes: placement.themes.map((on) => ({
            placementId: on.placementId,
            templateId: on.templateId,
            note: on.note,
            theme: theme.get(on.templateId)?.theme ?? "Removed block",
            notes: theme.get(on.templateId)?.notes ?? null,
          })),
          state: placementState(placement, day),
        })),
      };
    }),

  /**
   * The themes planned for one class. The class picks its track through its
   * recurring template; a one-off, or a template nobody assigned, falls back to
   * the academy's default track. The track is read at request time and never
   * copied onto the class row, so re-pointing a template needs no backfill.
   */
  forClass: curriculumEnrolledProcedure
    .input(ClassIdSchema)
    .query(async ({ ctx, input }) => {
      const staff = isStaff(ctx.membership);
      if (!staff && !isActiveMember(ctx.membership)) return null;
      const academy = await academyContext(ctx);
      if (!staff && !academy.curriculumForStudents) return null;
      const [cls] = await ctx.db
        .select({
          startsAt: classInstance.startsAt,
          trackId: classTemplate.curriculumTrackId,
        })
        .from(classInstance)
        .leftJoin(classTemplate, eq(classTemplate.id, classInstance.templateId))
        .where(liveClass(input.id))
        .limit(1);
      if (!cls) return null;
      const tracks = await loadTracks(ctx);
      const track =
        tracks.find((t) => t.id === cls.trackId) ?? tracks[0] ?? null;
      if (!track) return null;
      const plan = await loadPlan(ctx, track.id);
      const placement = placementForDate(
        plan,
        academyDay(cls.startsAt, academy.timeZone),
      );
      if (!placement) return null;
      const themes = await loadThemes(ctx, placement);
      if (!themes.length) return null;
      return {
        themes: themes.map((block) => ({
          theme: block.theme,
          notes: staff ? block.notes : null,
          run: staff ? block.run : null,
        })),
      };
    }),

  createTrack: curriculumStaffProcedure
    .input(CreateCurriculumTrackSchema)
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(curriculumTrack)
        .values({ academyId: ctx.academyId, name: input.name })
        .returning({ id: curriculumTrack.id });
      if (!created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not add the track",
        });
      }
      return { id: created.id };
    }),

  renameTrack: curriculumStaffProcedure
    .input(RenameCurriculumTrackSchema)
    .mutation(async ({ ctx, input }) => {
      const renamed = await ctx.db
        .update(curriculumTrack)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(curriculumTrack.id, input.id))
        .returning({ id: curriculumTrack.id });
      if (!renamed.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: TRACK_NOT_FOUND });
      }
      return { ok: true as const };
    }),

  /**
   * Remove a track and the placements on it. The shared block library is never
   * touched. Classes that followed it go back to the default track, which is
   * what an unassigned class already reads, so nothing is left pointing at a
   * track that is gone. The default track itself stays.
   */
  deleteTrack: curriculumStaffProcedure
    .input(CurriculumTrackIdSchema)
    .mutation(async ({ ctx, input }) => {
      const track = await resolveTrack(ctx, input.id);
      if (track.isDefault) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "This is the default track, which every unassigned class follows. Rename it instead.",
        });
      }
      const detached = await ctx.db
        .update(classTemplate)
        .set({ curriculumTrackId: null, updatedAt: new Date() })
        .where(eq(classTemplate.curriculumTrackId, track.id))
        .returning({ id: classTemplate.id });
      await ctx.db
        .delete(curriculumBlock)
        .where(eq(curriculumBlock.trackId, track.id));
      await ctx.db
        .delete(curriculumTrack)
        .where(eq(curriculumTrack.id, track.id));
      return { detached: detached.length };
    }),

  createBlock: curriculumStaffProcedure
    .input(CreateCurriculumBlockSchema)
    .mutation(async ({ ctx, input }) => {
      const known = categoryNames(await loadLibrary(ctx));
      const [created] = await ctx.db
        .insert(curriculumBlockTemplate)
        .values({
          academyId: ctx.academyId,
          theme: input.theme,
          notes: input.notes?.length ? input.notes : null,
          category: canonicalCategory(input.category, known),
          defaultWeeks: input.defaultWeeks,
        })
        .returning({ id: curriculumBlockTemplate.id });
      if (!created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not add the block",
        });
      }
      return { id: created.id };
    }),

  updateBlock: curriculumStaffProcedure
    .input(UpdateCurriculumBlockSchema)
    .mutation(async ({ ctx, input }) => {
      const known = categoryNames(
        (await loadLibrary(ctx)).filter((b) => b.id !== input.id),
      );
      const updated = await ctx.db
        .update(curriculumBlockTemplate)
        .set({
          theme: input.theme,
          notes: input.notes?.length ? input.notes : null,
          category: canonicalCategory(input.category, known),
          defaultWeeks: input.defaultWeeks,
          updatedAt: new Date(),
        })
        .where(eq(curriculumBlockTemplate.id, input.id))
        .returning({ id: curriculumBlockTemplate.id });
      if (!updated.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Block not found" });
      }
      return { ok: true as const };
    }),

  deleteBlock: curriculumStaffProcedure
    .input(CurriculumBlockIdSchema)
    .mutation(async ({ ctx, input }) => {
      const uses = (await loadUsage(ctx)).filter(
        (u) => u.templateId === input.blockId,
      );
      if (uses.length) {
        const where = [...new Set(uses.map((u) => u.trackName))].join(", ");
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `This block is on the plan ${uses.length === 1 ? "once" : `${uses.length} times`} (${where}). Take it off the timeline first.`,
        });
      }
      await ctx.db
        .delete(curriculumBlockTemplate)
        .where(eq(curriculumBlockTemplate.id, input.blockId));
      return { ok: true as const };
    }),

  place: curriculumStaffProcedure
    .input(PlaceCurriculumBlockSchema)
    .mutation(async ({ ctx, input }) => {
      const day = await today(ctx);
      const track = await resolveTrack(ctx, input.trackId);
      const [block] = await ctx.db
        .select({
          id: curriculumBlockTemplate.id,
          theme: curriculumBlockTemplate.theme,
          defaultWeeks: curriculumBlockTemplate.defaultWeeks,
        })
        .from(curriculumBlockTemplate)
        .where(eq(curriculumBlockTemplate.id, input.blockId))
        .limit(1);
      if (!block) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Block not found" });
      }
      const plan = await loadPlan(ctx, track.id);
      const refuse =
        "A block can only go on a part of the plan that has not already run.";

      if (input.slotId) {
        const { index, placement } = locate(plan, input.slotId);
        requireEditable(plan, index, day, refuse);
        if (placement.themes.length >= MAX_SLOT_BLOCKS) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `One stretch of weeks holds ${MAX_SLOT_BLOCKS} blocks at most.`,
          });
        }
        if (placement.themes.some((on) => on.templateId === block.id)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `${block.theme} is already on those weeks.`,
          });
        }
        const [added] = await ctx.db
          .insert(curriculumBlock)
          .values({
            academyId: ctx.academyId,
            trackId: track.id,
            slotId: placement.id,
            templateId: block.id,
            notes: input.note?.length ? input.note : null,
            startsOn: placement.startsOn,
            endsOn: placement.endsOn,
            weeks: placement.weeks,
          })
          .returning({ id: curriculumBlock.id });
        if (!added) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not add the block to the plan",
          });
        }
        return {
          slotId: placement.id,
          theme: block.theme,
          moved: 0,
          endsOn: planEnd(plan, placement.endsOn),
        };
      }

      const atIndex = Math.min(input.atIndex, plan.length);
      requireEditable(plan, atIndex, day, refuse);
      const weeks = input.weeks ?? block.defaultWeeks;
      const slotId = crypto.randomUUID();
      const [created] = await ctx.db
        .insert(curriculumBlock)
        .values({
          academyId: ctx.academyId,
          trackId: track.id,
          slotId,
          templateId: block.id,
          notes: input.note?.length ? input.note : null,
          startsOn: day,
          endsOn: endOfBlock(day, weeks),
          weeks,
        })
        .returning({ id: curriculumBlock.id });
      if (!created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not add the block to the plan",
        });
      }
      const placed: StoredPlacement = {
        id: slotId,
        startsOn: day,
        endsOn: endOfBlock(day, weeks),
        weeks,
        themes: [
          {
            placementId: created.id,
            templateId: block.id,
            note: input.note?.length ? input.note : null,
          },
        ],
      };
      const after = insertPlacement(plan, atIndex, placed, day);
      await writePlan(ctx, [...plan, placed], after);
      return {
        slotId,
        theme: block.theme,
        moved: plan.length - atIndex,
        endsOn: planEnd(after, placed.endsOn),
      };
    }),

  resize: curriculumStaffProcedure
    .input(ResizeCurriculumBlockSchema)
    .mutation(async ({ ctx, input }) => {
      const day = await today(ctx);
      const plan = await loadPlan(ctx, await trackOfSlot(ctx, input.slotId));
      const { index, placement } = locate(plan, input.slotId);
      const state = placementState(placement, day);
      if (state === "settled") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "That block has already run, so its dates are fixed.",
        });
      }
      const after = rippleFrom(plan, index, input.weeks);
      await writePlan(ctx, plan, after);
      return {
        previousWeeks: placement.weeks,
        moved: after.length - index - 1,
        endsOn: planEnd(after, placement.endsOn),
      };
    }),

  move: curriculumStaffProcedure
    .input(MoveCurriculumBlockSchema)
    .mutation(async ({ ctx, input }) => {
      const day = await today(ctx);
      const plan = await loadPlan(ctx, await trackOfSlot(ctx, input.slotId));
      const { index, placement } = locate(plan, input.slotId);
      const toIndex = Math.min(input.toIndex, plan.length - 1);
      const refuse = "A block that has already run cannot be moved.";
      requireEditable(plan, index, day, refuse);
      requireEditable(plan, toIndex, day, refuse);
      const after = movePlacement(plan, index, toIndex);
      await writePlan(ctx, plan, after);
      return {
        fromIndex: index,
        endsOn: planEnd(after, placement.endsOn),
      };
    }),

  unplace: curriculumStaffProcedure
    .input(CurriculumSlotIdSchema)
    .mutation(async ({ ctx, input }) => {
      const day = await today(ctx);
      const plan = await loadPlan(ctx, await trackOfSlot(ctx, input.slotId));
      const { index, placement } = locate(plan, input.slotId);
      requireEditable(
        plan,
        index,
        day,
        "A block that has already run cannot be taken off the plan.",
      );
      await ctx.db
        .delete(curriculumBlock)
        .where(eq(curriculumBlock.slotId, input.slotId));
      const after = removePlacement(plan, index);
      await writePlan(ctx, plan, after);
      return { endsOn: planEnd(after, placement.startsOn) };
    }),

  /**
   * What this run of a block is doing, as opposed to what the block covers. It
   * belongs to the placement, so editing it changes no other run and the block's
   * own notes stay as they are. A settled stretch accepts it: the note is a
   * record of weeks that happened, which is the one thing about the past still
   * worth writing down.
   */
  setRunNote: curriculumStaffProcedure
    .input(SetCurriculumRunNoteSchema)
    .mutation(async ({ ctx, input }) => {
      const saved = await ctx.db
        .update(curriculumBlock)
        .set({
          notes: input.note?.length ? input.note : null,
          updatedAt: new Date(),
        })
        .where(eq(curriculumBlock.id, input.placementId))
        .returning({ id: curriculumBlock.id });
      if (!saved.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Block not found" });
      }
      return { ok: true as const };
    }),

  /**
   * Drop one theme from a stretch that teaches several. The dates belong to the
   * stretch, so nothing moves; the last theme has to leave through `unplace`,
   * which takes the whole stretch off and ripples.
   */
  removeTheme: curriculumStaffProcedure
    .input(CurriculumPlacementIdSchema)
    .mutation(async ({ ctx, input }) => {
      const day = await today(ctx);
      const [row] = await ctx.db
        .select({
          slotId: curriculumBlock.slotId,
          trackId: curriculumBlock.trackId,
        })
        .from(curriculumBlock)
        .where(eq(curriculumBlock.id, input.placementId))
        .limit(1);
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Block not found" });
      }
      const plan = await loadPlan(ctx, row.trackId);
      const { index, placement } = locate(plan, row.slotId);
      requireEditable(
        plan,
        index,
        day,
        "A block that has already run cannot be taken off the plan.",
      );
      if (placement.themes.length <= 1) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "That is the only block on those weeks. Take the whole stretch off instead.",
        });
      }
      await ctx.db
        .delete(curriculumBlock)
        .where(eq(curriculumBlock.id, input.placementId));
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
