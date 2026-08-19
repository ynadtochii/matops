import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Audit event emitted whenever the current referral state changes. */
export const referralAction = pgEnum("referral_action", [
  "assigned",
  "corrected",
  "cleared",
]);

/**
 * Current student → referrer attribution. A retained row with a null referrer
 * means an owner cleared a mistake; it stays locked against another staff
 * initial assignment and can only be changed through the owner correction path.
 */
export const memberReferral = pgTable(
  "member_referral",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t.text().notNull(),
    studentMemberId: t.text().notNull(),
    referrerMemberId: t.text(),
    assignedBy: t.text().notNull(),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    uniqueIndex("mref_uniq_academy_student").on(
      table.academyId,
      table.studentMemberId,
    ),
    index("mref_by_academy_referrer").on(
      table.academyId,
      table.referrerMemberId,
    ),
    check(
      "mref_no_self_referral",
      sql`${table.referrerMemberId} IS NULL OR ${table.studentMemberId} <> ${table.referrerMemberId}`,
    ),
  ],
);

/** Append-only history for initial assignment, owner correction, and clearing. */
export const memberReferralAudit = pgTable(
  "member_referral_audit",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t.text().notNull(),
    studentMemberId: t.text().notNull(),
    oldReferrerMemberId: t.text(),
    newReferrerMemberId: t.text(),
    action: referralAction().notNull(),
    actorId: t.text().notNull(),
    occurredAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (table) => [
    index("mref_audit_by_academy_student").on(
      table.academyId,
      table.studentMemberId,
      table.occurredAt,
    ),
    check(
      "mref_audit_no_self_referral",
      sql`${table.newReferrerMemberId} IS NULL OR ${table.studentMemberId} <> ${table.newReferrerMemberId}`,
    ),
  ],
);
