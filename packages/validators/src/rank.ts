import { z } from "zod/v4";

import { blockText, IdSchema, lineText } from "./fields";

// ─── Member rank + staff notes (v1.4, docs/issues/41) ────────────────────────

/**
 * Staff set/change a member's rank in one discipline (spec O4). `discipline`,
 * `belt`, and `stripes` are validated against the seeded rank system
 * (`isValidRank` in @matops/domain) in the router — kept as loose strings here so
 * the model stays general (a new belted art needs no validator change).
 */
export const SetMemberRankSchema = z.object({
  memberId: IdSchema,
  discipline: lineText(1, 40),
  belt: lineText(1, 40),
  stripes: z.number().int().min(0).max(20),
});
export type SetMemberRankInput = z.infer<typeof SetMemberRankSchema>;

/** Clear a member's rank in one discipline (spec O4 — a correction). */
export const ClearMemberRankSchema = z.object({
  memberId: IdSchema,
  discipline: lineText(1, 40),
});
export type ClearMemberRankInput = z.infer<typeof ClearMemberRankSchema>;

/** Staff add a private note about a member (spec O4). Never member-visible. */
export const AddMemberNoteSchema = z.object({
  memberId: IdSchema,
  body: blockText(1, 2000),
});
export type AddMemberNoteInput = z.infer<typeof AddMemberNoteSchema>;

/** Address a single staff note by id (delete). */
export const NoteIdSchema = z.object({ noteId: z.uuid() });
export type NoteIdInput = z.infer<typeof NoteIdSchema>;
