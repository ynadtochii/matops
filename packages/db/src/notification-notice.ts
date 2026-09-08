import { randomUUID } from "node:crypto";
import { and, asc, count, eq, inArray, isNull, lt, or } from "drizzle-orm";

import type { DbExec } from "./client";
import type { DbReader, DbWriter } from "./tenant";
import {
  notificationAttempt,
  notificationNotice,
  notificationRecipient,
} from "./notification-notice-schema";

export interface NoticeRecipientInput {
  recipientKey: string;
  userId?: string;
  personId?: string;
  visitId?: string;
  email?: string;
}

export interface CreateNoticeInput {
  academyId: string;
  eventKey: string;
  kind: string;
  subject: string;
  body: string;
  templateVersion: string;
  recipients: NoticeRecipientInput[];
}

export type NoticeEmailSender = (payload: {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}) => Promise<{
  sent: boolean;
  ok: boolean;
  providerId?: string;
  errorCode?: string;
}>;

export type NoticeDeliveryMode = "remaining" | "failed";

export interface NoticeDeliveryResult {
  claimed: number;
  accepted: number;
  failed: number;
  unknown: number;
  noEmail: number;
  remaining: number;
}

const DEFAULT_BATCH_LIMIT = 20;
const MAX_BATCH_LIMIT = 100;
const LEASE_MS = 5 * 60_000;

export async function createNotice(input: CreateNoticeInput, exec: DbWriter) {
  const inserted = await exec
    .insert(notificationNotice)
    .values(input)
    .onConflictDoNothing({
      target: [notificationNotice.academyId, notificationNotice.eventKey],
    })
    .returning({ id: notificationNotice.id });
  const existing =
    inserted[0] ??
    (
      await exec
        .select({ id: notificationNotice.id })
        .from(notificationNotice)
        .where(
          and(
            eq(notificationNotice.academyId, input.academyId),
            eq(notificationNotice.eventKey, input.eventKey),
          ),
        )
        .limit(1)
    )[0];
  if (!existing) throw new Error("Notice could not be created");
  if (input.recipients.length > 0) {
    await exec
      .insert(notificationRecipient)
      .values(
        input.recipients.map((recipient) => ({
          ...recipient,
          noticeId: existing.id,
          academyId: input.academyId,
          status: recipient.email ? "pending" : "no_email",
        })),
      )
      .onConflictDoNothing({
        target: [
          notificationRecipient.noticeId,
          notificationRecipient.recipientKey,
        ],
      });
  }
  const recipients = await exec
    .select()
    .from(notificationRecipient)
    .where(eq(notificationRecipient.noticeId, existing.id))
    .orderBy(asc(notificationRecipient.createdAt));
  return { noticeId: existing.id, recipients };
}

function eligibleStatus(mode: NoticeDeliveryMode) {
  return mode === "remaining"
    ? eq(notificationRecipient.status, "pending")
    : or(
        eq(notificationRecipient.status, "failed"),
        eq(notificationRecipient.status, "unknown"),
      );
}

export async function deliverNoticeBatch(
  exec: DbExec,
  send: NoticeEmailSender,
  options: {
    noticeId: string;
    mode: NoticeDeliveryMode;
    limit?: number;
    now?: Date;
    owner?: string;
  },
): Promise<NoticeDeliveryResult> {
  const now = options.now ?? new Date();
  const owner = options.owner ?? randomUUID();
  const limit = Math.max(
    1,
    Math.min(options.limit ?? DEFAULT_BATCH_LIMIT, MAX_BATCH_LIMIT),
  );
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
  const claimed = await exec.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(notificationRecipient)
      .where(
        and(
          eq(notificationRecipient.noticeId, options.noticeId),
          or(
            eligibleStatus(options.mode),
            and(
              eq(notificationRecipient.status, "processing"),
              eq(notificationRecipient.leaseMode, options.mode),
              or(
                isNull(notificationRecipient.leaseExpiresAt),
                lt(notificationRecipient.leaseExpiresAt, now),
              ),
            ),
          ),
        ),
      )
      .orderBy(asc(notificationRecipient.createdAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (rows.length === 0) return rows;
    await tx
      .update(notificationRecipient)
      .set({
        status: "processing",
        leaseOwner: owner,
        leaseMode: options.mode,
        leaseExpiresAt,
        updatedAt: now,
      })
      .where(
        inArray(
          notificationRecipient.id,
          rows.map((row) => row.id),
        ),
      );
    return rows;
  });

  const notice =
    claimed.length === 0
      ? undefined
      : (
          await exec
            .select({
              academyId: notificationNotice.academyId,
              subject: notificationNotice.subject,
              body: notificationNotice.body,
            })
            .from(notificationNotice)
            .where(eq(notificationNotice.id, options.noticeId))
            .limit(1)
        )[0];
  if (!notice) {
    if (claimed.length > 0) throw new Error("Notice was not found");
    const status = await noticeStatus(exec, options.noticeId);
    return {
      claimed: 0,
      accepted: 0,
      failed: 0,
      unknown: 0,
      noEmail: 0,
      remaining: status.counts.pending,
    };
  }

  let accepted = 0;
  let failed = 0;
  let unknown = 0;
  let noEmail = 0;
  for (const recipient of claimed) {
    if (!recipient.email) {
      noEmail += 1;
      await exec
        .update(notificationRecipient)
        .set({
          status: "no_email",
          leaseOwner: null,
          leaseMode: null,
          leaseExpiresAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(notificationRecipient.id, recipient.id),
            eq(notificationRecipient.leaseOwner, owner),
          ),
        );
      continue;
    }
    const attempts = await exec
      .insert(notificationAttempt)
      .values({
        recipientId: recipient.id,
        academyId: recipient.academyId,
        leaseOwner: owner,
        startedAt: now,
      })
      .returning({ id: notificationAttempt.id });
    const attempt = attempts[0];
    if (!attempt) throw new Error("Delivery attempt could not be created");
    let outcome: "accepted" | "failed" | "unknown";
    let providerId: string | undefined;
    let errorCode: string | undefined;
    try {
      const result = await send({
        to: recipient.email,
        subject: notice.subject,
        text: notice.body,
        idempotencyKey: recipient.id,
      });
      providerId = result.providerId;
      errorCode = result.errorCode;
      outcome = result.ok && result.sent ? "accepted" : "failed";
    } catch {
      outcome = "unknown";
      errorCode = "transport_exception";
    }
    if (outcome === "accepted") accepted += 1;
    if (outcome === "failed") failed += 1;
    if (outcome === "unknown") unknown += 1;
    await exec.transaction(async (tx) => {
      await tx
        .update(notificationAttempt)
        .set({ outcome, providerId, errorCode, finishedAt: now })
        .where(eq(notificationAttempt.id, attempt.id));
      await tx
        .update(notificationRecipient)
        .set({
          status: outcome,
          leaseOwner: null,
          leaseMode: null,
          leaseExpiresAt: null,
          acceptedAt: outcome === "accepted" ? now : null,
          lastAttemptAt: now,
          lastErrorCode: outcome === "accepted" ? null : (errorCode ?? outcome),
          updatedAt: now,
        })
        .where(
          and(
            eq(notificationRecipient.id, recipient.id),
            eq(notificationRecipient.leaseOwner, owner),
          ),
        );
    });
  }

  const status = await noticeStatus(exec, options.noticeId);
  return {
    claimed: claimed.length,
    accepted,
    failed,
    unknown,
    noEmail,
    remaining: status.counts.pending,
  };
}

export async function noticeStatus(exec: DbReader, noticeId: string) {
  const recipients = await exec
    .select()
    .from(notificationRecipient)
    .where(eq(notificationRecipient.noticeId, noticeId))
    .orderBy(asc(notificationRecipient.createdAt));
  const grouped = await exec
    .select({ status: notificationRecipient.status, value: count() })
    .from(notificationRecipient)
    .where(eq(notificationRecipient.noticeId, noticeId))
    .groupBy(notificationRecipient.status);
  const counts = {
    pending: 0,
    processing: 0,
    accepted: 0,
    failed: 0,
    unknown: 0,
    noEmail: 0,
  };
  for (const row of grouped) {
    if (row.status in counts) {
      counts[row.status as keyof typeof counts] = Number(row.value);
    }
  }
  return { noticeId, counts, recipients };
}
