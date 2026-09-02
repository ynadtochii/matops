import { index, pgTable } from "drizzle-orm/pg-core";

import { entity } from "./entity-schema";

/**
 * The notification center (v3.7, docs/issues/77). One row per RECIPIENT per
 * event, written by the same `deliver()` choke point that sends the push,
 * so a message survives a phone with notifications off. Academy-scoped and
 * inside the tenant seam: a member of two gyms sees one feed per gym.
 *
 * Fan-out on write rather than an announcement table plus read receipts —
 * unread count is one indexed count and the feed is one flat query, which is
 * worth far more than the rows saved at gym scale.
 *
 * `link` is an in-app path ("/class/<id>"), not a JSON payload: every client
 * only ever needs somewhere to go. `read_at` NULL means unread.
 */
export const notification = pgTable(
  "notification",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    userId: t.text().notNull(),
    kind: t.text().notNull(),
    title: t.text().notNull(),
    body: t.text().notNull(),
    link: t.text(),
    sentBy: t.text(),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    readAt: t.timestamp({ withTimezone: true }),
  }),
  (table) => [
    index("notif_by_academy_user").on(
      table.academyId,
      table.userId,
      table.createdAt,
    ),
  ],
);
