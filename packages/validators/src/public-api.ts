import { z } from "zod/v4";

import { LEAD_SOURCES } from "@matops/domain";

import { EmailSchema, personFields } from "./fields";

/**
 * The public booking write (ADR 115). Same field shapes as every other place
 * matops captures a person, so the API cannot accept a name or phone the rest
 * of the product would reject. `consent` must be true: the calling page shows
 * the consent line with the /privacy link beside it, and that is a contract
 * term for any integrator.
 */
export const PublicBookingSchema = z.object({
  classId: z.uuid(),
  ...personFields,
  email: EmailSchema,
  consent: z.literal(true, "Consent is required to take a booking"),
  source: z.enum(LEAD_SOURCES).default("api"),
});
export type PublicBookingInput = z.infer<typeof PublicBookingSchema>;

export const PublicBookingEnabledSchema = z.object({ enabled: z.boolean() });
