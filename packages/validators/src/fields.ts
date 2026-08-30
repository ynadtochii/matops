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

/**
 * The one entry point for a user-supplied string. Every text field below is
 * built on it, so stripping the invisibles is a property of the builder rather
 * than something each field remembers to ask for. The `max` runs first: a cheap
 * guard so a megabyte of junk is rejected before any regex touches it.
 */
const cleanedString = (rawMax: number) =>
  z
    .string()
    .max(rawMax)
    .transform((raw) => raw.replace(INVISIBLE, ""));

/** One-line field: fold every whitespace run to one space. */
function singleLine(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Multi-line field: keep paragraphs, cap the blank runs. */
function multiLine(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A sanitized single-line string. The bounds are measured on the cleaned value. */
export const lineText = (min: number, max: number) =>
  cleanedString(max * 4)
    .transform(singleLine)
    .pipe(z.string().min(min).max(max));

/** A sanitized multi-line string (notes, bank details). */
export const blockText = (min: number, max: number) =>
  cleanedString(max * 2)
    .transform(multiLine)
    .pipe(z.string().min(min).max(max));

/** A person's given/family name. */
export const NameSchema = lineText(1, 60);

/**
 * A phone number. Deliberately loose on format (international numbers vary) but
 * strict on charset, so a name, a URL, or a script tag can never land in the
 * field the gym dials. At least 5 digits after the punctuation is stripped.
 */
export const PhoneSchema = cleanedString(120)
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
export const EmailSchema = cleanedString(320)
  .transform((v) => singleLine(v).toLowerCase())
  .pipe(z.email().max(160));

/**
 * A link we may later render as an `href`. `z.url()` alone accepts `javascript:`
 * and `data:`, so the scheme is pinned to http/https.
 */
export const HttpUrlSchema = cleanedString(500)
  .transform(singleLine)
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

/**
 * Name and phone, the shape every screen that captures a person uses. Spelled
 * once so the join forms, the profile edit, the walk-in and the public drop-in
 * cannot drift apart on how long a name may be or what a phone looks like.
 */
export const personFields = {
  firstName: NameSchema,
  lastName: NameSchema,
  phone: PhoneSchema,
} as const;

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
  curriculumForStudents: z.boolean().optional(),
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
  ...personFields,
});
export type JoinAcademyInput = z.infer<typeof JoinAcademySchema>;

/**
 * Edit the signed-in user's own profile (spec S7, slice B.3). Name + phone are
 * editable; email stays read-only (it is the login identity + notification
 * channel). Same field shapes as the join schemas.
 */
export const UpdateProfileSchema = z.object(personFields);
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
export const JoinByCodeSchema = AcademyCodeSchema.extend(personFields);
export type JoinByCodeInput = z.infer<typeof JoinByCodeSchema>;
