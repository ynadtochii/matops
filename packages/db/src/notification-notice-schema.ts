import { foreignKey, index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { entity } from "./entity-schema";

export const notificationNotice = pgTable(
  "notification_notice",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    eventKey: t.text().notNull(),
    kind: t.text().notNull(),
    subject: t.text().notNull(),
    body: t.text().notNull(),
    templateVersion: t.text().notNull(),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (table) => [
    uniqueIndex("notification_notice_event").on(
      table.academyId,
      table.eventKey,
    ),
    uniqueIndex("notification_notice_academy_id").on(table.academyId, table.id),
    index("notification_notice_by_academy").on(
      table.academyId,
      table.createdAt,
    ),
  ],
);

export const notificationRecipient = pgTable(
  "notification_recipient",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    noticeId: t.uuid().notNull(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    recipientKey: t.text().notNull(),
    userId: t.text(),
    personId: t.uuid(),
    visitId: t.uuid(),
    email: t.text(),
    status: t.text().notNull().default("pending"),
    leaseOwner: t.text(),
    leaseMode: t.text(),
    leaseExpiresAt: t.timestamp({ withTimezone: true }),
    acceptedAt: t.timestamp({ withTimezone: true }),
    lastAttemptAt: t.timestamp({ withTimezone: true }),
    lastErrorCode: t.text(),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (table) => [
    uniqueIndex("notification_recipient_notice_key").on(
      table.noticeId,
      table.recipientKey,
    ),
    uniqueIndex("notification_recipient_academy_id").on(
      table.academyId,
      table.id,
    ),
    foreignKey({
      name: "notification_recipient_notice_academy_fk",
      columns: [table.academyId, table.noticeId],
      foreignColumns: [notificationNotice.academyId, notificationNotice.id],
    }).onDelete("cascade"),
    index("notification_recipient_claim").on(
      table.noticeId,
      table.status,
      table.leaseExpiresAt,
      table.createdAt,
    ),
    index("notification_recipient_by_user").on(table.academyId, table.userId),
    index("notification_recipient_by_person").on(
      table.academyId,
      table.personId,
    ),
    index("notification_recipient_by_visit").on(table.academyId, table.visitId),
  ],
);

export const notificationAttempt = pgTable(
  "notification_attempt",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    recipientId: t.uuid().notNull(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    leaseOwner: t.text().notNull(),
    outcome: t.text().notNull().default("sending"),
    providerId: t.text(),
    errorCode: t.text(),
    startedAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: t.timestamp({ withTimezone: true }),
  }),
  (table) => [
    foreignKey({
      name: "notification_attempt_recipient_academy_fk",
      columns: [table.academyId, table.recipientId],
      foreignColumns: [
        notificationRecipient.academyId,
        notificationRecipient.id,
      ],
    }).onDelete("cascade"),
    index("notification_attempt_by_recipient").on(
      table.recipientId,
      table.startedAt,
    ),
    index("notification_attempt_by_academy").on(
      table.academyId,
      table.startedAt,
    ),
  ],
);
