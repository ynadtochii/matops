import { z } from "zod/v4";

import { blockText, HttpUrlSchema, IdSchema, lineText } from "./fields";

// ─── Manual-transfer payments (v1.3, docs/issues/40) ─────────────────────────

/** Billing cadence a plan charges on. v1.3 ships monthly only (ADR 40). */
export const BillingCycleSchema = z.enum(["monthly"]);
export type BillingCycleInput = z.infer<typeof BillingCycleSchema>;

/**
 * A membership plan (price list) the owner defines (spec O7). `priceMinor` is an
 * integer in the currency's MINOR unit (e.g. cents) — never a float. `currency`
 * is a 3-letter ISO-4217 code, upper-cased at the boundary.
 */
export const CreateMembershipPlanSchema = z.object({
  name: lineText(1, 80),
  priceMinor: z.number().int().min(0).max(100_000_000),
  currency: z
    .string()
    .trim()
    .length(3)
    .regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code")
    .transform((c) => c.toUpperCase()),
  cycle: BillingCycleSchema.default("monthly"),
});
export type CreateMembershipPlanInput = z.infer<
  typeof CreateMembershipPlanSchema
>;

/** Edit a plan; the id names the target. */
export const UpdateMembershipPlanSchema = CreateMembershipPlanSchema.extend({
  id: z.uuid(),
});
export type UpdateMembershipPlanInput = z.infer<
  typeof UpdateMembershipPlanSchema
>;

/** Address a single plan by id (delete / read). */
export const PlanIdSchema = z.object({ id: z.uuid() });

/**
 * Owner sets (or clears) a member's dues: put them on a plan with a next-due
 * date (spec O7). `nextDueAt` is a calendar date (`"YYYY-MM-DD"`); `planId` null
 * clears the dues record entirely.
 */
export const SetMemberDuesSchema = z.object({
  memberId: IdSchema,
  planId: z.uuid().nullable(),
  nextDueAt: z.iso.date(), // "YYYY-MM-DD"
});
export type SetMemberDuesInput = z.infer<typeof SetMemberDuesSchema>;

/**
 * Owner's bank details / requisites shown on the student pay card (spec S9/O6).
 * Free text (IBAN, card number, bank name); may be blank to clear it.
 */
export const UpdatePaymentRequisitesSchema = z.object({
  bankDetails: blockText(0, 2000),
});
export type UpdatePaymentRequisitesInput = z.infer<
  typeof UpdatePaymentRequisitesSchema
>;

/**
 * Student raises an "I paid" claim (spec S9). The member, plan, amount, and
 * period are all resolved server-side from the caller's dues — the only optional
 * input is a proof screenshot URL.
 */
export const CreatePaymentClaimSchema = z.object({
  proofUrl: HttpUrlSchema.optional(),
});
export type CreatePaymentClaimInput = z.infer<typeof CreatePaymentClaimSchema>;

export const ChoosePlanSchema = z.object({ planId: z.uuid() });
export type ChoosePlanInput = z.infer<typeof ChoosePlanSchema>;

export const UpdateBookingGateSchema = z.object({
  enforced: z.boolean(),
  graceDays: z.number().int().min(0).max(30),
});
export type UpdateBookingGateInput = z.infer<typeof UpdateBookingGateSchema>;

/** Owner confirms or rejects one "I paid" claim by id (spec O7). */
export const ClaimIdSchema = z.object({ claimId: z.uuid() });
export type ClaimIdInput = z.infer<typeof ClaimIdSchema>;
