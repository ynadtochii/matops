import { foreignKey, index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { entity, entityMembership } from "./entity-schema";

/**
 * Member rank + staff notes schema (v1.4, docs/issues/41). Un-parks belts/rank.
 * Additive by design (architecture §8): its own tables + router + pure module
 * (`@matops/domain/rank`), the tenant seam untouched.
 *
 * Every table here is tenant-scoped: it carries `academy_id` and gets
 * `ENABLE ROW LEVEL SECURITY` + the standard policy in the hand-written tail of
 * the migration (copying the payments `0015` pattern). Discipline is stored as
 * plain TEXT (not the class `discipline` enum) so the rank model stays general —
 * a new belted art is seeded config in `@matops/domain/rank`, no migration.
 *
 * Rank/notes live in their own tables, NOT on Better Auth's `member` table: that
 * table has no RLS and is read on the base connection (docs/issues/12). Keeping
 * them here puts the whole domain on the RLS seam and off the auth schema.
 */

/**
 * A member's CURRENT rank in one discipline (spec O4/S7). Set only by staff; the
 * belt + stripe values are validated against the seeded system (`isValidRank`)
 * before write. One row per (academy, member, discipline) — a judoka-and-jitser
 * has two rows (bjj + judo). No row = no rank set for that discipline yet.
 */
export const memberRank = pgTable(
  "member_rank",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    memberId: t.text().notNull(), // → entity_membership.id
    discipline: t.text().notNull(), // free text; validated in the domain layer
    belt: t.text().notNull(),
    stripes: t.integer().notNull().default(0),
    updatedBy: t.text().notNull(), // → user.id of the staff member who set it
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    // One current rank per member per discipline (the upsert target).
    uniqueIndex("mr_uniq_member_discipline").on(
      table.academyId,
      table.memberId,
      table.discipline,
    ),
    foreignKey({
      name: "member_rank_membership",
      columns: [table.academyId, table.memberId],
      foreignColumns: [entityMembership.entityId, entityMembership.id],
    }),
  ],
);

/**
 * An append-only promotion record (spec O4/S7) — written whenever a rank changes
 * (`isRankChange`). `from_*` is null on the first grant. Drives the student's
 * read-only promotion timeline; never edited, so history stays honest.
 */
export const rankPromotion = pgTable(
  "rank_promotion",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    memberId: t.text().notNull(), // → entity_membership.id
    discipline: t.text().notNull(),
    fromBelt: t.text(), // null on first grant
    fromStripes: t.integer(),
    toBelt: t.text().notNull(),
    toStripes: t.integer().notNull(),
    promotedBy: t.text().notNull(), // → user.id of the staff member
    promotedAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (table) => [
    index("rp_by_member").on(table.academyId, table.memberId),
    foreignKey({
      name: "rank_promotion_membership",
      columns: [table.academyId, table.memberId],
      foreignColumns: [entityMembership.entityId, entityMembership.id],
    }),
  ],
);

/**
 * A staff-private note about a member (spec O4, ADR 41) — coaching memory
 * (injuries, goals, readiness). Visible to ALL staff at the academy (RLS scopes
 * to the academy), NEVER surfaced to the member: no student-facing procedure ever
 * reads this table. `author_id` records who wrote it.
 */
export const memberNote = pgTable(
  "member_note",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    memberId: t.text().notNull(), // → entity_membership.id
    body: t.text().notNull(),
    authorId: t.text().notNull(), // → user.id of the staff author
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    index("mn_by_member").on(table.academyId, table.memberId),
    foreignKey({
      name: "member_note_membership",
      columns: [table.academyId, table.memberId],
      foreignColumns: [entityMembership.entityId, entityMembership.id],
    }),
  ],
);
