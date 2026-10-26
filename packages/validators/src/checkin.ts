import { z } from "zod/v4";

import { OWNER_SETTABLE_STAGES } from "@matops/domain";

import {
  EmailSchema,
  OpaqueTokenSchema,
  personFields,
  PhoneSchema,
  signupAnswerFields,
} from "./fields";

// ─── QR check-in (Phase 3, slice 3.4) ────────────────────────────────────────

/** Check in to a class (book-if-needed + mark present), spec S8. */
export const CheckInSchema = z.object({ classId: z.uuid() });

const contactFields = {
  token: OpaqueTokenSchema,
  email: EmailSchema,
  phone: PhoneSchema,
};

const sharedBy = z.string().min(1).max(64).optional().catch(undefined);

export const DropInLookupSchema = z.object(contactFields);

export const DropInClassesSchema = z.object({
  token: OpaqueTokenSchema,
  classId: z.uuid().optional(),
});

export const DropInSubmitSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("returning"),
    ...contactFields,
    classId: z.uuid(),
    sharedBy,
    waiverId: z.uuid().optional(),
  }),
  z.object({
    kind: z.literal("new"),
    ...contactFields,
    firstName: personFields.firstName,
    lastName: personFields.lastName,
    consent: z.literal(true, "Please tick the consent box to continue"),
    classId: z.uuid(),
    sharedBy,
    ...signupAnswerFields,
  }),
]);

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

export const DeskRosterSchema = z.object({ classId: z.uuid() });

export const DeskSearchSchema = z.object({
  classId: z.uuid(),
  query: z.string().trim().max(60),
});

export const DeskCheckInSchema = z.object({
  classId: z.uuid(),
  memberId: z.string().min(1).max(100),
});

export const DeskUndoSchema = z.object({
  participationId: z.uuid(),
  booked: z.boolean(),
});
