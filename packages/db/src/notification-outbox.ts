import { and, asc, eq, inArray, lt, lte, or } from "drizzle-orm";

import type { DbExec } from "./client";
import type { DbWriter } from "./tenant";
import { notificationOutbox } from "./notification-outbox-schema";

export interface OutboxEmail {
  academyId: string;
  eventKey: string;
  recipientKey: string;
  recipientAddress: string;
  subject: string;
  body: string;
}

export async function enqueueOutboxEmails(
  rows: OutboxEmail[],
  exec: DbWriter,
): Promise<number> {
  if (rows.length === 0) return 0;
  const written = await exec
    .insert(notificationOutbox)
    .values(rows.map((row) => ({ ...row, channel: "email" })))
    .onConflictDoNothing({
      target: [
        notificationOutbox.eventKey,
        notificationOutbox.recipientKey,
        notificationOutbox.channel,
      ],
    })
    .returning({ id: notificationOutbox.id });
  return written.length;
}

export type OutboxEmailSender = (payload: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  idempotencyKey?: string;
}) => Promise<{ sent: boolean; ok: boolean }>;

export interface OutboxSweepResult {
  claimed: number;
  sent: number;
  failed: number;
  exhausted: number;
}

export const NOTIFICATION_OUTBOX_MAX_ATTEMPTS = 10;
const LOCK_TIMEOUT_MS = 10 * 60_000;

function retryAt(attempts: number, now: Date): Date {
  const delayMinutes = Math.min(360, 2 ** Math.min(attempts, 8));
  return new Date(now.getTime() + delayMinutes * 60_000);
}

export async function runNotificationOutbox(
  exec: DbExec,
  send: OutboxEmailSender,
  options: { limit?: number; now?: Date } = {},
): Promise<OutboxSweepResult> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
  const now = options.now ?? new Date();
  const staleBefore = new Date(now.getTime() - LOCK_TIMEOUT_MS);
  const claimed = await exec.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(notificationOutbox)
      .where(
        and(
          lt(notificationOutbox.attempts, NOTIFICATION_OUTBOX_MAX_ATTEMPTS),
          or(
            and(
              or(
                eq(notificationOutbox.status, "pending"),
                eq(notificationOutbox.status, "failed"),
              ),
              lte(notificationOutbox.nextAttemptAt, now),
            ),
            and(
              eq(notificationOutbox.status, "processing"),
              lte(notificationOutbox.lockedAt, staleBefore),
            ),
          ),
        ),
      )
      .orderBy(
        asc(notificationOutbox.nextAttemptAt),
        asc(notificationOutbox.createdAt),
      )
      .limit(limit)
      .for("update", { skipLocked: true });
    if (rows.length === 0) return rows;
    await tx
      .update(notificationOutbox)
      .set({ status: "processing", lockedAt: now, updatedAt: now })
      .where(
        inArray(
          notificationOutbox.id,
          rows.map((row) => row.id),
        ),
      );
    return rows;
  });

  let sent = 0;
  let failed = 0;
  let exhausted = 0;
  for (const row of claimed) {
    const attempt = row.attempts + 1;
    let result: { sent: boolean; ok: boolean };
    try {
      result = await send({
        to: row.recipientAddress,
        subject: row.subject,
        text: row.body,
        idempotencyKey: row.id,
      });
    } catch {
      result = { sent: false, ok: false };
    }
    if (result.ok && result.sent) {
      sent += 1;
      await exec
        .update(notificationOutbox)
        .set({
          status: "sent",
          attempts: attempt,
          lockedAt: null,
          sentAt: now,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(notificationOutbox.id, row.id));
      continue;
    }
    const isExhausted = attempt >= NOTIFICATION_OUTBOX_MAX_ATTEMPTS;
    failed += 1;
    if (isExhausted) exhausted += 1;
    await exec
      .update(notificationOutbox)
      .set({
        status: "failed",
        attempts: attempt,
        lockedAt: null,
        nextAttemptAt: retryAt(attempt, now),
        lastError: result.ok
          ? "Email transport is not configured"
          : "Email transport failed",
        updatedAt: now,
      })
      .where(eq(notificationOutbox.id, row.id));
  }

  return { claimed: claimed.length, sent, failed, exhausted };
}
