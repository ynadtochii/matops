import type { ClaimRemindersOptions } from "@matops/db";
import type { EmailMessage, PushMessage } from "@matops/domain";
import {
  claimDueDuesReminders,
  claimDueReminderClasses,
  getAcademyPublic,
  getPushTargets,
} from "@matops/db";
import {
  buildApprovalMessage,
  buildCancelledMessage,
  buildClassChangeMessage,
  buildDuesReminderMessage,
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
 * Every function swallows its own errors, END TO END: a notification must NEVER
 * fail the mutation that triggered it, so the academy-name lookup sits inside
 * the same try as the send. Sends are awaited so they complete before the
 * serverless response returns (the runtime may freeze after the response), but
 * routers hand them to `ctx.afterCommit` so they run OUTSIDE the tenant
 * transaction rather than holding a pooled connection open (docs/issues/60).
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
    const email = msg.email;
    if (email) {
      const emails = targets.map((t) => t.email).filter((e) => e.length > 0);
      // ONE send per recipient. Putting the whole class in a single `to:` shows
      // every booked student every other student's address (spec S4 privacy).
      await Promise.all(emails.map((to) => sendEmail({ to, ...email })));
    }
  } catch (err) {
    console.error("[notify] delivery failed", err);
  }
}

/** The gym's display name, or a neutral fallback. Never throws. */
async function academyName(academyId: string): Promise<string> {
  try {
    const academy = await getAcademyPublic(academyId);
    return academy?.name ?? "your gym";
  } catch (err) {
    console.error("[notify] academy lookup failed", err);
    return "your gym";
  }
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
export async function notifyClassCancelled(
  input: ClassEventInput,
): Promise<void> {
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
export async function notifyClassChanged(
  input: ClassEventInput,
): Promise<void> {
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
): Promise<{
  processed: number;
  sent: number;
  duesProcessed: number;
  duesSent: number;
}> {
  const claimed = await claimDueReminderClasses(opts);
  // Claiming already stamped these rows, so a claimed-but-unsent reminder is
  // lost for good. Send the batch concurrently rather than one HTTP round trip
  // at a time, so the run finishes inside the serverless limit.
  await Promise.all(
    claimed.map((c) =>
      deliver(c.studentIds, {
        push: buildReminderMessage({
          className: c.title,
          whenLabel: formatWhen(c.startsAt, c.timeZone ?? undefined),
        }),
        data: { type: "class", classId: c.classId },
      }),
    ),
  );
  const sent = claimed.length;
  const dues = await sweepDuesReminders(opts);
  return {
    processed: claimed.length,
    sent,
    duesProcessed: dues.processed,
    duesSent: dues.sent,
  };
}

/** Short due-date label for a dues reminder, e.g. "10 Aug" (UTC calendar day). */
function formatDueLabel(nextDueAt: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(nextDueAt);
}

/**
 * Dues-reminder sweep (v1.3, R.1 — docs/issues/40). Claims each member who is due
 * soon or overdue and not yet reminded this period (one per period, base
 * connection), then pushes + emails them via the existing transport. Rides the
 * DAILY cron; the frequent cadence stays a Phase-5 concern. Never throws (each
 * `deliver` swallows its own errors).
 */
async function sweepDuesReminders(
  opts: ClaimRemindersOptions = {},
): Promise<{ processed: number; sent: number }> {
  const claimed = await claimDueDuesReminders({
    now: opts.now,
    limit: opts.limit,
  });
  // Same as the class sweep: the period stamp is already written, so every
  // claimed member has to be attempted in this run. Serial sends would need
  // three round trips per member and time out long before 500 of them.
  await Promise.all(
    claimed.map((d) => {
      const msg = buildDuesReminderMessage({
        academyName: d.academyName,
        amountLabel: `${d.currency} ${(d.priceMinor / 100).toFixed(2)}`,
        dueLabel: formatDueLabel(d.nextDueAt),
        overdue: d.overdue,
      });
      return deliver([d.userId], {
        push: msg.push,
        email: msg.email,
        data: { type: "dues" },
      });
    }),
  );
  return { processed: claimed.length, sent: claimed.length };
}
