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

/** A single member action (approve / reject / remove / suspend / promote). */
export const MemberActionSchema = z.object({
  memberId: z.string().min(1),
});
export type MemberActionInput = z.infer<typeof MemberActionSchema>;

/** Resolve an invite token on the public join screen. */
export const InviteTokenSchema = z.object({
  token: z.string().min(1),
});

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
