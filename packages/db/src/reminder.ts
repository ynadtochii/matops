import { and, asc, eq, gt, isNull, lte } from "drizzle-orm";

import { REMINDER_LEAD_MINUTES } from "@matops/domain";

import type { DbExec } from "./client";
import { organization } from "./auth-schema";
import { classInstance, classParticipation, classTemplate } from "./scheduling";

/**
 * Class-reminder claim (Phase 4, docs/issues/17). Runs on the base `db`
 * connection (service role, cross-academy, outside the tenant seam) — same shape
 * as the materialization sweep. This module does ONLY the data + the atomic
 * claim; the message build + push send are orchestrated one layer up in
 * `@matops/api` (docs/issues/34 keeps transport out of the db package).
 *
 * Idempotency: a class is CLAIMED by flipping `reminder_sent_at` NULL→now under a
 * `WHERE reminder_sent_at IS NULL` guard, so concurrent sweeps (or a re-run)
 * never double-send — only the sweep that wins the flip returns the row.
 */

const MIN_MS = 60 * 1000;

export interface DueReminderClass {
  classId: string;
  academyId: string;
  title: string;
  startsAt: Date;
  /** Template zone for the local-time label; null for one-off classes. */
  timeZone: string | null;
  /** User ids of students with a live booking on this class. */
  studentIds: string[];
}

export interface ClaimRemindersOptions {
  /** "Now" — injected so the cron/tests control the clock (default: real now). */
  now?: Date;
  /** How long before start the reminder fires (default: domain lead time). */
  leadMinutes?: number;
  /** Max classes claimed per run (bounds work under the serverless limit). */
  limit?: number;
}

/**
 * Claim every class whose reminder is now due — scheduled, not deleted, not yet
 * reminded, starting within the lead window, and with at least one live booking —
 * stamp it sent, and return each with its booked students. Bounded by `limit`;
 * leftovers are picked up on the next tick.
 */
export async function claimDueReminderClasses(
  opts: ClaimRemindersOptions & { exec: DbExec },
): Promise<DueReminderClass[]> {
  const exec = opts.exec;
  const now = opts.now ?? new Date();
  const lead = opts.leadMinutes ?? REMINDER_LEAD_MINUTES;
  const limit = opts.limit ?? 200;
  const windowEnd = new Date(now.getTime() + lead * MIN_MS);

  // Candidates: due, unreminded, and actually booked (join forces ≥1 booking).
  const candidates = await exec
    .selectDistinct({
      classId: classInstance.id,
      academyId: classInstance.academyId,
      title: classInstance.title,
      startsAt: classInstance.startsAt,
      timeZone: classTemplate.timeZone,
    })
    .from(classInstance)
    .innerJoin(
      classParticipation,
      and(
        eq(classParticipation.classId, classInstance.id),
        eq(classParticipation.bookingStatus, "booked"),
      ),
    )
    .leftJoin(classTemplate, eq(classTemplate.id, classInstance.templateId))
    .innerJoin(organization, eq(organization.id, classInstance.academyId))
    .where(
      and(
        isNull(organization.deletedAt),
        eq(classInstance.status, "scheduled"),
        isNull(classInstance.deletedAt),
        isNull(classInstance.reminderSentAt),
        gt(classInstance.startsAt, now),
        lte(classInstance.startsAt, windowEnd),
      ),
    )
    .orderBy(asc(classInstance.startsAt))
    .limit(limit);

  const claimed: DueReminderClass[] = [];
  for (const c of candidates) {
    // Atomic claim: only the flip that wins NULL→now proceeds to send.
    const [won] = await exec
      .update(classInstance)
      .set({ reminderSentAt: now })
      .where(
        and(
          eq(classInstance.id, c.classId),
          isNull(classInstance.reminderSentAt),
        ),
      )
      .returning({ id: classInstance.id });
    if (!won) continue;

    const booked = await exec
      .select({ studentId: classParticipation.studentId })
      .from(classParticipation)
      .where(
        and(
          eq(classParticipation.classId, c.classId),
          eq(classParticipation.bookingStatus, "booked"),
        ),
      );
    claimed.push({ ...c, studentIds: booked.map((b) => b.studentId) });
  }
  return claimed;
}
