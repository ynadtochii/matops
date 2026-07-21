import type { ClaimRemindersOptions } from "@matops/db";
import type { EmailMessage, PushMessage } from "@matops/domain";
import {
  claimDueReminderClasses,
  getAcademyPublic,
  getPushTargets,
} from "@matops/db";
import {
  buildApprovalMessage,
  buildCancelledMessage,
  buildClassChangeMessage,
  buildReminderMessage,
  formatWhen,
} from "@matops/domain";
import { sendEmail, sendPush } from "@matops/notifications";

/**
 * API-side notification helpers (Phase 4, docs/issues/17, 34). Routers gather
 * the affected student ids under the tenant seam, then call one of these. Each
 * resolves the academy name + the recipients' tokens/emails on the BASE
 * connection (push tokens are user-global, outside RLS — docs/issues/34), builds
 * the message text with the pure domain builders, and sends.
 *
 * Every function swallows its own errors: a notification must NEVER fail the
 * mutation that triggered it. Sends are awaited so they complete before the
 * serverless response returns (the runtime may freeze after the response).
 */

interface Delivery {
  push: PushMessage;
  email?: EmailMessage;
  data?: Record<string, unknown>;
}

/** Resolve targets + fan a built message out over push (+ email). Never throws. */
async function deliver(studentIds: string[], msg: Delivery): Promise<void> {
  if (studentIds.length === 0) return;
  try {
    const targets = await getPushTargets(studentIds);
    const tokens = targets.flatMap((t) => t.tokens);
    await sendPush(tokens, { ...msg.push, data: msg.data });
    if (msg.email) {
      const emails = targets.map((t) => t.email).filter((e) => e.length > 0);
      if (emails.length > 0) await sendEmail({ to: emails, ...msg.email });
    }
  } catch (err) {
    console.error("[notify] delivery failed", err);
  }
}

async function academyName(academyId: string): Promise<string> {
  const academy = await getAcademyPublic(academyId);
  return academy?.name ?? "your gym";
}

export interface ClassEventInput {
  academyId: string;
  className: string;
  startsAt: Date;
  /** IANA zone for the local time label; UTC when the class carries none. */
  timeZone?: string;
  classId: string;
  studentIds: string[];
}

/** Class cancelled → push + email every booked student (highest stakes, §4). */
export async function notifyClassCancelled(input: ClassEventInput): Promise<void> {
  const msg = buildCancelledMessage({
    academyName: await academyName(input.academyId),
    className: input.className,
    whenLabel: formatWhen(input.startsAt, input.timeZone),
  });
  await deliver(input.studentIds, {
    push: msg.push,
    email: msg.email,
    data: { type: "class", classId: input.classId },
  });
}

/** Class time/instructor changed → push + email booked students (§4). */
export async function notifyClassChanged(input: ClassEventInput): Promise<void> {
  const msg = buildClassChangeMessage({
    academyName: await academyName(input.academyId),
    className: input.className,
    whenLabel: formatWhen(input.startsAt, input.timeZone),
  });
  await deliver(input.studentIds, {
    push: msg.push,
    email: msg.email,
    data: { type: "class", classId: input.classId },
  });
}

/** Membership approved → welcome push to the newly approved member (push only). */
export async function notifyMembershipApproved(input: {
  academyId: string;
  userId: string;
}): Promise<void> {
  const push = buildApprovalMessage({
    academyName: await academyName(input.academyId),
  });
  await deliver([input.userId], { push, data: { type: "approved" } });
}

/**
 * Class-reminder sweep (Phase 4, docs/issues/17). The cron route calls this: it
 * claims every due class on the base connection (idempotent, concurrency-safe),
 * then pushes each class's booked students. Code ships in Phase 4; the frequent
 * cron SCHEDULE is deferred to Phase 5 (needs a sub-daily cron). Runs OUTSIDE the
 * tenant seam like the materialization sweep. Returns run counts for the route.
 */
export async function runReminderSweep(
  opts: ClaimRemindersOptions = {},
): Promise<{ processed: number; sent: number }> {
  const claimed = await claimDueReminderClasses(opts);
  let sent = 0;
  for (const c of claimed) {
    const push = buildReminderMessage({
      className: c.title,
      whenLabel: formatWhen(c.startsAt, c.timeZone ?? undefined),
    });
    await deliver(c.studentIds, {
      push,
      data: { type: "class", classId: c.classId },
    });
    sent += 1;
  }
  return { processed: claimed.length, sent };
}
