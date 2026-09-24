import { sql } from "drizzle-orm";
import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { entity } from "./entity-schema";

/**
 * The permanent entrance link (ADR 139). One live row per branch: the iPad at
 * the door keeps a bookmark and never needs an owner to switch reception on
 * again.
 *
 * A permanent credential does not belong in the Better Auth `verification`
 * table, whose rows expire, nor in `academy_invite`, which grants membership.
 */
export const receptionLink = pgTable(
  "reception_link",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    tokenHash: t.text().notNull().unique(),
    tokenCiphertext: t.text(),
    createdBy: t.text().references(() => user.id, { onDelete: "set null" }),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    revokedAt: t.timestamp({ withTimezone: true }),
  }),
  (table) => [
    uniqueIndex("reception_link_one_live_per_branch")
      .on(table.academyId)
      .where(sql`revoked_at is null`),
    index("reception_link_by_academy").on(table.academyId, table.createdAt),
  ],
);
