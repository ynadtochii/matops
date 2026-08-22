import { z } from "zod/v4";

/**
 * Zod schemas shared by the tRPC API and the clients (Phase 1: identity &
 * tenancy). Kept framework-free so both `apps/*` and `packages/api` import the
 * same validation. Pure business rules live in `@matops/domain`; these only shape
 * and bound the input at the boundary.
 */

// ─── Shared field primitives (sanitize, then bound) ──────────────────────────

/**
 * Characters a person never types into a form but an attacker does: C0/C1
 * controls, zero-width joiners/spaces, and the bidi overrides that let a value
 * render in a different order than it is stored. Tab and newline are left in —
 * the cleaners below fold them.
 */
const INVISIBLE =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/** One-line field: drop invisibles, fold every whitespace run to one space. */
function singleLine(raw: string): string {
  return raw.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

/** Multi-line field: keep paragraphs, drop invisibles, cap the blank runs. */
function multiLine(raw: string): string {
  return raw
    .replace(INVISIBLE, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * A sanitized single-line string. The pre-transform `.max()` is a cheap guard so
 * a megabyte of junk is rejected before any regex touches it; the post-transform
 * bounds are the real limits, measured on the cleaned value.
 */
const lineText = (min: number, max: number) =>
  z
    .string()
    .max(max * 4)
    .transform(singleLine)
    .pipe(z.string().min(min).max(max));

/** A sanitized multi-line string (notes, bank details). */
const blockText = (min: number, max: number) =>
  z
    .string()
    .max(max * 2)
    .transform(multiLine)
    .pipe(z.string().min(min).max(max));

/** A person's given/family name. */
export const NameSchema = lineText(1, 60);

/**
 * A phone number. Deliberately loose on format (international numbers vary) but
 * strict on charset, so a name, a URL, or a script tag can never land in the
 * field the gym dials. At least 5 digits after the punctuation is stripped.
 */
export const PhoneSchema = z
  .string()
  .max(120)
  .transform(singleLine)
  .pipe(
    z
      .string()
      .max(30)
      .regex(/^[+\d][\d\s().-]*$/, "Use digits and + ( ) - . only")
      .refine(
        (v) => (v.match(/\d/g) ?? []).length >= 5,
        "Enter a full phone number",
      ),
  );

/** An email address, lower-cased so one person is one identity. */
export const EmailSchema = z
  .string()
  .max(320)
  .transform((v) => singleLine(v).toLowerCase())
  .pipe(z.email().max(160));

/**
 * A link we may later render as an `href`. `z.url()` alone accepts `javascript:`
 * and `data:`, so the scheme is pinned to http/https.
 */
export const HttpUrlSchema = z
  .string()
  .max(500)
  .pipe(z.url())
  .refine(
    (v) => /^https?:\/\//i.test(v),
    "Link must start with http:// or https://",
  );

/**
 * Hosts we let an owner point students at from the academy address. The link is
 * rendered as a tappable `href` for every member, so an open URL field would let
 * one careless owner send the whole gym to a phishing page. Bare `google.com`
 * and `goo.gl` are absent on purpose: `/url?q=` redirects anywhere, a `goo.gl`
 * shortlink resolves to anything, and `sites.google.com` hosts user pages.
 */
const MAP_HOSTS = [
  "maps.google.com",
  "maps.app.goo.gl",
  "maps.apple.com",
  "openstreetmap.org",
  "osm.org",
  "waze.com",
];

/** A share link from a map app (spec O6) — https, and from a map host. */
export const MapUrlSchema = HttpUrlSchema.refine((v) => {
  // Parse rather than pattern-match the host: a browser reads the backslash in
  // https://evil.example.com\.google.com/ as a path separator, so any regex
  // that lets `\` into the host group reads the wrong host.
  let url;
  try {
    url = new URL(v);
  } catch {
    return false;
  }
  const host = url.hostname.replace(/^www\./, "").replace(/\.$/, "");
  if (MAP_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return true;
  return host === "google.com" && url.pathname.startsWith("/maps");
}, "Paste a link from Google Maps, Apple Maps, OpenStreetMap, or Waze");

/** An opaque Better Auth id (user, member, organization, invite). Bounded only. */
export const IdSchema = z.string().trim().min(1).max(64);

/** A single-use secret from a link (invite token, push token). */
export const OpaqueTokenSchema = z.string().trim().min(1).max(200);

/** Owner onboarding — "Start a gym" (spec 1.1 / O6). */
export const CreateAcademySchema = z.object({
  name: lineText(2, 80),
});
export type CreateAcademyInput = z.infer<typeof CreateAcademySchema>;

export const UpdateAcademySettingsSchema = z.object({
  timeZone: lineText(1, 64)
    .refine((v) => /^[A-Za-z0-9+_\-/]+$/.test(v), "Pick a zone from the list")
    .optional(),
  address: blockText(0, 200).optional(),
  mapUrl: z.union([MapUrlSchema, z.literal("")]).optional(),
});
export type UpdateAcademySettingsInput = z.infer<
  typeof UpdateAcademySettingsSchema
>;

export const DeleteAcademySchema = z.object({
  confirm: lineText(1, 120),
});
export type DeleteAcademyInput = z.infer<typeof DeleteAcademySchema>;

/** Roles a shareable invite link may carry — never "owner" (docs/issues/20). */
export const InviteRoleSchema = z.enum(["student", "instructor"]);
export type InviteRole = z.infer<typeof InviteRoleSchema>;

/**
 * Student/instructor self-join via an invite link (spec S1/S2, docs/issues/26).
 * Email is not collected here — it is already required + verified by the
 * magic-link sign-in that precedes joining. Minimal fields only.
 */
export const JoinAcademySchema = z.object({
  token: OpaqueTokenSchema,
  firstName: NameSchema,
  lastName: NameSchema,
  phone: PhoneSchema,
});
export type JoinAcademyInput = z.infer<typeof JoinAcademySchema>;

/**
 * Edit the signed-in user's own profile (spec S7, slice B.3). Name + phone are
 * editable; email stays read-only (it is the login identity + notification
 * channel). Same field shapes as the join schemas.
 */
export const UpdateProfileSchema = z.object({
  firstName: NameSchema,
  lastName: NameSchema,
  phone: PhoneSchema,
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

/** A single member action (approve / reject / remove / suspend / promote). */
export const MemberActionSchema = z.object({
  memberId: IdSchema,
});
export type MemberActionInput = z.infer<typeof MemberActionSchema>;

/** Resolve an invite token on the public join screen. */
export const InviteTokenSchema = z.object({
  token: OpaqueTokenSchema,
});

/** The 6-digit academy code a student types to find a gym on mobile (S2,
 * docs/issues/32). Exactly six digits — matches `isValidAcademyCode` in domain. */
export const AcademyCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .max(20)
    .regex(/^\d{6}$/, "Enter your gym's 6-digit ID"),
});
export type AcademyCodeInput = z.infer<typeof AcademyCodeSchema>;

/**
 * Student self-join by academy code (mobile v1, docs/issues/32). Same minimal
 * profile as the invite-link join; the role is always "student" (set server-side),
 * so there is no role field here. Email is already verified via magic-link.
 */
export const JoinByCodeSchema = AcademyCodeSchema.extend({
  firstName: NameSchema,
  lastName: NameSchema,
  phone: PhoneSchema,
});
export type JoinByCodeInput = z.infer<typeof JoinByCodeSchema>;

// ─── Scheduling (Phase 2) ────────────────────────────────────────────────────

/** Optional grappling tag on a class/template (spec O3, matches the DB enum). */
export const DisciplineSchema = z.enum(["bjj", "nogi", "judo", "mma", "other"]);
export type Discipline = z.infer<typeof DisciplineSchema>;

/** True only for an IANA zone the runtime actually knows (drives class time math). */
function isValidTimeZone(tz: string): boolean {
  try {
    // Throws RangeError for an unknown zone; succeeds (any string) otherwise.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** An IANA zone name the runtime knows. Bounded before the lookup. */
const TimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine(isValidTimeZone, "Unknown time zone");

/**
 * Recurring class template (spec O3, docs/issues/08). Days are 0=Sun…6=Sat; the
 * start time is LOCAL minutes-from-midnight in `timeZone` (the DST-aware UTC
 * conversion happens later in @matops/domain). `instructorId` is optional on
 * write — the router defaults it to the acting staff member.
 */
export const CreateClassTemplateSchema = z.object({
  title: lineText(1, 80),
  discipline: DisciplineSchema.nullish(),
  instructorId: IdSchema.optional(),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Pick at least one day")
    .max(7)
    .refine((d) => new Set(d).size === d.length, "Days must be unique"),
  startsAtMinutes: z.number().int().min(0).max(1439),
  durationMinutes: z.number().int().min(5).max(600),
  timeZone: TimeZoneSchema,
  capacity: z.number().int().min(0).max(1000),
});
export type CreateClassTemplateInput = z.infer<
  typeof CreateClassTemplateSchema
>;

/** Edit a template. Same shape as create; the id names the target. */
export const UpdateClassTemplateSchema = CreateClassTemplateSchema.extend({
  id: z.uuid(),
});
export type UpdateClassTemplateInput = z.infer<
  typeof UpdateClassTemplateSchema
>;

/** Pause/resume generation, or soft-delete (docs/issues/16, spec O3). */
export const TemplateStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["active", "paused"]),
});

/** Address a single template by id (setStatus target reuse / delete). */
export const TemplateIdSchema = z.object({ id: z.uuid() });

/**
 * One-off class (spec O2, docs/issues/08). `template_id` is null. The start is a
 * LOCAL date + minutes in `timeZone`; the router resolves the UTC instant with
 * the same DST-aware rule the recurring engine uses.
 */
export const CreateClassSchema = z.object({
  title: lineText(1, 80),
  discipline: DisciplineSchema.nullish(),
  instructorId: IdSchema.optional(),
  date: z.iso.date(), // "YYYY-MM-DD"
  startsAtMinutes: z.number().int().min(0).max(1439),
  durationMinutes: z.number().int().min(5).max(600),
  timeZone: TimeZoneSchema,
  capacity: z.number().int().min(0).max(1000),
});
export type CreateClassInput = z.infer<typeof CreateClassSchema>;

/**
 * Edit one class (spec §4). Content fields always apply; the three reschedule
 * fields (date + minutes + zone) are optional and move the class — booked
 * students are then notified (Phase 4). Cutting capacity below bookings is
 * allowed (soft cap).
 */
export const UpdateClassSchema = z
  .object({
    id: z.uuid(),
    title: lineText(1, 80),
    discipline: DisciplineSchema.nullish(),
    instructorId: IdSchema,
    durationMinutes: z.number().int().min(5).max(600),
    capacity: z.number().int().min(0).max(1000),
    date: z.iso.date().optional(),
    startsAtMinutes: z.number().int().min(0).max(1439).optional(),
    timeZone: TimeZoneSchema.optional(),
  })
  .refine(
    // Reschedule is all-or-nothing: need date + minutes + zone together.
    (v) =>
      [v.date, v.startsAtMinutes, v.timeZone].filter((x) => x !== undefined)
        .length %
        3 ===
      0,
    "To reschedule, provide date, start time, and time zone together",
  );
export type UpdateClassInput = z.infer<typeof UpdateClassSchema>;

/**
 * Change only who is credited for one class (spec O10, K.2). Narrow on purpose:
 * a cover night must not require the caller to resend the whole class, which
 * would let a stale form silently overwrite the title, capacity or time.
 */
export const SetClassInstructorSchema = z.object({
  id: z.uuid(),
  instructorId: IdSchema,
});
export type SetClassInstructorInput = z.infer<typeof SetClassInstructorSchema>;

/**
 * Which window the O10 coach figures cover (spec O10, K.3). An enum, not a free
 * date range: three fixed choices keep the read bounded and mean the screen and
 * the API can never disagree about where a month starts. The keys map to
 * `COACH_WINDOWS` in @matops/domain.
 */
export const CoachStatsSchema = z.object({
  window: z.enum(["this_month", "last_month", "last_90_days"]),
});
export type CoachStatsInput = z.infer<typeof CoachStatsSchema>;

/** One coach's detail — omit `instructorId` to read your own (K.3). */
export const CoachDetailSchema = CoachStatsSchema.extend({
  instructorId: IdSchema.optional(),
});
export type CoachDetailInput = z.infer<typeof CoachDetailSchema>;

/** Address a single class by id (cancel / get). */
export const ClassIdSchema = z.object({ id: z.uuid() });

// ─── Booking (Phase 3) ───────────────────────────────────────────────────────

/**
 * Book a concrete class (spec S5, docs/issues/13). Booking is never blocked —
 * the router applies the soft-capacity + tier rules from @matops/domain. A
 * pending member may book too (provisional); the tier is decided server-side
 * from the caller's membership, so it is not an input here.
 */
export const BookClassSchema = z.object({ classId: z.uuid() });
export type BookClassInput = z.infer<typeof BookClassSchema>;

/** Cancel the caller's own booking on a class (spec S5). */
export const CancelBookingSchema = z.object({ classId: z.uuid() });
export type CancelBookingInput = z.infer<typeof CancelBookingSchema>;

// ─── Attendance (Phase 3, slice 3.3) ─────────────────────────────────────────

/** Attendance mark a staff member can set on a participant (spec O5). */
export const AttendanceStatusSchema = z.enum(["present", "absent", "unmarked"]);
export type AttendanceStatusInput = z.infer<typeof AttendanceStatusSchema>;

/** Mark one participant present/absent/unmarked on a class (spec O5). */
export const MarkAttendanceSchema = z.object({
  classId: z.uuid(),
  studentId: IdSchema,
  status: AttendanceStatusSchema,
});
export type MarkAttendanceInput = z.infer<typeof MarkAttendanceSchema>;

/** Add a walk-in: mark a member present who never booked (spec O5). */
export const AddWalkInSchema = z.object({
  classId: z.uuid(),
  studentId: IdSchema,
});
export type AddWalkInInput = z.infer<typeof AddWalkInSchema>;

/**
 * Record a visitor who is not a member, from the class roster (spec O5/O4).
 * Staff type this at the mat, so it asks for the least that still identifies a
 * person: a name and the phone the lead is deduped by. Last name is optional
 * and `consent` is absent by design — the visitor is not at the keyboard, so
 * the gym cannot tick a contact-consent box on their behalf.
 */
export const AddVisitorSchema = z.object({
  classId: z.uuid(),
  firstName: NameSchema,
  lastName: lineText(0, 60).default(""),
  phone: PhoneSchema,
});
export type AddVisitorInput = z.infer<typeof AddVisitorSchema>;

// ─── QR check-in (Phase 3, slice 3.4) ────────────────────────────────────────

/** Check in to a class (book-if-needed + mark present), spec S8. */
export const CheckInSchema = z.object({ classId: z.uuid() });
export type CheckInInput = z.infer<typeof CheckInSchema>;

// ─── Public drop-in / lead (Phase 3, slice 3.5) ──────────────────────────────

/** Address one academy publicly (drop-in page header). */
export const AcademyPublicSchema = z.object({ academyId: IdSchema });

/**
 * Public drop-in form (spec O4/§4, docs/issues/25). First-time, no-app visitor.
 * `consent` MUST be true (GDPR — "OK for the gym to contact me"); `z.literal(true)`
 * rejects an unchecked box. `classId` is resolved server-side, not submitted.
 */
export const DropInSchema = z.object({
  academyId: IdSchema,
  firstName: NameSchema,
  lastName: NameSchema,
  phone: PhoneSchema,
  email: EmailSchema.optional(),
  consent: z.literal(true, "Please tick the consent box to continue"),
});
export type DropInInput = z.infer<typeof DropInSchema>;

// ─── Push notifications (Phase 4, slice 4.1) ─────────────────────────────────

/**
 * Register a device's Expo push token (docs/issues/17). Token is user-global —
 * the router keys it by the authenticated user, not an academy. Expo tokens look
 * like `ExponentPushToken[xxxxxxxx]`.
 */
export const RegisterPushTokenSchema = z.object({
  token: OpaqueTokenSchema,
  platform: z.enum(["ios", "android"]),
  deviceId: lineText(0, 200).optional(),
});
export type RegisterPushTokenInput = z.infer<typeof RegisterPushTokenSchema>;

/** Remove a device's push token (on sign-out). */
export const UnregisterPushTokenSchema = z.object({
  token: OpaqueTokenSchema,
});
export type UnregisterPushTokenInput = z.infer<
  typeof UnregisterPushTokenSchema
>;

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

/** Owner confirms or rejects one "I paid" claim by id (spec O7). */
export const ClaimIdSchema = z.object({ claimId: z.uuid() });
export type ClaimIdInput = z.infer<typeof ClaimIdSchema>;

// ─── Member rank + staff notes (v1.4, docs/issues/41) ────────────────────────

/**
 * Staff set/change a member's rank in one discipline (spec O4). `discipline`,
 * `belt`, and `stripes` are validated against the seeded rank system
 * (`isValidRank` in @matops/domain) in the router — kept as loose strings here so
 * the model stays general (a new belted art needs no validator change).
 */
export const SetMemberRankSchema = z.object({
  memberId: IdSchema,
  discipline: lineText(1, 40),
  belt: lineText(1, 40),
  stripes: z.number().int().min(0).max(20),
});
export type SetMemberRankInput = z.infer<typeof SetMemberRankSchema>;

/** Clear a member's rank in one discipline (spec O4 — a correction). */
export const ClearMemberRankSchema = z.object({
  memberId: IdSchema,
  discipline: lineText(1, 40),
});
export type ClearMemberRankInput = z.infer<typeof ClearMemberRankSchema>;

/** Staff add a private note about a member (spec O4). Never member-visible. */
export const AddMemberNoteSchema = z.object({
  memberId: IdSchema,
  body: blockText(1, 2000),
});
export type AddMemberNoteInput = z.infer<typeof AddMemberNoteSchema>;

/** Address a single staff note by id (delete). */
export const NoteIdSchema = z.object({ noteId: z.uuid() });
export type NoteIdInput = z.infer<typeof NoteIdSchema>;

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
