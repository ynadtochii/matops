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
