import { sql } from "drizzle-orm";
import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { entity } from "./entity-schema";

// No RLS, like academy_invite: the public form resolves a token before any
// academy is known, so matops_app has no grant and only the base connection reads it.
export const dropInLink = pgTable(
  "drop_in_link",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    token: t.text().notNull().unique(),
    createdBy: t.text().notNull(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    revokedAt: t.timestamp({ withTimezone: true }),
  }),
  (table) => [
    uniqueIndex("drop_in_link_one_live")
      .on(table.academyId)
      .where(sql`${table.revokedAt} is null`),
  ],
);

export const rateLimit = pgTable(
  "rate_limit",
  (t) => ({
    key: t.text().notNull().primaryKey(),
    count: t.integer().notNull(),
    resetAt: t.timestamp({ withTimezone: true }).notNull(),
  }),
  (table) => [index("rate_limit_by_reset").on(table.resetAt)],
);
