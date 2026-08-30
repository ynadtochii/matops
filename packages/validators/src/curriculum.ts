import { z } from "zod/v4";

import {
  MAX_BLOCK_WEEKS,
  MAX_CATEGORY_LENGTH,
  MAX_TRACK_NAME_LENGTH,
} from "@matops/domain";

import { blockText, IdSchema, lineText } from "./fields";

const WeeksSchema = z.number().int().min(1).max(MAX_BLOCK_WEEKS);
const CategorySchema = z
  .union([lineText(0, MAX_CATEGORY_LENGTH), z.null()])
  .optional();
const IndexSchema = z.number().int().min(0).max(500);

export const CreateCurriculumBlockSchema = z.object({
  theme: lineText(1, 80),
  notes: blockText(0, 2000).nullish(),
  category: CategorySchema,
  defaultWeeks: WeeksSchema,
});
export type CreateCurriculumBlockInput = z.infer<
  typeof CreateCurriculumBlockSchema
>;

export const UpdateCurriculumBlockSchema = z.object({
  id: IdSchema,
  theme: lineText(1, 80),
  notes: blockText(0, 2000).nullish(),
  category: CategorySchema,
  defaultWeeks: WeeksSchema,
});
export type UpdateCurriculumBlockInput = z.infer<
  typeof UpdateCurriculumBlockSchema
>;

/** A block in the shared library (`curriculum_block_template`). */
export const CurriculumBlockIdSchema = z.object({ blockId: IdSchema });

/** One stretch of weeks on a track: every row sharing a `slot_id`. */
export const CurriculumSlotIdSchema = z.object({ slotId: IdSchema });

/** One library block placed on one stretch: a single `curriculum_block` row. */
export const CurriculumPlacementIdSchema = z.object({ placementId: IdSchema });

export const CreateCurriculumTrackSchema = z.object({
  name: lineText(1, MAX_TRACK_NAME_LENGTH),
});
export type CreateCurriculumTrackInput = z.infer<
  typeof CreateCurriculumTrackSchema
>;

export const RenameCurriculumTrackSchema = z.object({
  id: IdSchema,
  name: lineText(1, MAX_TRACK_NAME_LENGTH),
});
export type RenameCurriculumTrackInput = z.infer<
  typeof RenameCurriculumTrackSchema
>;

export const CurriculumTrackIdSchema = z.object({ id: IdSchema });

export const CurriculumBoardSchema = z.object({
  trackId: IdSchema.optional(),
});

export const PlaceCurriculumBlockSchema = z.object({
  trackId: IdSchema,
  blockId: IdSchema,
  atIndex: IndexSchema,
  weeks: WeeksSchema.optional(),
  slotId: IdSchema.optional(),
  note: blockText(0, 2000).nullish(),
});
export type PlaceCurriculumBlockInput = z.infer<
  typeof PlaceCurriculumBlockSchema
>;

export const SetCurriculumRunNoteSchema = z.object({
  placementId: IdSchema,
  note: blockText(0, 2000).nullish(),
});
export type SetCurriculumRunNoteInput = z.infer<
  typeof SetCurriculumRunNoteSchema
>;

export const ResizeCurriculumBlockSchema = z.object({
  slotId: IdSchema,
  weeks: WeeksSchema,
});
export type ResizeCurriculumBlockInput = z.infer<
  typeof ResizeCurriculumBlockSchema
>;

export const MoveCurriculumBlockSchema = z.object({
  slotId: IdSchema,
  toIndex: IndexSchema,
});
export type MoveCurriculumBlockInput = z.infer<
  typeof MoveCurriculumBlockSchema
>;
