import { z } from "zod/v4";

import { IdSchema } from "./fields";

// ─── Internal referral tracking (O9, ADR 52) ────────────────────────────────

/** Staff make a permanent initial student → referrer attribution. */
export const AssignReferralSchema = z.object({
  studentMemberId: IdSchema,
  referrerMemberId: IdSchema,
});
export type AssignReferralInput = z.infer<typeof AssignReferralSchema>;

/** Owners correct an attribution or clear it while retaining the audit trail. */
export const CorrectReferralSchema = z.object({
  studentMemberId: IdSchema,
  referrerMemberId: IdSchema.nullable(),
});
export type CorrectReferralInput = z.infer<typeof CorrectReferralSchema>;

/** Owner-only audit history for one student membership. */
export const ReferralHistorySchema = z.object({
  studentMemberId: IdSchema,
});
export type ReferralHistoryInput = z.infer<typeof ReferralHistorySchema>;
