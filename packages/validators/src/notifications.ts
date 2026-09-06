import { z } from "zod/v4";

import { blockText, IdSchema, lineText } from "./fields";

// ─── Notification center (v3.7, ADR 77) ─────────────────────────────────────

/**
 * Owner-written gym news. The body is bounded at 1000 characters on purpose:
 * this is a notice, and anything longer belongs in a message the gym sends by
 * other means. Both fields go through the shared sanitizers first.
 */
export const AnnounceSchema = z.object({
  title: lineText(1, 80),
  body: blockText(1, 1000),
  audience: z.enum(["all", "students", "staff"]),
});
export type AnnounceInput = z.infer<typeof AnnounceSchema>;

/**
 * Which branches an organization-level post reaches. Leaving `entityIds` out
 * means every branch, so the default is the one an owner means most often.
 */
export const BranchSelectionSchema = z.object({
  entityIds: z.array(IdSchema).max(50).optional(),
});
export type BranchSelectionInput = z.infer<typeof BranchSelectionSchema>;

export const AnnounceAllSchema = AnnounceSchema.extend(
  BranchSelectionSchema.shape,
);
export type AnnounceAllInput = z.infer<typeof AnnounceAllSchema>;
