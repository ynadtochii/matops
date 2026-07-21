import { index, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Scheduling domain schema (Phase 2). Owns ONLY the scheduling tables; identity
 * (academy / member / user) comes from Better Auth (docs/issues/08). FKs to those
 * rows are plain `text` ids (organization.id / user.id), deliberately NOT hard
 * cross-schema FKs, so auth and domain stay loosely coupled — integrity is the
 * tenant seam + app. Every table here is tenant-scoped: it carries `academy_id`
 * and gets `ENABLE ROW LEVEL SECURITY` + the standard policy in a hand-written
 * migration (see migrations/0006, copying the tenant_probe pattern in 0001).
 *
 * Slice 2.1 defines `class_template`; slice 2.2 adds `class` (+ class_status).
 */

/** Optional grappling tag on a class/template (docs/spec O3, S4 filter chips). */
export const discipline = pgEnum("discipline", [
  "bjj",
  "nogi",
  "judo",
  "mma",
  "other",
]);

/** Template lifecycle: `active` generates future classes; `paused` stops (docs/issues/16). */
export const templateStatus = pgEnum("template_status", ["active", "paused"]);

/**
 * Concrete-class lifecycle. Only two values (docs/issues/19): a class is
 * `cancelled` or not. "Past/done" is DERIVED from `starts_at + duration < now()`,
 * never stored — no `completed`, no sweep job.
 */
export const classStatus = pgEnum("class_status", ["scheduled", "cancelled"]);

/**
 * Booking axis on a participation row (docs/issues/13, 08). `booked`/`cancelled`
 * are the student flow (re-book flips `cancelled → booked`). `none` is a walk-in
 * (slice 3.3): a person who attended without ever booking — booking `none` +
 * attendance `present`. `none` never touches `booking_count`.
 */
export const bookingStatus = pgEnum("booking_status", [
  "booked",
  "cancelled",
  "none",
]);

/**
 * Attendance axis on a participation row (docs/issues/08, spec O5). Orthogonal
 * to booking: a booked student may be `present`/`absent`/`unmarked`. Self
 * check-ins (QR, slice 3.4) arrive `present`; staff mark the rest.
 */
export const attendanceStatus = pgEnum("attendance_status", [
  "unmarked",
  "present",
  "absent",
]);

/**
 * Booking tier (docs/issues/22), set from the booker's membership at book time.
 * `confirmed` = an approved member; holds a real spot and increments
 * `class.booking_count`. `provisional` = a pending member; recorded + shown
 * "pending approval" but NEVER counted (soft, uncounted booking). Only
 * `confirmed` bookings ever move `booking_count`.
 */
export const bookingTier = pgEnum("booking_tier", ["confirmed", "provisional"]);

/**
 * Recurring weekly class definition (spec O3). Materialized into concrete `class`
 * rows lazily on write + by a bounded daily cron (slice 2.2, docs/issues/16).
 *
 * Time is stored as LOCAL wall-clock (`starts_at_minutes` from midnight in
 * `time_zone`); the DST-aware conversion to a UTC instant happens in
 * `@matops/domain` at materialization time, never here.
 */
export const classTemplate = pgTable(
  "class_template",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t.text().notNull(), // → organization.id
    instructorId: t.text().notNull(), // → user.id
    title: t.text().notNull(),
    discipline: discipline(), // nullable optional tag
    daysOfWeek: t.integer().array().notNull(), // 0=Sun … 6=Sat
    startsAtMinutes: t.integer().notNull(), // minutes from LOCAL midnight
    durationMinutes: t.integer().notNull(),
    timeZone: t.text().notNull(), // IANA; default copied from the academy
    capacity: t.integer().notNull(),
    status: templateStatus().notNull().default("active"), // business status…
    deletedAt: t.timestamp({ withTimezone: true }), // …orthogonal soft-delete
    generatedUntil: t.timestamp({ withTimezone: true }), // materialization cursor (slice 2.2)
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    index("ct_by_academy").on(table.academyId),
    // stale-first cursor scan for the materialization cron (slice 2.2).
    index("ct_by_academy_status").on(table.academyId, table.status),
  ],
);

/**
 * Concrete class instance — a single dated occurrence (spec O2, S4). Created by
 * materializing a `class_template` (lazy on write + daily cron, slice 2.2) or
 * one-off with `template_id` null (slice 2.3). `starts_at` is the resolved UTC
 * instant; local time only ever lives on the template. `booking_count` is a
 * denormalized display count maintained in the booking transaction (Phase 3) —
 * it MAY exceed capacity (soft cap, shown red), never blocks (spec §4).
 */
export const classInstance = pgTable(
  "class",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t.text().notNull(),
    templateId: t.uuid().references(() => classTemplate.id), // null = one-off
    instructorId: t.text().notNull(),
    title: t.text().notNull(), // copied from template; per-instance overridable
    discipline: discipline(),
    startsAt: t.timestamp({ withTimezone: true }).notNull(), // resolved UTC instant
    durationMinutes: t.integer().notNull(),
    capacity: t.integer().notNull(),
    bookingCount: t.integer().notNull().default(0),
    status: classStatus().notNull().default("scheduled"),
    // Phase 4 (docs/issues/17): stamped when the reminder cron has pushed this
    // class's reminder, so a re-run never double-sends (idempotency guard).
    reminderSentAt: t.timestamp({ withTimezone: true }),
    deletedAt: t.timestamp({ withTimezone: true }),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    index("cl_by_academy_start").on(table.academyId, table.startsAt),
    index("cl_by_academy_status_start").on(
      table.academyId,
      table.status,
      table.startsAt,
    ),
    index("cl_by_template").on(table.templateId),
    // Idempotent materialization: a template yields at most one class per instant.
    // Postgres treats NULL template_id as distinct, so multiple one-offs are fine.
    uniqueIndex("cl_uniq_template_start").on(table.templateId, table.startsAt),
  ],
);

/**
 * A person's booking on one concrete class (slice 3.1, spec S5, docs/issues/13,
 * 22, 23). One row per (class, student); `booking_status` toggles booked ⇄
 * cancelled via the atomic upsert in the booking resolver. `booking_tier` is set
 * from the booker's membership at book time and decides whether the write moves
 * `class.booking_count` (confirmed only).
 *
 * Tenant-scoped like every domain table: carries `academy_id` and gets the
 * standard RLS policy in a hand-written migration (0011, copying 0008).
 *
 * The "unified participation" row of docs/issues/08: two orthogonal axes —
 * booking (0011) + attendance (0012, slice 3.3). `student_id` is a `user.id`
 * and NOT NULL; app-less drop-ins (slice 3.5) live in `drop_in`, not here.
 */
export const classParticipation = pgTable(
  "class_participation",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t.text().notNull(), // → organization.id (RLS scope)
    classId: t
      .uuid()
      .notNull()
      .references(() => classInstance.id),
    studentId: t.text().notNull(), // → user.id
    bookingStatus: bookingStatus().notNull().default("booked"),
    bookingTier: bookingTier().notNull(),
    bookedAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    cancelledAt: t.timestamp({ withTimezone: true }), // set when booking_status → cancelled
    // Attendance axis (slice 3.3, spec O5) — orthogonal to booking.
    attendanceStatus: attendanceStatus().notNull().default("unmarked"),
    attendedAt: t.timestamp({ withTimezone: true }), // set when marked present / self check-in
    markedBy: t.text(), // → user.id of the staff who marked; null for self/QR check-in
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    // One booking per person per class → stops double-book, enables the re-book
    // upsert (ON CONFLICT flips cancelled → booked).
    uniqueIndex("cp_uniq_class_student").on(table.classId, table.studentId),
    // Per-class attendee lookups (owner attendance, slice 3.3).
    index("cp_by_academy_class").on(table.academyId, table.classId),
    // "My bookings" join for the student schedule + detail reads.
    index("cp_by_academy_student").on(table.academyId, table.studentId),
  ],
);

/**
 * Drop-in / lead — a first-time, no-app visitor captured via the public gym QR
 * form (slice 3.5, spec O4/§4; docs/issues/25). NOT a `class_participation` row:
 * a drop-in has no `user.id`, so it lives here with its own contact fields and
 * implied `present` attendance. Deduped by `(academy_id, phone)` — one lead per
 * person with a `visit_count`, not a row per visit (spec §4).
 *
 * Tenant-scoped for OWNER reads (RLS policy in migration 0013); the PUBLIC submit
 * writes on the trusted base connection (an enumerated tenant-seam exception,
 * docs/issues/12/25) after validating the academy exists. `class_id` is nullable
 * — null = a general visit lead (QR scanned with no class on, spec §4).
 */
export const dropIn = pgTable(
  "drop_in",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t.text().notNull(), // → organization.id (RLS scope)
    firstName: t.text().notNull(),
    lastName: t.text().notNull(),
    phone: t.text().notNull(),
    email: t.text(), // optional
    classId: t.uuid().references(() => classInstance.id), // null = general lead
    consent: t.boolean().notNull(), // "OK for the gym to contact me" (GDPR)
    visitCount: t.integer().notNull().default(1),
    firstVisitAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastVisitAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    // Dedupe: one lead per person per academy; repeat visits bump visit_count.
    uniqueIndex("di_uniq_academy_phone").on(table.academyId, table.phone),
    index("di_by_academy_class").on(table.academyId, table.classId),
  ],
);
