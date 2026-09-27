import { foreignKey, index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { entity, entityMembership } from "./entity-schema";

export const academyWaiver = pgTable(
  "academy_waiver",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    body: t.text().notNull(),
    createdBy: t.text().notNull(),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (table) => [
    index("aw_by_academy").on(table.academyId, table.createdAt),
    uniqueIndex("aw_academy_id").on(table.academyId, table.id),
  ],
);

export const waiverAcceptance = pgTable(
  "waiver_acceptance",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    memberId: t.text().notNull(),
    waiverId: t.uuid().notNull(),
    acceptedAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (table) => [
    uniqueIndex("wa_uniq_member_waiver").on(table.memberId, table.waiverId),
    foreignKey({
      name: "waiver_acceptance_membership",
      columns: [table.academyId, table.memberId],
      foreignColumns: [entityMembership.entityId, entityMembership.id],
    }),
    foreignKey({
      name: "waiver_acceptance_waiver",
      columns: [table.academyId, table.waiverId],
      foreignColumns: [academyWaiver.academyId, academyWaiver.id],
    }),
  ],
);
