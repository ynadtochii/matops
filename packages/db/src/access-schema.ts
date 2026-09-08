import { relations, sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth-schema";
import { entity } from "./entity-schema";
import { person } from "./person-schema";

/**
 * Membership plans and who holds them (ADR 126).
 *
 * These four tables belong to the ORGANIZATION, not to one branch, which is the
 * whole point: one membership can cover a mat and a gym, and it is stored once.
 * So every policy here matches on `app.organization_id`, the way `entity` and
 * `entity_membership` already do, and none of them carries an `academy_id`.
 *
 * Cross-organization references are impossible by construction rather than by
 * care: each child names the organization AND the parent, and the foreign key
 * covers both columns together. Pointing a plan at another organization's
 * entity fails on the key, not on a code review.
 *
 * NO foreign key cascades, for the reason `entity-schema.ts` gives: `erase.ts`
 * deletes in an explicit order and a cascade would hide a table from the proof
 * in `erase-coverage.test.ts`.
 */

/** One membership plan an organization sells: "BJJ Only", "BJJ + Gym". */
export const accessPlan = pgTable(
  "access_plan",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    organizationId: t
      .text()
      .notNull()
      .references(() => organization.id),
    name: t.text().notNull(),
    description: t.text(),
    /**
     * What the plan costs a member each month, in the currency's MINOR unit,
     * beside its ISO-4217 code (ADR 128). Both are nullable and move together:
     * a plan an owner has not priced yet is a real state during setup, and
     * activation readiness is what refuses to let one reach a member.
     */
    priceMinor: t.integer(),
    currency: t.text(),
    /** Archived stops new assignments and freezes the plan; nobody loses access. */
    archivedAt: t.timestamp({ withTimezone: true }),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    // The target of every composite key below: it is what lets a child say
    // "this plan, in this organization" in one reference.
    uniqueIndex("access_plan_org_id").on(table.organizationId, table.id),
    index("access_plan_by_org").on(table.organizationId),
    check(
      "access_plan_price_complete",
      sql`(price_minor is null) = (currency is null)`,
    ),
    check(
      "access_plan_price_sane",
      sql`price_minor is null or (price_minor >= 0 and char_length(currency) = 3)`,
    ),
  ],
);

/**
 * What a plan cost from a given month on (ADR 128, spec FP6).
 *
 * `access_plan.price_minor` is what a plan costs TODAY. This table is what it
 * cost then, so raising a price in March cannot rewrite what February's members
 * were asked for. One row per plan per effective month, and the month a
 * membership belongs to resolves to the latest row at or before it.
 *
 * Rows are append-only in practice: correcting a mistake means writing the
 * month again, not editing history, which is the same shape
 * `membership_month_audit` already uses for the paid flag.
 */
export const accessPlanPrice = pgTable(
  "access_plan_price",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    organizationId: t
      .text()
      .notNull()
      .references(() => organization.id),
    planId: t.uuid().notNull(),
    /** The first of the month this price starts applying. */
    effectiveMonth: t.date().notNull(),
    priceMinor: t.integer().notNull(),
    currency: t.text().notNull(),
    recordedBy: t.text().references(() => user.id, { onDelete: "set null" }),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (table) => [
    foreignKey({
      name: "access_plan_price_plan_same_org",
      columns: [table.organizationId, table.planId],
      foreignColumns: [accessPlan.organizationId, accessPlan.id],
    }),
    uniqueIndex("access_plan_price_one_per_month").on(
      table.planId,
      table.effectiveMonth,
    ),
    index("access_plan_price_by_org").on(table.organizationId),
    check(
      "access_plan_price_is_a_month",
      sql`date_trunc('month', effective_month) = effective_month`,
    ),
    check(
      "access_plan_price_sane",
      sql`price_minor >= 0 and char_length(currency) = 3`,
    ),
  ],
);

/**
 * The entities one plan covers, named one by one.
 *
 * Coverage is a list of ids and never a rule over types, so "BJJ Only" can mean
 * one particular mat, and opening a new branch never joins a plan by itself.
 */
export const accessPlanEntity = pgTable(
  "access_plan_entity",
  (t) => ({
    organizationId: t
      .text()
      .notNull()
      .references(() => organization.id),
    planId: t.uuid().notNull(),
    entityId: t.text().notNull(),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (table) => [
    uniqueIndex("access_plan_entity_pk").on(table.planId, table.entityId),
    index("access_plan_entity_by_entity").on(table.entityId),
    foreignKey({
      name: "access_plan_entity_plan_same_org",
      columns: [table.organizationId, table.planId],
      foreignColumns: [accessPlan.organizationId, accessPlan.id],
    }),
    foreignKey({
      name: "access_plan_entity_entity_same_org",
      columns: [table.organizationId, table.entityId],
      foreignColumns: [entity.organizationId, entity.id],
    }),
  ],
);

/**
 * One person's membership on one plan. Held once for the whole organization,
 * however many branches the plan covers and whichever branch it was created
 * from: `assigningEntityId` records where the owner was standing, and grants
 * nothing.
 *
 * `startMonth` is the first day of the calendar month the membership begins in.
 * Months run first-to-first, so there is no rolling anniversary to track.
 */
export const accessAssignment = pgTable(
  "access_assignment",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    organizationId: t
      .text()
      .notNull()
      .references(() => organization.id),
    personId: t.uuid().notNull(),
    planId: t.uuid().notNull(),
    /** Where the owner assigned it. Never a limit on what the plan covers. */
    assigningEntityId: t.text(),
    startMonth: t.date().notNull(),
    startsOn: t.date().notNull(),
    /**
     * The first month this assignment no longer applies. Exclusive, and null
     * for one that runs on (ADR 129). A plan change writes it on the old row
     * and starts the new one at the same month, so exactly one of the two
     * applies on either side of the boundary.
     */
    endMonth: t.date(),
    status: t.text().notNull().default("active"),
    assignedBy: t.text().references(() => user.id, { onDelete: "set null" }),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    // Two periods of one plan cannot start in the same month. The lifetime
    // rule went with ADR 129: somebody who leaves a plan and comes back later
    // holds two periods, and rewriting the first would erase what they paid.
    // Overlap between live periods is refused by the writer, under a lock.
    uniqueIndex("access_assignment_one_per_plan_person_start")
      .on(table.planId, table.personId, table.startMonth)
      .where(sql`status <> 'cancelled'`),
    uniqueIndex("access_assignment_org_id").on(table.organizationId, table.id),
    index("access_assignment_by_person").on(table.personId),
    index("access_assignment_by_org_status").on(
      table.organizationId,
      table.status,
    ),
    foreignKey({
      name: "access_assignment_plan_same_org",
      columns: [table.organizationId, table.planId],
      foreignColumns: [accessPlan.organizationId, accessPlan.id],
    }),
    foreignKey({
      name: "access_assignment_entity_same_org",
      columns: [table.organizationId, table.assigningEntityId],
      foreignColumns: [entity.organizationId, entity.id],
    }),
    foreignKey({
      name: "access_assignment_person_same_org",
      columns: [table.organizationId, table.personId],
      foreignColumns: [person.organizationId, person.id],
    }),
    check(
      "access_assignment_status_supported",
      sql`status in ('active','suspended','cancelled')`,
    ),
    index("access_assignment_by_person_period").on(
      table.personId,
      table.startMonth,
    ),
    check(
      "access_assignment_start_is_a_month",
      sql`date_trunc('month', start_month) = start_month`,
    ),
    check(
      "access_assignment_starts_on_in_month",
      sql`date_trunc('month', starts_on) = start_month`,
    ),
    check(
      "access_assignment_end_is_a_month",
      sql`end_month is null or date_trunc('month', end_month) = end_month`,
    ),
    check(
      "access_assignment_period_ordered",
      sql`end_month is null or end_month > start_month`,
    ),
  ],
);

/**
 * One decision to change somebody's plan at the month boundary (ADR 129).
 *
 * Pending and applied are read off the calendar against `effectiveMonth` and
 * never stored, so a job that does not run cannot leave a change half made.
 * `previousSourceEndMonth` is what the source carried before this change wrote
 * an end on it, and is the only thing a cancellation restores.
 *
 * The row survives its own cancellation: the record that somebody scheduled a
 * change and then took it back is worth keeping.
 */
export const accessAssignmentChange = pgTable(
  "access_assignment_change",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    organizationId: t
      .text()
      .notNull()
      .references(() => organization.id),
    personId: t.uuid().notNull(),
    sourceAssignmentId: t.uuid().notNull(),
    targetAssignmentId: t.uuid().notNull(),
    /** The month the target starts and the source stops. */
    effectiveMonth: t.date().notNull(),
    previousSourceEndMonth: t.date(),
    scheduledBy: t.text().references(() => user.id, { onDelete: "set null" }),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    cancelledBy: t.text().references(() => user.id, { onDelete: "set null" }),
    cancelledAt: t.timestamp({ withTimezone: true }),
  }),
  (table) => [
    foreignKey({
      name: "access_assignment_change_source_same_org",
      columns: [table.organizationId, table.sourceAssignmentId],
      foreignColumns: [accessAssignment.organizationId, accessAssignment.id],
    }),
    foreignKey({
      name: "access_assignment_change_target_same_org",
      columns: [table.organizationId, table.targetAssignmentId],
      foreignColumns: [accessAssignment.organizationId, accessAssignment.id],
    }),
    foreignKey({
      name: "access_assignment_change_person_same_org",
      columns: [table.organizationId, table.personId],
      foreignColumns: [person.organizationId, person.id],
    }),
    // One live change per source, so a double submit is one scheduled change.
    uniqueIndex("access_assignment_change_one_live_per_source")
      .on(table.sourceAssignmentId)
      .where(sql`cancelled_at is null`),
    index("access_assignment_change_by_org_month").on(
      table.organizationId,
      table.effectiveMonth,
    ),
    index("access_assignment_change_by_person").on(table.personId),
    check(
      "access_assignment_change_is_a_month",
      sql`date_trunc('month', effective_month) = effective_month`,
    ),
    check(
      "access_assignment_change_two_rows",
      sql`source_assignment_id <> target_assignment_id`,
    ),
  ],
);

/**
 * The organization's own membership settings. One row per organization.
 *
 * Grace days and the calendar time zone arrive with the monthly tracker
 * (migration 0053); the table lands here so all four access tables share one
 * isolation migration.
 */
export const membershipPolicy = pgTable(
  "membership_policy",
  (t) => ({
    organizationId: t
      .text()
      .notNull()
      .primaryKey()
      .references(() => organization.id),
    /** Days after the 1st that an unpaid month still admits. */
    graceDays: t.integer().notNull().default(7),
    /**
     * The zone every deadline is counted in. Null until the owner picks one;
     * the reader falls back to the default entity's zone, so a gym that never
     * opens the setting still gets sane months.
     */
    calendarTimeZone: t.text(),
    bankDetails: t.text().notNull().default(""),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  () => [
    check(
      "membership_policy_grace_sane",
      sql`grace_days >= 0 AND grace_days <= 28`,
    ),
  ],
);

/**
 * One calendar month of one shared membership, ticked by hand.
 *
 * ONE row per assignment per month, never one per covered branch: a membership
 * covering a mat and a gym is paid once. A missing row means unpaid, which is
 * why nothing backfills this table.
 */
export const membershipMonth = pgTable(
  "membership_month",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    organizationId: t
      .text()
      .notNull()
      .references(() => organization.id),
    assignmentId: t.uuid().notNull(),
    /** The first day of the month, in the organization's calendar zone. */
    month: t.date().notNull(),
    status: t.text().notNull().default("unpaid"),
    version: t.integer().notNull().default(1),
    claimedBy: t.text().references(() => user.id, { onDelete: "set null" }),
    reportedAt: t.timestamp({ withTimezone: true }),
    reviewedBy: t.text().references(() => user.id, { onDelete: "set null" }),
    reviewedAt: t.timestamp({ withTimezone: true }),
    priceMinor: t.integer(),
    currency: t.text(),
    deadline: t.timestamp({ withTimezone: true }),
    calendarTimeZone: t.text(),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    uniqueIndex("membership_month_org_id").on(table.organizationId, table.id),
    uniqueIndex("membership_month_one_per_month").on(
      table.assignmentId,
      table.month,
    ),
    index("membership_month_by_org_month").on(
      table.organizationId,
      table.month,
    ),
    foreignKey({
      name: "membership_month_assignment_same_org",
      columns: [table.organizationId, table.assignmentId],
      foreignColumns: [accessAssignment.organizationId, accessAssignment.id],
    }),
    check(
      "membership_month_is_a_month",
      sql`date_trunc('month', month) = month`,
    ),
    check(
      "membership_month_status_supported",
      sql`status in ('unpaid','reported','confirmed','rejected')`,
    ),
    check(
      "membership_month_price_complete",
      sql`(price_minor is null) = (currency is null)`,
    ),
    check(
      "membership_month_price_sane",
      sql`price_minor is null or (price_minor >= 0 and char_length(currency) = 3)`,
    ),
  ],
);

/**
 * Append-only history of the paid flag (ADR 126).
 *
 * One row per real CHANGE. Marking a month paid twice writes one row, because
 * the second call changes nothing, which is what makes the mark idempotent and
 * the history readable.
 *
 * There is deliberately no foreign key to `access_assignment`: the audit
 * outlives the membership it is about, so erasing somebody's assignment must
 * not take the record of who marked what with it.
 */
export const membershipMonthAudit = pgTable(
  "membership_month_audit",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    organizationId: t
      .text()
      .notNull()
      .references(() => organization.id),
    assignmentId: t.uuid().notNull(),
    month: t.date().notNull(),
    event: t.text().notNull().default("corrected"),
    beforeStatus: t.text(),
    afterStatus: t.text().notNull().default("unpaid"),
    reason: t.text(),
    priceMinor: t.integer(),
    currency: t.text(),
    deadline: t.timestamp({ withTimezone: true }),
    calendarTimeZone: t.text(),
    actorId: t.text().references(() => user.id, { onDelete: "set null" }),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (table) => [
    index("membership_month_audit_by_assignment").on(
      table.assignmentId,
      table.month,
    ),
  ],
);

export const membershipAccessHold = pgTable(
  "membership_access_hold",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    organizationId: t
      .text()
      .notNull()
      .references(() => organization.id),
    personId: t.uuid().notNull(),
    assignmentId: t.uuid().notNull(),
    membershipMonthId: t.uuid().notNull(),
    entityId: t.text().notNull(),
    rejectedBy: t.text().references(() => user.id, { onDelete: "set null" }),
    rejectionReason: t.text().notNull(),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    resolvedBy: t.text().references(() => user.id, { onDelete: "set null" }),
    resolutionReason: t.text(),
    resolvedAt: t.timestamp({ withTimezone: true }),
  }),
  (table) => [
    uniqueIndex("membership_access_hold_one_open_source")
      .on(table.membershipMonthId, table.entityId)
      .where(sql`resolved_at is null`),
    index("membership_access_hold_open_person_entity").on(
      table.organizationId,
      table.personId,
      table.entityId,
      table.resolvedAt,
    ),
    foreignKey({
      name: "membership_access_hold_person_same_org",
      columns: [table.organizationId, table.personId],
      foreignColumns: [person.organizationId, person.id],
    }),
    foreignKey({
      name: "membership_access_hold_assignment_same_org",
      columns: [table.organizationId, table.assignmentId],
      foreignColumns: [accessAssignment.organizationId, accessAssignment.id],
    }),
    foreignKey({
      name: "membership_access_hold_month_same_org",
      columns: [table.organizationId, table.membershipMonthId],
      foreignColumns: [membershipMonth.organizationId, membershipMonth.id],
    }),
    foreignKey({
      name: "membership_access_hold_entity_same_org",
      columns: [table.organizationId, table.entityId],
      foreignColumns: [entity.organizationId, entity.id],
    }),
    check(
      "membership_access_hold_resolution_complete",
      sql`(resolved_at is null and resolved_by is null and resolution_reason is null) or (resolved_at is not null and resolution_reason is not null)`,
    ),
  ],
);

export const accessPlanRelations = relations(accessPlan, ({ many }) => ({
  entities: many(accessPlanEntity),
  assignments: many(accessAssignment),
}));

export const accessPlanEntityRelations = relations(
  accessPlanEntity,
  ({ one }) => ({
    plan: one(accessPlan, {
      fields: [accessPlanEntity.planId],
      references: [accessPlan.id],
    }),
    entity: one(entity, {
      fields: [accessPlanEntity.entityId],
      references: [entity.id],
    }),
  }),
);

export const accessAssignmentRelations = relations(
  accessAssignment,
  ({ one }) => ({
    plan: one(accessPlan, {
      fields: [accessAssignment.planId],
      references: [accessPlan.id],
    }),
  }),
);
