import { relations } from "drizzle-orm";
import { foreignKey, index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { member, organization, user } from "./auth-schema";

export const person = pgTable(
  "person",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    organizationId: t
      .text()
      .notNull()
      .references(() => organization.id),
    name: t.text().notNull(),
    email: t.text(),
    phone: t.text(),
    accountUserId: t.text().references(() => user.id, {
      onDelete: "set null",
    }),
    archivedAt: t.timestamp({ withTimezone: true }),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    uniqueIndex("person_org_id").on(table.organizationId, table.id),
    uniqueIndex("person_one_per_account").on(
      table.organizationId,
      table.accountUserId,
    ),
    index("person_by_org_name").on(table.organizationId, table.name),
    foreignKey({
      name: "person_account_same_org",
      columns: [table.organizationId, table.accountUserId],
      foreignColumns: [member.organizationId, member.userId],
    }),
  ],
);

export const personRelations = relations(person, ({ one }) => ({
  organization: one(organization, {
    fields: [person.organizationId],
    references: [organization.id],
  }),
  account: one(user, {
    fields: [person.accountUserId],
    references: [user.id],
  }),
}));
