import { z } from "zod/v4";

import { isValidTimeZone } from "@matops/domain";

import { blockText, IdSchema, lineText } from "./fields";

// ─── Scheduling (Phase 2) ────────────────────────────────────────────────────

/** Optional grappling tag on a class/template (spec O3, matches the DB enum). */
export const DisciplineSchema = z.enum(["bjj", "nogi", "judo", "mma", "other"]);
export type Discipline = z.infer<typeof DisciplineSchema>;

/** An IANA zone name the runtime knows. Bounded before the lookup. */
const TimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine(isValidTimeZone, "Unknown time zone");

/**
 * What a session is about, in the owner's own words. Bounded at 500 characters,
 * the same cap the column's check constraint holds. An empty box means the
 * session has no description, so it is stored as nothing rather than as "".
 * Leaving the field out entirely leaves an existing description alone.
 */
const SessionDescription = blockText(0, 500)
  .nullish()
  .transform((v) => (v === "" ? null : v));

/**
 * Recurring class template (spec O3, docs/issues/08). Days are 0=Sun…6=Sat; the
 * start time is LOCAL minutes-from-midnight in `timeZone` (the DST-aware UTC
 * conversion happens later in @matops/domain). `instructorId` is optional on
 * write — at a BJJ academy the router defaults it to the acting staff member,
 * and a general space leaves it unset (ADR 126). `description` is bounded at
 * 500 characters, the same cap the column's check constraint holds.
 */
export const CreateClassTemplateSchema = z.object({
  title: lineText(1, 80),
  description: SessionDescription,
  discipline: DisciplineSchema.nullish(),
  curriculumTrackId: IdSchema.nullish(),
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
  publicBookable: z.boolean().default(false),
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
  description: SessionDescription,
  discipline: DisciplineSchema.nullish(),
  instructorId: IdSchema.optional(),
  date: z.iso.date(), // "YYYY-MM-DD"
  startsAtMinutes: z.number().int().min(0).max(1439),
  durationMinutes: z.number().int().min(5).max(600),
  timeZone: TimeZoneSchema,
  capacity: z.number().int().min(0).max(1000),
  publicBookable: z.boolean().default(false),
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
    description: SessionDescription,
    discipline: DisciplineSchema.nullish(),
    // Nullable, not optional: a general space runs sessions nobody teaches, so
    // the caller says "nobody" out loud rather than by leaving the field out
    // and having the resolver guess (ADR 126).
    instructorId: IdSchema.nullable(),
    durationMinutes: z.number().int().min(5).max(600),
    capacity: z.number().int().min(0).max(1000),
    publicBookable: z.boolean().default(false),
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

/**
 * Week window shared by the staff and student schedule reads. The span is capped
 * so a hand-rolled request cannot ask for a decade of classes in one go.
 */
export const MAX_SCHEDULE_WINDOW_DAYS = 400;

export const WeekWindowSchema = z
  .object({ from: z.iso.datetime(), to: z.iso.datetime() })
  .refine((v) => {
    const span = Date.parse(v.to) - Date.parse(v.from);
    return span > 0 && span <= MAX_SCHEDULE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  }, `Pick a window between 0 and ${MAX_SCHEDULE_WINDOW_DAYS} days`);
export type WeekWindowInput = z.infer<typeof WeekWindowSchema>;
