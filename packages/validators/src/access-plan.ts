import { z } from "zod/v4";

import { isValidTimeZone } from "@matops/domain";

import {
  blockText,
  CurrencySchema,
  IdSchema,
  lineText,
  PriceMinorSchema,
} from "./fields";

/** How many branches one plan may name. A gym with more is not a v1 shape. */
const MAX_PLAN_ENTITIES = 50;

const EntityIdsSchema = z
  .array(IdSchema)
  .max(MAX_PLAN_ENTITIES)
  .refine((ids) => new Set(ids).size === ids.length, "Branches must be unique");

export const CreateAccessPlanSchema = z
  .object({
    name: lineText(1, 80),
    description: blockText(0, 500).nullish(),
    entityIds: EntityIdsSchema.default([]),
    /**
     * What the plan costs a month. Optional, because a plan made during setup
     * before its price is settled is a real state; the two move together, since
     * an amount without a currency means nothing (ADR 128).
     */
    priceMinor: PriceMinorSchema.optional(),
    currency: CurrencySchema.optional(),
  })
  .refine(
    (v) => (v.priceMinor === undefined) === (v.currency === undefined),
    "Give a price and its currency together, or neither",
  );
export type CreateAccessPlanInput = z.infer<typeof CreateAccessPlanSchema>;

export const RenameAccessPlanSchema = z.object({
  id: z.uuid(),
  name: lineText(1, 80),
  description: blockText(0, 500).nullish(),
});
export type RenameAccessPlanInput = z.infer<typeof RenameAccessPlanSchema>;

/**
 * The exact branches the plan covers after this call. Not a patch.
 *
 * `version` is what the preview said the coverage was (ADR 129). Send it back
 * with the save and a list computed against a coverage somebody else has since
 * moved is refused rather than applied. Leave it out and the save is
 * unconditional, which is what the tests and the first save do.
 */
export const SetAccessPlanCoverageSchema = z.object({
  id: z.uuid(),
  entityIds: EntityIdsSchema,
  version: z.iso.datetime().nullish(),
});
export type SetAccessPlanCoverageInput = z.infer<
  typeof SetAccessPlanCoverageSchema
>;

export const ArchiveAccessPlanSchema = z.object({
  id: z.uuid(),
  archived: z.boolean(),
});
export type ArchiveAccessPlanInput = z.infer<typeof ArchiveAccessPlanSchema>;

export const AccessPlanIdSchema = z.object({ id: z.uuid() });

/**
 * Give a person a membership. `startMonth` is the first day of a calendar
 * month; leave it out and the server uses the month it is in.
 */
const AssignmentFieldsSchema = z.object({
  planId: z.uuid(),
  assigningEntityId: IdSchema.nullish(),
  startMonth: z.iso.date().nullish(),
});

export const AssignMembershipSchema = z
  .union([
    AssignmentFieldsSchema.extend({ personId: IdSchema }),
    AssignmentFieldsSchema.extend({ userId: IdSchema }),
  ])
  .transform((input) => ({
    ...input,
    userId: "personId" in input ? input.personId : input.userId,
  }));
export type AssignMembershipInput = z.infer<typeof AssignMembershipSchema>;

/** How many people one bulk run may touch. Past this it is an import, not a click. */
const MAX_BULK_ASSIGN = 500;

/** Give the same plan to several people at once (ADR 128). */
export const BulkAssignMembershipSchema = z
  .union([
    z.object({
      personIds: z.array(IdSchema).min(1).max(MAX_BULK_ASSIGN),
      planId: z.uuid(),
      startMonth: z.iso.date().nullish(),
    }),
    z.object({
      userIds: z.array(IdSchema).min(1).max(MAX_BULK_ASSIGN),
      planId: z.uuid(),
      startMonth: z.iso.date().nullish(),
    }),
  ])
  .transform((input) => ({
    ...input,
    userIds: "personIds" in input ? input.personIds : input.userIds,
  }));
export type BulkAssignMembershipInput = z.infer<
  typeof BulkAssignMembershipSchema
>;

export const AssignmentIdSchema = z.object({ id: z.uuid() });

/**
 * Move one membership onto another plan from the first of next month
 * (ADR 129). The month is NOT an input: the server computes it from the gym's
 * own membership calendar, so a clock on a laptop cannot move a boundary.
 */
export const PlanChangeSchema = z.object({
  assignmentId: z.uuid(),
  targetPlanId: z.uuid(),
});
export type PlanChangeInput = z.infer<typeof PlanChangeSchema>;

export const CancelPlanChangeSchema = z.object({ changeId: z.uuid() });

/**
 * The bookings that need a look after a coverage or plan change (ADR 129).
 * Bounded rather than paged by cursor: the list is work to clear, and a gym
 * with more than a screenful has a bigger problem than pagination.
 */
export const BookingReviewSchema = z
  .union([
    z
      .object({
        personId: IdSchema.nullish(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .strict(),
    z
      .object({
        userId: IdSchema.nullish(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .strict(),
  ])
  .transform((input) => ({
    personId:
      "userId" in input
        ? input.userId
        : "personId" in input
          ? input.personId
          : null,
    limit: input.limit,
  }));
export type BookingReviewInput = z.infer<typeof BookingReviewSchema>;

export const MemberAssignmentsSchema = z
  .union([z.object({ personId: IdSchema }), z.object({ userId: IdSchema })])
  .transform((input) => ({
    userId: "personId" in input ? input.personId : input.userId,
  }));

/** The first day of a calendar month, which is how a month is addressed. */
const MonthSchema = z.iso
  .date()
  .refine((d) => d.endsWith("-01"), "A month is addressed by its first day");

/**
 * Set what a plan costs from a month on (ADR 128, spec FP6).
 *
 * The month is part of the input rather than "now", because a price change is a
 * decision about the future: the procedure refuses a month that is not after
 * the current one, using the same `canPriceFrom` rule the client checks with.
 */
export const SetAccessPlanPriceSchema = z.object({
  id: z.uuid(),
  priceMinor: PriceMinorSchema,
  currency: CurrencySchema,
  effectiveMonth: MonthSchema,
});
export type SetAccessPlanPriceInput = z.infer<typeof SetAccessPlanPriceSchema>;

/** Tick one month of one shared membership paid or unpaid. */
export const MarkMembershipMonthSchema = z.object({
  assignmentId: z.uuid(),
  month: MonthSchema,
  paid: z.boolean(),
});
export type MarkMembershipMonthInput = z.infer<
  typeof MarkMembershipMonthSchema
>;

export const MembershipMonthsSchema = z.object({ assignmentId: z.uuid() });

/**
 * A member says they sent the transfer. No month: the server uses the one they
 * are being judged on, which is the only month they are ever shown (ADR 127).
 */
export const ClaimMembershipMonthSchema = z.object({ assignmentId: z.uuid() });
export type ClaimMembershipMonthInput = z.infer<
  typeof ClaimMembershipMonthSchema
>;

/** Clear a claim without marking the month paid. */
export const RejectMembershipClaimSchema = MarkMembershipMonthSchema.omit({
  paid: true,
});
export type RejectMembershipClaimInput = z.infer<
  typeof RejectMembershipClaimSchema
>;

/**
 * The organization's membership settings. Grace is bounded the same way the
 * column's check constraint bounds it, so the form and the database refuse the
 * same numbers. Every field is written on every save, so one form carries all
 * of them.
 */
export const MembershipPolicySchema = z.object({
  graceDays: z.number().int().min(0).max(28),
  calendarTimeZone: z
    .union([
      lineText(1, 64).refine(isValidTimeZone, "Pick a zone from the list"),
      z.null(),
    ])
    .optional(),
  /**
   * Where members send the money (ADR 127). Required, because saving the policy
   * REPLACES it: a partial save from a second form would blank the account.
   */
  bankDetails: blockText(0, 2000),
});
export type MembershipPolicyInput = z.infer<typeof MembershipPolicySchema>;

/** The window the organization overview reports on. Both ends, or neither. */
export const OrganizationWindowSchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
});
export type OrganizationWindowInput = z.infer<typeof OrganizationWindowSchema>;

export const PurchaseCatalogSchema = z.object({
  start: z.enum(["current", "next"]).default("current"),
});
export const SelectMembershipPurchaseSchema = PurchaseCatalogSchema.extend({
  planId: z.uuid(),
  version: z.string().min(1).max(5000),
});
export const MembershipPurchaseIdSchema = z.object({ id: z.uuid() });
export const RejectMembershipPurchaseSchema = MembershipPurchaseIdSchema.extend(
  { reason: blockText(1, 500) },
);
export const MembershipAvailabilitySchema = z.object({
  planId: z.uuid(),
  available: z.boolean(),
});
