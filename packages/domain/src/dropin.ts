/**
 * Pure drop-in / lead rules (spec O4/§4; docs/issues/25). No I/O — the public
 * drop-in resolver calls these to gate on consent and to compute the dedupe key.
 * A drop-in is a first-time, no-app visitor captured as a lead + attendance; the
 * write itself (upsert on academy+phone, deduping repeat visits) lives in the
 * resolver / db helper.
 */

/** Normalize a phone to a dedupe key: strip formatting so "+1 (555) 123" and
 * "+15551123" collapse to one lead per person (spec §4). The leading `+` is
 * kept, because this is also the number the owner reads and dials back, and
 * without it a country code is indistinguishable from an area code. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return phone.trimStart().startsWith("+") ? `+${digits}` : digits;
}

export type DropInReason = "no-consent" | "no-phone" | "no-name" | "no-email";

export interface DropInResult {
  ok: boolean;
  reason?: DropInReason;
}

/**
 * Can this drop-in be accepted? Consent is REQUIRED (GDPR, ticket 25): the
 * visitor must tick "OK for the gym to contact me". A usable phone (the dedupe
 * key), a name, and an email are also required. The email is what an owner can
 * later turn into a member account (ADR 118), and a lead without one can only
 * be reached through a channel matops never sees. Field shape is bounded by the
 * validator; this is the business gate the resolver checks before writing.
 */
export function canSubmitDropIn(input: {
  consent: boolean;
  phone: string;
  firstName: string;
  lastName: string;
  email: string;
}): DropInResult {
  if (!input.consent) return { ok: false, reason: "no-consent" };
  if (input.phone.replace(/\D/g, "").length < 3) {
    return { ok: false, reason: "no-phone" };
  }
  if (!input.firstName.trim() || !input.lastName.trim()) {
    return { ok: false, reason: "no-name" };
  }
  if (!input.email.trim()) return { ok: false, reason: "no-email" };
  return { ok: true };
}
