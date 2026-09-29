import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { entity } from "./entity-schema";
import { person } from "./person-schema";
import { academyWaiver } from "./waiver-schema";

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

export const academyDiscipline = pgTable(
  "academy_discipline",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    name: t.text().notNull(),
  }),
  (table) => [
    uniqueIndex("ad_uniq_academy_name_ci").on(
      table.academyId,
      sql`lower(${table.name})`,
    ),
  ],
);

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
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    // Nullable since ADR 126: a general space runs sessions nobody teaches.
    instructorId: t.text(), // → user.id
    title: t.text().notNull(),
    description: t.text(),
    discipline: t.text(),
    daysOfWeek: t.integer().array().notNull(), // 0=Sun … 6=Sat
    startsAtMinutes: t.integer().notNull(), // minutes from LOCAL midnight
    durationMinutes: t.integer().notNull(),
    timeZone: t.text().notNull(), // IANA; default copied from the academy
    capacity: t.integer().notNull(),
    /**
     * `soft` lets the count pass capacity (the BJJ rule, spec §4); `strict`
     * refuses the booking. Existing rows default to soft so no academy's
     * behaviour changes under them (ADR 126).
     */
    capacityPolicy: t.text().notNull().default("soft"),
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
    index("ct_sweep_stale")
      .on(table.status, table.generatedUntil)
      .where(sql`deleted_at IS NULL`),
    check("ct_description_bounded", sql`char_length(description) <= 500`),
    check(
      "ct_capacity_policy_supported",
      sql`capacity_policy in ('soft','strict')`,
    ),
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
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    templateId: t.uuid().references(() => classTemplate.id), // null = one-off
    instructorId: t.text(),
    title: t.text().notNull(), // copied from template; per-instance overridable
    description: t.text(),
    discipline: t.text(),
    startsAt: t.timestamp({ withTimezone: true }).notNull(), // resolved UTC instant
    durationMinutes: t.integer().notNull(),
    capacity: t.integer().notNull(),
    capacityPolicy: t.text().notNull().default("soft"),
    bookingCount: t.integer().notNull().default(0),
    status: classStatus().notNull().default("scheduled"),
    attendanceReviewedAt: t.timestamp({ withTimezone: true }),
    attendanceReviewedBy: t.text(),
    attendanceReviewFingerprint: t.text(),
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
    check("cl_description_bounded", sql`char_length(description) <= 500`),
    check(
      "cl_capacity_policy_supported",
      sql`capacity_policy in ('soft','strict')`,
    ),
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
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    classId: t
      .uuid()
      .notNull()
      .references(() => classInstance.id),
    studentId: t.text(), // → user.id
    personOrganizationId: t.text(),
    personId: t.uuid(),
    bookingStatus: bookingStatus().notNull().default("booked"),
    bookingTier: bookingTier().notNull(),
    bookedAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    cancelledAt: t.timestamp({ withTimezone: true }), // set when booking_status → cancelled
    // Attendance axis (slice 3.3, spec O5) — orthogonal to booking.
    attendanceStatus: attendanceStatus().notNull().default("unmarked"),
    attendedAt: t.timestamp({ withTimezone: true }), // set when marked present / self check-in
    markedBy: t.text(), // → user.id of the staff who marked; null for self/QR check-in
    checkInSource: t.text(),
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
    uniqueIndex("cp_uniq_class_person")
      .on(table.classId, table.personId)
      .where(sql`person_id is not null`),
    // Per-class attendee lookups (owner attendance, slice 3.3).
    index("cp_by_academy_class").on(table.academyId, table.classId),
    // "My bookings" join for the student schedule + detail reads.
    index("cp_by_academy_student").on(table.academyId, table.studentId),
    index("cp_by_academy_person").on(table.academyId, table.personId),
    foreignKey({
      name: "class_participation_person_same_org",
      columns: [table.personOrganizationId, table.personId],
      foreignColumns: [person.organizationId, person.id],
    }),
    check(
      "class_participation_has_subject",
      sql`student_id is not null or person_id is not null`,
    ),
    check(
      "class_participation_person_complete",
      sql`(person_organization_id is null) = (person_id is null)`,
    ),
    check(
      "class_participation_check_in_source_supported",
      sql`check_in_source is null or check_in_source in ('reception_self','staff')`,
    ),
  ],
);

export const attendanceCorrection = pgTable(
  "attendance_correction",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    classId: t
      .uuid()
      .notNull()
      .references(() => classInstance.id),
    kind: t.text().notNull(),
    subjectId: t.text(),
    beforeValue: t.text(),
    afterValue: t.text(),
    reason: t.text().notNull(),
    actorId: t.text().references(() => user.id, { onDelete: "set null" }),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (table) => [
    index("attendance_correction_by_class").on(
      table.academyId,
      table.classId,
      table.createdAt,
    ),
    check(
      "attendance_correction_kind_supported",
      sql`kind in ('member','visitor','review')`,
    ),
    check(
      "attendance_correction_reason_bounded",
      sql`char_length(reason) between 3 and 500`,
    ),
  ],
);

/**
 * Where a lead came from (ADR 115). Without it the gym cannot tell which
 * channel is working, and the channel is the point of the public API.
 */
export const leadSource = pgEnum("lead_source", [
  "link",
  "web",
  "wall_qr",
  "staff",
  "api",
]);

/**
 * Where the OWNER is with this person (ADR 115). Orthogonal to what the person
 * did: someone who trained twice and was never followed up is still `new`, and
 * that row is the one worth showing. `ghosted` deletes nothing.
 */
export const leadStage = pgEnum("lead_stage", [
  "new",
  "contacted",
  "invited",
  "joined",
  "ghosted",
]);

/**
 * Drop-in / lead — a person the gym is working on, captured by the public QR
 * form, the public booking API, the shared booking link or staff at the desk
 * (spec O4/§4; docs/issues/25, 115). NOT a `class_participation` row: a lead has
 * no `user.id`. Deduped by `(academy_id, phone)` — one lead per person; the
 * classes they booked or attended are rows in `drop_in_visit` (ADR 115).
 *
 * Tenant-scoped for OWNER reads (RLS policy in migration 0013); the PUBLIC
 * writes run on the trusted base connection (an enumerated tenant-seam
 * exception, docs/issues/12/25) after validating the academy exists.
 */
export const dropIn = pgTable(
  "drop_in",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    firstName: t.text().notNull(),
    lastName: t.text().notNull(),
    phone: t.text().notNull(),
    email: t.text(), // optional
    consent: t.boolean().notNull(), // "OK for the gym to contact me" (GDPR)
    stage: leadStage().notNull().default("new"),
    source: leadSource().notNull().default("wall_qr"),
    contactedAt: t.timestamp({ withTimezone: true }),
    convertedUserId: t.text(), // → user.id once they joined as a member
    belt: t.text(),
    stripes: t.integer(),
    health: t.text(),
    emailUpdatesAt: t.timestamp({ withTimezone: true }),
    waiverId: t.uuid(),
    waiverAcceptedAt: t.timestamp({ withTimezone: true }),
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
    // Dedupe: one lead per person per academy; repeat visits add a visit row.
    uniqueIndex("di_uniq_academy_phone").on(table.academyId, table.phone),
    check("di_health_len", sql`char_length(${table.health}) <= 1000`),
    check("di_stripes_range", sql`${table.stripes} between 0 and 20`),
    foreignKey({
      name: "drop_in_waiver",
      columns: [table.academyId, table.waiverId],
      foreignColumns: [academyWaiver.academyId, academyWaiver.id],
    }),
  ],
);

/**
 * One row per lead per class (ADR 115). Replaces the single `drop_in.class_id`
 * pointer, which a second visit overwrote, so the first class silently lost the
 * visitor from its register. Carries the same two axes as
 * `class_participation`: a booking axis (`booked` from the public API or the
 * shared link, `none` for a walk-in staff recorded, `cancelled`) and an
 * attendance axis, so a booked visitor who never arrives reads as a no-show
 * instead of as present.
 *
 * Read by exactly three places: the class roster, the leads screen and the
 * public API. No statistics query may join it (roadmap K.0).
 */
export const dropInVisit = pgTable(
  "drop_in_visit",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    dropInId: t
      .uuid()
      .notNull()
      .references(() => dropIn.id),
    classId: t
      .uuid()
      .notNull()
      .references(() => classInstance.id),
    bookingStatus: bookingStatus().notNull().default("none"),
    attendanceStatus: attendanceStatus().notNull().default("unmarked"),
    bookedAt: t.timestamp({ withTimezone: true }),
    cancelledAt: t.timestamp({ withTimezone: true }),
    attendedAt: t.timestamp({ withTimezone: true }),
    markedBy: t.text(), // → user.id of the staff who marked
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    uniqueIndex("dv_uniq_lead_class").on(table.dropInId, table.classId),
    index("dv_by_academy_class").on(table.academyId, table.classId),
    index("dv_by_lead").on(table.dropInId),
  ],
);
