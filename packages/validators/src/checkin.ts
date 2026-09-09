import { z } from "zod/v4";

import { OWNER_SETTABLE_STAGES } from "@matops/domain";

import { EmailSchema, IdSchema, personFields } from "./fields";

// ─── QR check-in (Phase 3, slice 3.4) ────────────────────────────────────────

/** Check in to a class (book-if-needed + mark present), spec S8. */
export const CheckInSchema = z.object({ classId: z.uuid() });

// ─── Public drop-in / lead (Phase 3, slice 3.5) ──────────────────────────────

/** Address one academy publicly (drop-in page header). */
export const AcademyPublicSchema = z.object({ academyId: IdSchema });

/**
 * Public drop-in form (spec O4/§4, docs/issues/25). First-time, no-app visitor.
 * `consent` MUST be true (GDPR — "OK for the gym to contact me"); `z.literal(true)`
 * rejects an unchecked box.
 *
 * `classId` is what the visitor picked, and it is a hint only: the server
 * re-resolves the class list at submit time and refuses an id that is not on it,
 * so a chosen class can never be one the page was not entitled to offer.
 */
export const DropInSchema = z.object({
  academyId: IdSchema,
  ...personFields,
  email: EmailSchema,
  consent: z.literal(true, "Please tick the consent box to continue"),
  classId: z.uuid().optional(),
});

// ─── Lead pipeline (ADR 115) ─────────────────────────────────────────────────

/** Address one lead in the owner's list. */
export const LeadIdSchema = z.object({ id: z.uuid() });

/**
 * Move a lead to a stage the owner decides. `invited` and `joined` are absent:
 * they follow from sending the link and from a real member, so they have their
 * own mutations and cannot be typed in.
 */
export const SetLeadStageSchema = LeadIdSchema.extend({
  stage: z.enum(OWNER_SETTABLE_STAGES),
});

/**
 * Set the email a lead can be promoted on (ADR 118). Its own mutation, not part
 * of a general lead edit: the address is the account identity, so it is the one
 * field an owner changes on purpose.
 */
export const SetLeadEmailSchema = LeadIdSchema.extend({ email: EmailSchema });

/**
 * Turn a lead into a member (ADR 118). The email rides along and must match the
 * one stored on the lead, so the address the owner confirmed on screen is the
 * address the account is made with.
 */
export const PromoteLeadSchema = LeadIdSchema.extend({ email: EmailSchema });
