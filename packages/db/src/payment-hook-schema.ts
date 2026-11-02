import { sql } from "drizzle-orm";
import { check, index, pgTable } from "drizzle-orm/pg-core";

import { organization } from "./auth-schema";

// No RLS, like drop_in_link: the webhook resolves its token before any gym is
// known, so matops_app has no grant and only the base connection reads it.
export const stripeHook = pgTable("stripe_hook", (t) => ({
  organizationId: t
    .text()
    .notNull()
    .primaryKey()
    .references(() => organization.id),
  token: t.text().notNull().unique(),
  secretCiphertext: t.text(),
  createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  lastEventAt: t.timestamp({ withTimezone: true }),
  lastProblem: t.text(),
  lastProblemAt: t.timestamp({ withTimezone: true }),
}));

export const cardPayment = pgTable(
  "card_payment",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    organizationId: t
      .text()
      .notNull()
      .references(() => organization.id),
    stripeSessionId: t.text().notNull().unique(),
    assignmentId: t.uuid(),
    month: t.date(),
    amountMinor: t.integer().notNull(),
    currency: t.text().notNull(),
    outcome: t.text().notNull(),
    reason: t.text(),
    dismissedAt: t.timestamp({ withTimezone: true }),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (table) => [
    index("card_payment_by_outcome").on(
      table.organizationId,
      table.outcome,
      table.createdAt,
    ),
    check(
      "card_payment_outcome_supported",
      sql`outcome in ('confirmed','paid_twice','needs_review')`,
    ),
  ],
);
