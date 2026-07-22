import { z } from "zod/v4";

/**
 * Zod schemas shared by the tRPC API and the clients (Phase 1: identity &
 * tenancy). Kept framework-free so both `apps/*` and `packages/api` import the
 * same validation. Pure business rules live in `@matops/domain`; these only shape
 * and bound the input at the boundary.
 */

/** Owner onboarding — "Start a gym" (spec 1.1 / O6). */
export const CreateAcademySchema = z.object({
  name: z.string().trim().min(2).max(80),
});
export type CreateAcademyInput = z.infer<typeof CreateAcademySchema>;

/** Roles a shareable invite link may carry — never "owner" (docs/issues/20). */
export const InviteRoleSchema = z.enum(["student", "instructor"]);
export type InviteRole = z.infer<typeof InviteRoleSchema>;

/**
 * Student/instructor self-join via an invite link (spec S1/S2, docs/issues/26).
 * Email is not collected here — it is already required + verified by the
 * magic-link sign-in that precedes joining. Minimal fields only.
 */
export const JoinAcademySchema = z.object({
  token: z.string().min(1),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(3).max(30),
});
export type JoinAcademyInput = z.infer<typeof JoinAcademySchema>;

/**
 * Edit the signed-in user's own profile (spec S7, slice B.3). Name + phone are
 * editable; email stays read-only (it is the login identity + notification
 * channel). Same field shapes as the join schemas.
 */
export const UpdateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(3).max(30),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

/** A single member action (approve / reject / remove / suspend / promote). */
export const MemberActionSchema = z.object({
  memberId: z.string().min(1),
});
export type MemberActionInput = z.infer<typeof MemberActionSchema>;

/** Resolve an invite token on the public join screen. */
export const InviteTokenSchema = z.object({
  token: z.string().min(1),
});

/** The 6-digit academy code a student types to find a gym on mobile (S2,
 * docs/issues/32). Exactly six digits — matches `isValidAcademyCode` in domain. */
export const AcademyCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter your gym's 6-digit ID"),
});
export type AcademyCodeInput = z.infer<typeof AcademyCodeSchema>;

/**
 * Student self-join by academy code (mobile v1, docs/issues/32). Same minimal
 * profile as the invite-link join; the role is always "student" (set server-side),
 * so there is no role field here. Email is already verified via magic-link.
 */
export const JoinByCodeSchema = AcademyCodeSchema.extend({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(3).max(30),
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

/**
 * Recurring class template (spec O3, docs/issues/08). Days are 0=Sun…6=Sat; the
 * start time is LOCAL minutes-from-midnight in `timeZone` (the DST-aware UTC
 * conversion happens later in @matops/domain). `instructorId` is optional on
 * write — the router defaults it to the acting staff member.
 */
export const CreateClassTemplateSchema = z.object({
  title: z.string().trim().min(1).max(80),
  discipline: DisciplineSchema.nullish(),
  instructorId: z.string().min(1).optional(),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Pick at least one day")
    .max(7)
    .refine((d) => new Set(d).size === d.length, "Days must be unique"),
  startsAtMinutes: z.number().int().min(0).max(1439),
  durationMinutes: z.number().int().min(5).max(600),
  timeZone: z.string().min(1).refine(isValidTimeZone, "Unknown time zone"),
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
  title: z.string().trim().min(1).max(80),
  discipline: DisciplineSchema.nullish(),
  instructorId: z.string().min(1).optional(),
  date: z.iso.date(), // "YYYY-MM-DD"
  startsAtMinutes: z.number().int().min(0).max(1439),
  durationMinutes: z.number().int().min(5).max(600),
  timeZone: z.string().min(1).refine(isValidTimeZone, "Unknown time zone"),
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
    title: z.string().trim().min(1).max(80),
    discipline: DisciplineSchema.nullish(),
    instructorId: z.string().min(1),
    durationMinutes: z.number().int().min(5).max(600),
    capacity: z.number().int().min(0).max(1000),
    date: z.iso.date().optional(),
    startsAtMinutes: z.number().int().min(0).max(1439).optional(),
    timeZone: z.string().min(1).optional(),
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
  studentId: z.string().min(1),
  status: AttendanceStatusSchema,
});
export type MarkAttendanceInput = z.infer<typeof MarkAttendanceSchema>;

/** Add a walk-in: mark a member present who never booked (spec O5). */
export const AddWalkInSchema = z.object({
  classId: z.uuid(),
  studentId: z.string().min(1),
});
export type AddWalkInInput = z.infer<typeof AddWalkInSchema>;

// ─── QR check-in (Phase 3, slice 3.4) ────────────────────────────────────────

/** Check in to a class (book-if-needed + mark present), spec S8. */
export const CheckInSchema = z.object({ classId: z.uuid() });
export type CheckInInput = z.infer<typeof CheckInSchema>;

// ─── Public drop-in / lead (Phase 3, slice 3.5) ──────────────────────────────

/** Address one academy publicly (drop-in page header). */
export const AcademyPublicSchema = z.object({ academyId: z.string().min(1) });

/**
 * Public drop-in form (spec O4/§4, docs/issues/25). First-time, no-app visitor.
 * `consent` MUST be true (GDPR — "OK for the gym to contact me"); `z.literal(true)`
 * rejects an unchecked box. `classId` is resolved server-side, not submitted.
 */
export const DropInSchema = z.object({
  academyId: z.string().min(1),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(3).max(30),
  email: z.email().max(120).optional(),
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
  token: z.string().trim().min(1).max(200),
  platform: z.enum(["ios", "android"]),
  deviceId: z.string().trim().max(200).optional(),
});
export type RegisterPushTokenInput = z.infer<typeof RegisterPushTokenSchema>;

/** Remove a device's push token (on sign-out). */
export const UnregisterPushTokenSchema = z.object({
  token: z.string().trim().min(1).max(200),
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
  name: z.string().trim().min(1).max(80),
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
  memberId: z.string().min(1),
  planId: z.uuid().nullable(),
  nextDueAt: z.iso.date(), // "YYYY-MM-DD"
});
export type SetMemberDuesInput = z.infer<typeof SetMemberDuesSchema>;

/**
 * Owner's bank details / requisites shown on the student pay card (spec S9/O6).
 * Free text (IBAN, card number, bank name); may be blank to clear it.
 */
export const UpdatePaymentRequisitesSchema = z.object({
  bankDetails: z.string().trim().max(2000),
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
  proofUrl: z.url().max(500).optional(),
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
  memberId: z.string().min(1),
  discipline: z.string().trim().min(1).max(40),
  belt: z.string().trim().min(1).max(40),
  stripes: z.number().int().min(0).max(20),
});
export type SetMemberRankInput = z.infer<typeof SetMemberRankSchema>;

/** Clear a member's rank in one discipline (spec O4 — a correction). */
export const ClearMemberRankSchema = z.object({
  memberId: z.string().min(1),
  discipline: z.string().trim().min(1).max(40),
});
export type ClearMemberRankInput = z.infer<typeof ClearMemberRankSchema>;

/** Staff add a private note about a member (spec O4). Never member-visible. */
export const AddMemberNoteSchema = z.object({
  memberId: z.string().min(1),
  body: z.string().trim().min(1).max(2000),
});
export type AddMemberNoteInput = z.infer<typeof AddMemberNoteSchema>;

/** Address a single staff note by id (delete). */
export const NoteIdSchema = z.object({ noteId: z.uuid() });
export type NoteIdInput = z.infer<typeof NoteIdSchema>;
