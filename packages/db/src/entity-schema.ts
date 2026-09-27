import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth-schema";
import { person } from "./person-schema";

/**
 * The organization/entity foundation (ADR 124).
 *
 * An `organization` is the owner group. An `entity` is one facility it runs,
 * and every product row belongs to exactly one. An `entity_membership` is one
 * person's access to one entity.
 *
 * Two id types are deliberate and load-bearing:
 *  - `entity.id` is TEXT, not uuid, because the default entity of an
 *    organization is created with the organization's own id (Decision 5), and
 *    Better Auth organization ids are random strings. It is also what every
 *    BJJ table's existing `text academy_id` points at, so the column type
 *    never has to change.
 *  - `entity_membership.id` is TEXT for the same reason: twelve `member_id`
 *    columns across seven BJJ tables are already `text` and are repointed here.
 *
 * NO foreign key here cascades. `erase.ts` deletes in an explicit order and
 * `erase-coverage.test.ts` proves each table is covered; a cascade would hide a
 * table from that proof.
 */

export const entity = pgTable(
  "entity",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    organizationId: t
      .text()
      .notNull()
      .references(() => organization.id),
    type: t.text().notNull(),
    name: t.text().notNull(),
    slug: t.text().notNull(),
    isDefault: t.boolean().notNull().default(false),
    timeZone: t.text(),
    country: t.text(),
    address: t.text(),
    mapUrl: t.text(),
    bookingWindowDays: t.integer().notNull().default(7),
    scheduleRevision: t.integer().notNull().default(0),
    publicCode: t.text().notNull().unique(),
    status: t.text().notNull().default("active"),
    membershipEnforcedAt: t.timestamp({ withTimezone: true }),
    signupHealthQuestion: t.boolean().notNull().default(false),
    waiverRequired: t.boolean().notNull().default(false),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
    deletedAt: t.timestamp({ withTimezone: true }),
  }),
  (table) => [
    uniqueIndex("entity_org_id").on(table.organizationId, table.id),
    uniqueIndex("entity_org_slug").on(table.organizationId, table.slug),
    uniqueIndex("entity_one_default_per_org")
      .on(table.organizationId)
      .where(sql`is_default and deleted_at is null`),
    index("entity_by_org").on(table.organizationId),
    check(
      "entity_type_supported",
      sql`type in ('bjj_academy','general_space')`,
    ),
    check(
      "entity_booking_window_days_valid",
      sql`${table.bookingWindowDays} between 1 and 90`,
    ),
    check(
      "entity_schedule_revision_valid",
      sql`${table.scheduleRevision} >= 0`,
    ),
  ],
);

export const academyProfile = pgTable("academy_profile", (t) => ({
  entityId: t
    .text()
    .notNull()
    .primaryKey()
    .references(() => entity.id),
  createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: t
    .timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
}));

export const entityMembership = pgTable(
  "entity_membership",
  (t) => ({
    id: t
      .text()
      .notNull()
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    organizationId: t
      .text()
      .notNull()
      .references(() => organization.id),
    entityId: t.text().notNull(),
    userId: t.text().references(() => user.id),
    personId: t.uuid(),
    role: t.text().notNull(),
    status: t.text().notNull().default("pending"),
    invitedRole: t.text(),
    joinedAt: t.timestamp({ withTimezone: true }),
    erasureRequestedAt: t.timestamp({ withTimezone: true }),
    emailUpdatesAt: t.timestamp({ withTimezone: true }),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    uniqueIndex("entity_membership_one_per_user").on(
      table.entityId,
      table.userId,
    ),
    uniqueIndex("entity_membership_one_per_person").on(
      table.entityId,
      table.personId,
    ),
    uniqueIndex("entity_membership_entity_id").on(table.entityId, table.id),
    index("entity_membership_by_user").on(table.userId),
    index("entity_membership_by_person").on(table.personId),
    index("entity_membership_by_entity_status").on(
      table.entityId,
      table.status,
    ),
    foreignKey({
      name: "entity_membership_entity_same_org",
      columns: [table.organizationId, table.entityId],
      foreignColumns: [entity.organizationId, entity.id],
    }),
    foreignKey({
      name: "entity_membership_person_same_org",
      columns: [table.organizationId, table.personId],
      foreignColumns: [person.organizationId, person.id],
    }),
    check(
      "entity_membership_has_subject",
      sql`user_id is not null or person_id is not null`,
    ),
  ],
);
