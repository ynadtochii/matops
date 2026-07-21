/**
 * Pure drop-in / lead rules (spec O4/§4; docs/issues/25). No I/O — the public
 * drop-in resolver calls these to gate on consent and to compute the dedupe key.
 * A drop-in is a first-time, no-app visitor captured as a lead + attendance; the
 * write itself (upsert on academy+phone, deduping repeat visits) lives in the
 * resolver / db helper.
 */

/** Normalize a phone to a dedupe key — digits only, so formatting differences
 * ("+1 (555) 123", "5551123") collapse to one lead per person (spec §4). */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export type DropInReason = "no-consent" | "no-phone" | "no-name";

export interface DropInResult {
  ok: boolean;
  reason?: DropInReason;
}

/**
 * Can this drop-in be accepted? Consent is REQUIRED (GDPR, ticket 25) — the
 * visitor must tick "OK for the gym to contact me". A usable phone (the dedupe
 * key) and a name are also required. Field shape is bounded by the validator;
 * this is the business gate the resolver checks before writing.
 */
export function canSubmitDropIn(input: {
  consent: boolean;
  phone: string;
  firstName: string;
  lastName: string;
}): DropInResult {
  if (!input.consent) return { ok: false, reason: "no-consent" };
  if (normalizePhone(input.phone).length < 3) {
    return { ok: false, reason: "no-phone" };
  }
  if (!input.firstName.trim() || !input.lastName.trim()) {
    return { ok: false, reason: "no-name" };
  }
  return { ok: true };
}
