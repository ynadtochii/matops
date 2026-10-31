import { z } from "zod/v4";

import {
  isValidTimeZone,
  MAX_PAYMENT_METHODS,
  PAYMENT_METHOD_KINDS,
  paymentMethodNeedsDetails,
} from "@matops/domain";

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

export const ArchiveAccessPlanSchema = z.object({
  id: z.uuid(),
  archived: z.boolean(),
});

export const AccessPlanIdSchema = z.object({ id: z.uuid() });

/**
 * Give a person a membership. `startMonth` is the first day of a calendar
 * month; leave it out and the server uses the month it is in.
 */
const AssignmentFieldsSchema = z.object({
  planId: z.uuid(),
  assigningEntityId: IdSchema.nullish(),
  startMonth: z.iso.date().nullish(),
  startsOn: z.iso.date().nullish(),
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

export const AssignmentIdSchema = z.object({ id: z.uuid() });

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
const PAYMENT_LINK_HOST = "buy.stripe.com";

export function isStripePaymentLink(value: string): boolean {
  if (value.length > 500) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.hostname === PAYMENT_LINK_HOST &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.hash === "" &&
    url.pathname.length > 1
  );
}

export const PaymentLinkUrlSchema = z
  .string()
  .trim()
  .refine(
    isStripePaymentLink,
    "Paste a Stripe payment link (https://buy.stripe.com/…)",
  );

export const SetAccessPlanPriceSchema = z.object({
  id: z.uuid(),
  priceMinor: PriceMinorSchema,
  currency: CurrencySchema,
  effectiveMonth: MonthSchema,
  paymentLinkUrl: PaymentLinkUrlSchema.nullish(),
});

export const SaveStripeHookSecretSchema = z.object({
  secret: z
    .string()
    .trim()
    .regex(
      /^whsec_[A-Za-z0-9+/=_-]{16,200}$/,
      "Paste the signing secret that starts with whsec_",
    ),
});

export const CardPaymentIdSchema = z.object({ id: z.uuid() });

export const SetPlanPaymentLinkSchema = z.object({
  planId: z.uuid(),
  paymentLinkUrl: PaymentLinkUrlSchema.nullable(),
});

/** Tick one month of one shared membership paid or unpaid. */
export const MarkMembershipMonthSchema = z.object({
  assignmentId: z.uuid(),
  month: MonthSchema,
  paid: z.boolean(),
  expectedVersion: z.number().int().positive().optional(),
  reason: blockText(1, 500).optional(),
  resolveHoldReason: blockText(1, 500).optional(),
});

/**
 * A member says they sent the transfer. No month: the server uses the one they
 * are being judged on, which is the only month they are ever shown (ADR 127).
 */
export const ClaimMembershipMonthSchema = z.object({
  assignmentId: z.uuid(),
  expectedVersion: z.number().int().positive().optional(),
  priceMinor: PriceMinorSchema.optional(),
  currency: CurrencySchema.optional(),
  methodId: z.uuid().optional(),
  cashPaidTo: IdSchema.optional(),
  cashPaidToName: lineText(1, 80).optional(),
  cashPaidOn: z.iso.date().optional(),
  note: blockText(0, 500).optional(),
  proofFileId: z.uuid().optional(),
});

/** Clear a claim without marking the month paid. */
export const RejectMembershipClaimSchema = MarkMembershipMonthSchema.omit({
  paid: true,
  resolveHoldReason: true,
}).extend({ reason: blockText(1, 500).default("Payment report rejected") });

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
});

export const SavePaymentMethodSchema = z
  .object({
    id: z.uuid().optional(),
    kind: z.enum(PAYMENT_METHOD_KINDS),
    label: lineText(1, 60),
    details: blockText(0, 1000),
    enabled: z.boolean(),
  })
  .refine((m) => !paymentMethodNeedsDetails(m.kind) || m.details.length > 0, {
    message: "Add the details students need to pay",
    path: ["details"],
  });

export const PaymentMethodIdSchema = z.object({ id: z.uuid() });

export const ReorderPaymentMethodsSchema = z.object({
  ids: z
    .array(z.uuid())
    .min(1)
    .max(MAX_PAYMENT_METHODS)
    .refine((ids) => new Set(ids).size === ids.length, "Each method once"),
});

export const SetPlanStaffOnlySchema = z.object({
  planId: z.uuid(),
  staffOnly: z.boolean(),
});

export const SetPlanMethodSchema = z.object({
  planId: z.uuid(),
  methodId: z.uuid(),
  on: z.boolean(),
});

export const ChoosePlanSchema = z.object({ planId: z.uuid() });

export const MembershipMonthRefSchema = z.object({
  assignmentId: z.uuid(),
  month: MonthSchema,
});
