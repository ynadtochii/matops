import { pgTable } from "drizzle-orm/pg-core";

/**
 * Trivial table proving the DB pipeline end to end (slice 0.2): the migration
 * applies, the seed writes a row, a query reads it. Not tenant-scoped and not a
 * product table — the scheduling tables (Phase 2) replace `Post` and add the
 * real domain. Kept afterwards as a cheap liveness/health check.
 */
export const Health = pgTable("_health", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  note: t.text().notNull().default("ok"),
  checkedAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
}));

export * from "./auth-schema";
export * from "./invite-schema";
export * from "./scheduling";
