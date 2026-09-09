/**
 * Pure lead rules (spec O4, ADR 115). A lead is a person the gym is working on:
 * never a member, never in member statistics, until an owner moves them.
 *
 * Two axes, kept apart on purpose. STAGE is where the owner is with this person
 * and is stored. ACTIVITY is what the person did and is always derived. A single
 * status field would hide the most valuable row on the screen: someone who
 * trained twice and was never followed up.
 */

export type LeadStage = "new" | "contacted" | "invited" | "joined" | "ghosted";

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  new: "New",
  contacted: "Contacted",
  invited: "Invited",
  joined: "Joined",
  ghosted: "Ghosted",
};

/**
 * Stages an owner may set by hand. `invited` follows from sending the join
 * link and `joined` from a real member, so neither is a free-text flag.
 */
export const OWNER_SETTABLE_STAGES = ["new", "contacted", "ghosted"] as const;
export type OwnerSettableStage = (typeof OWNER_SETTABLE_STAGES)[number];

export const LEAD_SOURCES = ["link", "web", "wall_qr", "staff", "api"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  link: "Shared link",
  web: "Gym website",
  wall_qr: "Wall QR",
  staff: "Front desk",
  api: "API",
};

/**
 * The key a self-join is matched against. Leads store digits only while
 * `user.phone` keeps whatever the person typed, and the same person writes
 * "+351 912 345 678" on one form and "912 345 678" on the other. The last nine
 * digits survive that; the exact number stays the dedupe key.
 */
const PHONE_MATCH_DIGITS = 9;

export function phoneMatchKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-PHONE_MATCH_DIGITS);
}

/**
 * The one lead in this academy whose phone is the same person's, or null. An
 * ambiguous match (two leads ending in the same nine digits) returns null
 * rather than guessing: a wrong link is worse than no link.
 */
export function matchLeadByPhone<T extends { phone: string }>(
  leads: T[],
  phone: string,
): T | null {
  const key = phoneMatchKey(phone);
  if (key.length < PHONE_MATCH_DIGITS) return null;
  const hits = leads.filter((l) => phoneMatchKey(l.phone) === key);
  return hits.length === 1 ? (hits[0] ?? null) : null;
}

interface LeadActivity {
  /** Classes this person actually turned up to. */
  visits: number;
  lastVisitAt: Date | null;
  /** The next class they hold a live booking on, if any. */
  nextBookingAt: Date | null;
}

export interface LeadRow {
  stage: LeadStage;
  activity: LeadActivity;
}

/** Nobody has replied to this person yet. */
function isNewLead(lead: { stage: LeadStage }): boolean {
  return lead.stage === "new";
}

/**
 * They turned up and they are still not a member. The money row: the owner has
 * met them in person and the follow-up is the only thing missing. A ghosted
 * lead is out by the owner's own decision.
 */
export function needsFollowUp(lead: LeadRow): boolean {
  if (lead.stage === "joined" || lead.stage === "ghosted") return false;
  return lead.activity.visits > 0;
}

interface LeadQueues {
  newLeads: number;
  trainedNotJoined: number;
}

/**
 * The two dashboard queue items (spec O1). Both can reach zero, which is why
 * the old 7-day window on the leads count can go: a stage IS the handled flag
 * the queue was missing.
 */
export function leadQueues(leads: LeadRow[]): LeadQueues {
  return {
    newLeads: leads.filter(isNewLead).length,
    trainedNotJoined: leads.filter(needsFollowUp).length,
  };
}

interface LeadFunnel {
  created: number;
  booked: number;
  trained: number;
  joined: number;
}

/** The four numbers on top of the leads tab: the funnel that proves the channel. */
export function leadFunnel(leads: LeadRow[]): LeadFunnel {
  return {
    created: leads.length,
    booked: leads.filter((l) => l.activity.nextBookingAt !== null).length,
    trained: leads.filter((l) => l.activity.visits > 0).length,
    joined: leads.filter((l) => l.stage === "joined").length,
  };
}

type PromoteRefusal = "already-joined" | "no-email" | "no-consent";

interface PromotableLead {
  stage: LeadStage;
  email: string | null;
  consent: boolean;
}

export const PROMOTE_REFUSAL_REASON: Record<PromoteRefusal, string> = {
  "already-joined": "This lead is already a member.",
  "no-email": "Add an email for this lead first.",
  "no-consent": "This person did not agree to be contacted.",
};

/**
 * Whether an owner may turn this lead into a member (ADR 118). Promotion makes
 * an account for someone who has not proved they own the address, so the two
 * gates are the two things the owner cannot supply on their behalf: an email to
 * make the account with, and the agreement to be contacted that a person gave
 * on a form. A front-desk visitor is `consent: false` by construction and is
 * refused here, not silently promoted.
 */
export function canPromoteLead(
  lead: PromotableLead,
): { ok: true } | { ok: false; reason: PromoteRefusal } {
  if (lead.stage === "joined") return { ok: false, reason: "already-joined" };
  if (!lead.consent) return { ok: false, reason: "no-consent" };
  if (!lead.email) return { ok: false, reason: "no-email" };
  return { ok: true };
}
