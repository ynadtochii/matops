/**
 * matops (rebuild of MAT) — MVP domain schema (Drizzle) — DRAFT asset for ticket 08.
 *
 * IDENTITY SPLIT: academies, memberships, roles, invites, and user identity are
 * NOT defined here — they come from Better Auth (ticket 02) + its Organization
 * plugin, living in the SAME Postgres via the Drizzle adapter:
 *   - user / session / account           → Better Auth core
 *   - organization                       → an ACADEMY (academyId === organization.id)
 *   - member (role + status additionalField) → membership-in-academy
 *   - invitation                         → invite-link join
 * This file owns only the SCHEDULING domain. FKs to Better Auth rows are by text id
 * (organization.id / user.id). Kept as `text` (not a hard cross-schema FK) so the
 * two schemas stay loosely coupled; integrity is enforced by the tenant seam + app.
 *
 * packages/db/schema/scheduling.ts
 */
import {
  pgTable, pgEnum, uuid, text, integer, boolean,
  timestamp, index, uniqueIndex,
} from 'drizzle-orm/pg-core'

export const discipline = pgEnum('discipline', ['bjj', 'nogi', 'judo', 'mma', 'other'])
export const templateStatus = pgEnum('template_status', ['active', 'paused'])
export const classStatus = pgEnum('class_status', ['scheduled', 'cancelled']) // 'completed' dropped (ticket 19): 'past' is derived from starts_at + duration < now()
export const bookingStatus = pgEnum('booking_status', ['booked', 'cancelled', 'none'])
export const attendanceStatus = pgEnum('attendance_status', ['unmarked', 'present', 'absent'])
// ticket 22: only 'confirmed' bookings (active members) hold a real spot / count capacity.
// 'provisional' = pending member or app drop-in → recorded but does NOT count toward booking_count.
export const bookingTier = pgEnum('booking_tier', ['confirmed', 'provisional'])

/** Recurring weekly class definition. Materialized into `classes` by a scheduled job (D1). */
export const classTemplate = pgTable('class_template', {
  id: uuid('id').primaryKey().defaultRandom(),
  academyId: text('academy_id').notNull(),          // → organization.id
  instructorId: text('instructor_id').notNull(),    // → user.id
  title: text('title').notNull(),                   // class identity: plain name…
  discipline: discipline('discipline'),             // …+ optional grappling tag (nullable)
  daysOfWeek: integer('days_of_week').array().notNull(), // 0=Sun … 6=Sat
  startsAtMinutes: integer('starts_at_minutes').notNull(), // minutes from LOCAL midnight
  durationMinutes: integer('duration_minutes').notNull(),
  timeZone: text('time_zone').notNull(),            // IANA; default copied from academy
  capacity: integer('capacity').notNull(),
  status: templateStatus('status').notNull().default('active'), // business status…
  deletedAt: timestamp('deleted_at', { withTimezone: true }),   // …orthogonal soft-delete
  generatedUntil: timestamp('generated_until', { withTimezone: true }), // materialization cursor
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('ct_by_academy').on(t.academyId),
  index('ct_by_academy_status').on(t.academyId, t.status),
])

/** Concrete class instance. templateId null = one-off class (free expandability win). */
export const classInstance = pgTable('class', {
  id: uuid('id').primaryKey().defaultRandom(),
  academyId: text('academy_id').notNull(),
  templateId: uuid('template_id').references(() => classTemplate.id),
  instructorId: text('instructor_id').notNull(),
  title: text('title').notNull(),                   // copied from template; per-instance overridable
  discipline: discipline('discipline'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(), // concrete UTC instant
  durationMinutes: integer('duration_minutes').notNull(),
  capacity: integer('capacity').notNull(),
  bookingCount: integer('booking_count').notNull().default(0), // denormalized display count; NO hard cap in v1 (session 12) — can exceed capacity (shown red); maintained in-tx
  status: classStatus('status').notNull().default('scheduled'), // business status…
  deletedAt: timestamp('deleted_at', { withTimezone: true }),   // …orthogonal soft-delete
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('cl_by_academy_start').on(t.academyId, t.startsAt),
  index('cl_by_academy_status_start').on(t.academyId, t.status, t.startsAt),
  index('cl_by_template').on(t.templateId),
  // idempotent materialization: a template can produce at most one class per instant.
  // (Postgres treats NULL templateId as distinct → multiple one-offs are fine.)
  uniqueIndex('cl_uniq_template_start').on(t.templateId, t.startsAt),
])

/**
 * Unified booking + attendance (D2 resolved: ONE table, two orthogonal axes).
 * One row per (class, student). Booking axis = student action; attendance axis =
 * instructor action later. Walk-in = bookingStatus 'none' + attendanceStatus 'present'.
 */
export const classParticipation = pgTable('class_participation', {
  id: uuid('id').primaryKey().defaultRandom(),
  academyId: text('academy_id').notNull(),
  classId: uuid('class_id').notNull().references(() => classInstance.id),
  studentId: text('student_id').notNull(),          // → user.id
  bookingStatus: bookingStatus('booking_status').notNull().default('booked'),
  // ticket 22 (revised session 12): DISPLAY-ONLY in v1 (no hard cap). Derivable from the
  // member's status — a pending member's booking is tagged "pending approval". No spot-holding,
  // no conversion. Kept as an optional stored snapshot; the capacity-priority mechanics it was
  // built for return with hard caps/waitlists in the next iteration.
  bookingTier: bookingTier('booking_tier').notNull().default('confirmed'),
  attendanceStatus: attendanceStatus('attendance_status').notNull().default('unmarked'),
  bookedAt: timestamp('booked_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  markedBy: text('marked_by'),                      // instructor user.id (nullable)
  markedAt: timestamp('marked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('cp_by_academy').on(t.academyId),
  index('cp_by_academy_student').on(t.academyId, t.studentId),
  index('cp_by_class').on(t.classId),
  // DOUBLE-BOOK PREVENTION: one participation per student per class. This unique
  // constraint IS the concurrency guard from ticket 04 — capacity stays correct
  // when the booking mutation runs inside a transaction that locks the class row.
  uniqueIndex('cp_uniq_class_student').on(t.classId, t.studentId),
])

/**
 * Drop-in / lead capture (ticket 25). For people WITHOUT an app account who scan the
 * in-venue QR and fill the public form. No user account, no capacity impact — it's a
 * lead + an attendance record the owner keeps for follow-up. (Pending members WITH an
 * account instead get a provisional `class_participation` row.)
 */
export const dropIn = pgTable('drop_in', {
  id: uuid('id').primaryKey().defaultRandom(),
  academyId: text('academy_id').notNull(),
  classId: uuid('class_id').references(() => classInstance.id), // the class they checked into (nullable if ambiguous)
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),                              // optional on the drop-in form
  contactConsent: boolean('contact_consent').notNull().default(false), // ticket 25 / finding E3 (GDPR)
  attendanceStatus: attendanceStatus('attendance_status').notNull().default('present'),
  source: text('source').notNull().default('qr_public_form'),
  markedBy: text('marked_by'),                       // owner/instructor who confirmed (nullable)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('di_by_academy').on(t.academyId),
  index('di_by_academy_created').on(t.academyId, t.createdAt), // lead list, newest first
  index('di_by_class').on(t.classId),
])

// NOTE (ticket 26): `phone` on the *member/student* profile is an additionalField on
// Better Auth's `user` (or `member`) — not defined here; this file owns only the
// scheduling domain. Better Auth also gains the magic-link plugin for passwordless sign-in.
