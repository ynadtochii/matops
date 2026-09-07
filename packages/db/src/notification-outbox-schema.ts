import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { entity } from "./entity-schema";

export const notificationOutbox = pgTable(
  "notification_outbox",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    eventKey: t.text().notNull(),
    recipientKey: t.text().notNull(),
    channel: t.text().notNull(),
    recipientAddress: t.text().notNull(),
    subject: t.text().notNull(),
    body: t.text().notNull(),
    status: t.text().notNull().default("pending"),
    attempts: t.integer().notNull().default(0),
    nextAttemptAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    lockedAt: t.timestamp({ withTimezone: true }),
    sentAt: t.timestamp({ withTimezone: true }),
    lastError: t.text(),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (table) => [
    uniqueIndex("notification_outbox_event_recipient_channel").on(
      table.eventKey,
      table.recipientKey,
      table.channel,
    ),
    index("notification_outbox_due").on(
      table.status,
      table.nextAttemptAt,
      table.createdAt,
    ),
    index("notification_outbox_by_academy").on(
      table.academyId,
      table.status,
      table.createdAt,
    ),
  ],
);
