import { sql } from "drizzle-orm";
import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { entity } from "./entity-schema";

// No RLS, like academy_invite: the public form resolves a token before any
// academy is known, so matops_app has no grant and only the base connection reads it.
function liveLinkTable<Name extends string>(name: Name) {
  return pgTable(
    name,
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
      uniqueIndex(`${name}_one_live`)
        .on(table.academyId)
        .where(sql`${table.revokedAt} is null`),
    ],
  );
}

export const dropInLink = liveLinkTable("drop_in_link");

export const deskLink = liveLinkTable("desk_link");

export const rateLimit = pgTable(
  "rate_limit",
  (t) => ({
    key: t.text().notNull().primaryKey(),
    count: t.integer().notNull(),
    resetAt: t.timestamp({ withTimezone: true }).notNull(),
  }),
  (table) => [index("rate_limit_by_reset").on(table.resetAt)],
);

export type LiveLinkTable = ReturnType<typeof liveLinkTable<string>>;
