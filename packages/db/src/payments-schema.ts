import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  pgEnum,
  pgTable,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { entity, entityMembership } from "./entity-schema";

/**
 * Manual bank-transfer dues schema (v1.3, docs/issues/40). A NEW, self-contained
 * payments domain — no card processor. Additive by design (architecture §8): its
 * own tables + router + pure module (`@matops/domain/payments`), the tenant seam
 * untouched.
 *
 * Every table here is tenant-scoped: it carries `academy_id` and gets
 * `ENABLE ROW LEVEL SECURITY` + the standard policy in the hand-written part of
 * migration 0015 (copying the `drop_in` pattern in 0013). Money is stored as an
 * integer in the currency's MINOR unit (e.g. cents) — never a float.
 *
 * Payment data lives here, NOT on Better Auth's `member` table: that table has no
 * RLS and is read on the base connection (docs/issues/12). A per-member
 * `member_dues` row keeps the whole payments domain on the RLS seam and off the
 * auth schema (the ADR-40 "small per-member dues row" alternative).
 */

/** Billing cadence a plan charges on. v1.3 ships monthly only (docs/issues/40). */
export const paymentCycle = pgEnum("payment_cycle", ["monthly"]);

/**
 * A student "I paid" claim's lifecycle. `pending` awaits the owner; `confirmed`
 * rolls `member_dues.next_due_at` forward; `rejected` is dismissed. There is no
 * processor state — this is the whole payment lifecycle (docs/issues/40).
 */
export const paymentClaimStatus = pgEnum("payment_claim_status", [
  "pending",
  "confirmed",
  "rejected",
]);

/**
 * A price the owner defines — the academy's dues "price list" (spec O7). A member
 * is put on one plan (via `member_dues`); the plan's price + cycle drive the
 * amount shown on the requisites card and the roll-forward on confirm.
 */
export const membershipPlan = pgTable(
  "membership_plan",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    name: t.text().notNull(),
    priceMinor: t.integer().notNull(), // price in the currency's minor unit (cents)
    currency: t.text().notNull(), // ISO-4217, 3 letters
    cycle: paymentCycle().notNull().default("monthly"),
    deletedAt: t.timestamp({ withTimezone: true }), // soft-delete; keeps claim history valid
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [index("mp_by_academy").on(table.academyId)],
);

/**
 * One member's dues: which plan they are on and when their next payment is due.
 * `next_due_at` is the single input to the DERIVED status (`paymentStatus`,
 * docs/issues/40) and is rolled forward one cycle when the owner confirms a claim
 * — never a stored `paid/overdue` column. One row per (academy, member); no row =
 * the owner has not set up dues for this member yet.
 */
export const memberDues = pgTable(
  "member_dues",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    memberId: t.text().notNull(), // → entity_membership.id
    planId: t
      .uuid()
      .notNull()
      .references(() => membershipPlan.id),
    nextDueAt: t.timestamp({ withTimezone: true }).notNull(),
    // The billing period ("YYYY-MM") we last sent a dues reminder for (R.1,
    // migration 0016). One reminder per period: the sweep skips a row whose
    // stored period already matches `to_char(next_due_at,'YYYY-MM')`, and it
    // becomes eligible again automatically once a confirm rolls `next_due_at`
    // into a new month. Null = never reminded.
    duesReminderPeriod: t.text(),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    // One dues record per member per academy.
    uniqueIndex("md_uniq_academy_member").on(table.academyId, table.memberId),
    index("md_by_next_due").on(table.nextDueAt),
    foreignKey({
      name: "member_dues_membership",
      columns: [table.academyId, table.memberId],
      foreignColumns: [entityMembership.entityId, entityMembership.id],
    }),
  ],
);

/**
 * A student's "I paid" claim (spec S9). Raised after they transfer money in their
 * own bank app; the owner confirms (→ rolls `member_dues.next_due_at`) or rejects.
 * `amount_minor` + `currency` snapshot the plan price at claim time (a later plan
 * price change never rewrites history). `period` is the `"YYYY-MM"` billing period
 * (`paymentPeriod`); the partial unique index enforces one OPEN claim per period.
 */
export const paymentClaim = pgTable(
  "payment_claim",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    memberId: t.text().notNull(), // → entity_membership.id
    planId: t
      .uuid()
      .notNull()
      .references(() => membershipPlan.id),
    amountMinor: t.integer().notNull(), // snapshot of the plan price at claim time
    currency: t.text().notNull(),
    period: t.text().notNull(), // "YYYY-MM" billing period
    status: paymentClaimStatus().notNull().default("pending"),
    proofUrl: t.text(), // optional transfer screenshot
    claimedAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    confirmedBy: t.text(), // → user.id of the confirming owner; null until acted on
    confirmedAt: t.timestamp({ withTimezone: true }),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    index("pc_by_academy_member").on(table.academyId, table.memberId),
    index("pc_by_academy_status").on(table.academyId, table.status),
    // One OPEN ("I paid" awaiting confirm) claim per member per period — the
    // `claimDedupeKey` rule enforced in the DB. Confirmed/rejected rows are free
    // to accumulate as history.
    uniqueIndex("pc_uniq_open_claim")
      .on(table.academyId, table.memberId, table.period)
      .where(sql`status = 'pending'`),
    foreignKey({
      name: "payment_claim_membership",
      columns: [table.academyId, table.memberId],
      foreignColumns: [entityMembership.entityId, entityMembership.id],
    }),
  ],
);

/**
 * The owner's bank details ("requisites") shown on the student pay card (spec
 * S9/O6). One row per academy. Free text — the owner pastes their IBAN / card /
 * bank name; the student copies it into their bank app. The per-student reference
 * code is derived at read time (not stored), so it is not a column here.
 */
export const paymentSettings = pgTable("payment_settings", (t) => ({
  academyId: t
    .text()
    .notNull()
    .primaryKey()
    .references(() => entity.id),
  bankDetails: t.text().notNull().default(""),
  graceDays: t.integer().notNull().default(7),
  enforcedAt: t.timestamp({ withTimezone: true }),
  createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: t
    .timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
}));
