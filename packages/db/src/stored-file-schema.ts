import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { check, index, pgTable } from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { entity } from "./entity-schema";

export const storedFile = pgTable(
  "stored_file",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references((): AnyPgColumn => entity.id),
    uploadedBy: t.text().references(() => user.id, { onDelete: "set null" }),
    kind: t.text().notNull(),
    objectKey: t.text().notNull().unique(),
    contentType: t.text().notNull(),
    sizeBytes: t.integer().notNull(),
    status: t.text().notNull().default("pending"),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (table) => [
    index("stored_file_by_academy").on(
      table.academyId,
      table.kind,
      table.createdAt,
    ),
    index("stored_file_by_uploader").on(
      table.academyId,
      table.uploadedBy,
      table.status,
    ),
    check(
      "stored_file_kind_supported",
      sql`kind in ('avatar','academy_icon','payment_receipt')`,
    ),
    check("stored_file_status_supported", sql`status in ('pending','ready')`),
    check("stored_file_size_positive", sql`size_bytes > 0`),
  ],
);
