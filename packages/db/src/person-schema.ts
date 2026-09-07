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

export const personGuardian = pgTable(
  "person_guardian",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    organizationId: t
      .text()
      .notNull()
      .references(() => organization.id),
    studentPersonId: t.uuid().notNull(),
    guardianUserId: t.text().notNull(),
    createdByUserId: t.text().references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (table) => [
    uniqueIndex("person_guardian_one_relation").on(
      table.organizationId,
      table.studentPersonId,
      table.guardianUserId,
    ),
    index("person_guardian_by_account").on(
      table.organizationId,
      table.guardianUserId,
    ),
    foreignKey({
      name: "person_guardian_student_same_org",
      columns: [table.organizationId, table.studentPersonId],
      foreignColumns: [person.organizationId, person.id],
    }),
    foreignKey({
      name: "person_guardian_account_same_org",
      columns: [table.organizationId, table.guardianUserId],
      foreignColumns: [member.organizationId, member.userId],
    }),
  ],
);

export const personRelations = relations(person, ({ one, many }) => ({
  organization: one(organization, {
    fields: [person.organizationId],
    references: [organization.id],
  }),
  account: one(user, {
    fields: [person.accountUserId],
    references: [user.id],
  }),
  guardians: many(personGuardian),
}));

export const personGuardianRelations = relations(personGuardian, ({ one }) => ({
  student: one(person, {
    fields: [personGuardian.studentPersonId],
    references: [person.id],
  }),
  guardian: one(user, {
    fields: [personGuardian.guardianUserId],
    references: [user.id],
  }),
}));
