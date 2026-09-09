import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { entity, entityMembership } from "./entity-schema";

/** Audit event emitted whenever the current referral state changes. */
const referralAction = pgEnum("referral_action", [
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
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
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
    foreignKey({
      name: "member_referral_student_membership",
      columns: [table.academyId, table.studentMemberId],
      foreignColumns: [entityMembership.entityId, entityMembership.id],
    }),
    foreignKey({
      name: "member_referral_referrer_membership",
      columns: [table.academyId, table.referrerMemberId],
      foreignColumns: [entityMembership.entityId, entityMembership.id],
    }),
  ],
);

/** Append-only history for initial assignment, owner correction, and clearing. */
export const memberReferralAudit = pgTable(
  "member_referral_audit",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
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
    foreignKey({
      name: "member_referral_audit_student_membership",
      columns: [table.academyId, table.studentMemberId],
      foreignColumns: [entityMembership.entityId, entityMembership.id],
    }),
    foreignKey({
      name: "member_referral_audit_old_referrer_membership",
      columns: [table.academyId, table.oldReferrerMemberId],
      foreignColumns: [entityMembership.entityId, entityMembership.id],
    }),
    foreignKey({
      name: "member_referral_audit_new_referrer_membership",
      columns: [table.academyId, table.newReferrerMemberId],
      foreignColumns: [entityMembership.entityId, entityMembership.id],
    }),
  ],
);
