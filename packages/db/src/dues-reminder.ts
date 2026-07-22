import { eq, inArray, sql } from "drizzle-orm";

import { DUE_SOON_DAYS } from "@matops/domain";

import { member, organization } from "./auth-schema";
import { db } from "./client";
import { memberDues, membershipPlan } from "./payments-schema";

/**
 * Dues-reminder claim (v1.3, R.1 — docs/issues/40). Runs on the base `db`
 * connection (service role, cross-academy, OUTSIDE the tenant seam) — the same
 * shape as the class-reminder + materialization sweeps. This module does ONLY the
 * data + the atomic claim; the message build + push/email send are orchestrated
 * one layer up in `@matops/api` (docs/issues/34 keeps transport out of `db`).
 *
 * Idempotency = one reminder per billing period. A row is CLAIMED by setting
 * `dues_reminder_period` to `to_char(next_due_at,'YYYY-MM')` under a
 * `WHERE dues_reminder_period IS DISTINCT FROM …` guard, all in ONE
 * `UPDATE … RETURNING`, so concurrent sweeps (or a re-run) never double-send —
 * only the sweep that wins the row flip returns it. When a confirm later rolls
 * `next_due_at` into a new month the period changes, so the member becomes
 * eligible again — no reset needed.
 */

export interface DueDuesReminder {
  userId: string;
  academyName: string;
  planName: string;
  priceMinor: number;
  currency: string;
  nextDueAt: Date;
  /** True when the due date has already passed (drives the message wording). */
  overdue: boolean;
}

export interface ClaimDuesRemindersOptions {
  /** "Now" — injected so the cron/tests control the clock (default: real now). */
  now?: Date;
  /** Max dues rows claimed per run (bounds work under the serverless limit). */
  limit?: number;
}

/**
 * Claim every member whose dues are due soon or overdue and not yet reminded
 * this period, stamp the period, and return each fully resolved (recipient user,
 * gym name, plan amount). Due soon = within `DUE_SOON_DAYS` of the due date;
 * overdue = past it. Bounded by `limit`; leftovers ride the next daily run.
 */
export async function claimDueDuesReminders(
  opts: ClaimDuesRemindersOptions = {},
): Promise<DueDuesReminder[]> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 500;
  // The end of the due-soon window: due dates on or before this are eligible.
  const windowEnd = new Date(
    now.getTime() + DUE_SOON_DAYS * 24 * 60 * 60 * 1000,
  );

  // Atomic claim: flip the period for the eligible rows and return their ids.
  // A bounded subselect caps the batch (UPDATE has no LIMIT of its own).
  const claimed = (await db.execute(sql`
    UPDATE "member_dues" AS md
    SET "dues_reminder_period" = to_char(md."next_due_at" AT TIME ZONE 'UTC', 'YYYY-MM'),
        "updated_at" = now()
    WHERE md."id" IN (
      SELECT "id" FROM "member_dues"
      WHERE ("dues_reminder_period" IS DISTINCT FROM
             to_char("next_due_at" AT TIME ZONE 'UTC', 'YYYY-MM'))
        AND "next_due_at" <= ${windowEnd}
      ORDER BY "next_due_at" ASC
      LIMIT ${limit}
    )
    RETURNING md."id"
  `)) as unknown as { rows: { id: string }[] };

  const ids = claimed.rows.map((r) => r.id);
  if (ids.length === 0) return [];

  // Resolve the recipient user + gym name + plan amount for each claimed row.
  const rows = await db
    .select({
      userId: member.userId,
      academyName: organization.name,
      planName: membershipPlan.name,
      priceMinor: membershipPlan.priceMinor,
      currency: membershipPlan.currency,
      nextDueAt: memberDues.nextDueAt,
    })
    .from(memberDues)
    .innerJoin(member, eq(member.id, memberDues.memberId))
    .innerJoin(membershipPlan, eq(membershipPlan.id, memberDues.planId))
    .innerJoin(organization, eq(organization.id, memberDues.academyId))
    .where(inArray(memberDues.id, ids));

  return rows.map((r) => ({
    ...r,
    overdue: r.nextDueAt.getTime() < now.getTime(),
  }));
}
