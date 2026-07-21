import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

/**
 * Expo push tokens (Phase 4, docs/issues/17, 34). Keyed by `user.id` — a token
 * is user-global identity data, NOT academy-scoped, so this table lives OUTSIDE
 * the tenant seam (like the auth `user`/`session` tables): it carries no
 * `academy_id` and gets NO RLS policy. Only the trusted base connection reads or
 * writes it — registration goes through a `protectedProcedure` (authenticated,
 * no `ctx.db`) and sends run on the base connection in the cron / API notify
 * helper. A device's token is unique; re-registering reassigns it to the current
 * user (tokens can migrate between accounts on a shared device).
 *
 * Table-only module (imported by schema.ts for drizzle-kit); the read/write
 * helpers live in ./push-token.ts, mirroring the invite-schema / invite split.
 */
export const pushToken = pgTable(
  "push_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    platform: text("platform").notNull(), // "ios" | "android"
    deviceId: text("device_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("pt_by_user").on(table.userId)],
);
