import { z } from "zod/v4";

import { EmailSchema, IdSchema, personFields } from "./fields";

// ─── QR check-in (Phase 3, slice 3.4) ────────────────────────────────────────

/** Check in to a class (book-if-needed + mark present), spec S8. */
export const CheckInSchema = z.object({ classId: z.uuid() });
export type CheckInInput = z.infer<typeof CheckInSchema>;

// ─── Public drop-in / lead (Phase 3, slice 3.5) ──────────────────────────────

/** Address one academy publicly (drop-in page header). */
export const AcademyPublicSchema = z.object({ academyId: IdSchema });

/**
 * Public drop-in form (spec O4/§4, docs/issues/25). First-time, no-app visitor.
 * `consent` MUST be true (GDPR — "OK for the gym to contact me"); `z.literal(true)`
 * rejects an unchecked box. `classId` is resolved server-side, not submitted.
 */
export const DropInSchema = z.object({
  academyId: IdSchema,
  ...personFields,
  email: EmailSchema.optional(),
  consent: z.literal(true, "Please tick the consent box to continue"),
});
export type DropInInput = z.infer<typeof DropInSchema>;
