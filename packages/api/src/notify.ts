import type { ClaimRemindersOptions, DbExec } from "@matops/db";
import type { NotificationKind, PushMessage } from "@matops/domain";
import type { BatchPush } from "@matops/notifications";
import {
  claimDueDuesReminders,
  claimDueReminderClasses,
  getAcademyPublic,
  getPushTargets,
  insertNotifications,
} from "@matops/db";
import {
  buildAnnouncementMessage,
  buildApprovalMessage,
  buildCancelledMessage,
  buildClassChangeMessage,
  buildDuesReminderMessage,
  buildReminderMessage,
  formatMoney,
  formatWhen,
} from "@matops/domain";
import { sendPush } from "@matops/notifications";

/**
 * API-side notification helpers (Phase 4, docs/issues/17, 34). Routers gather
 * the affected student ids under the tenant seam, then call one of these. Each
 * resolves the academy name + the recipients' push tokens on the BASE
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

export type PushSender = (messages: BatchPush[]) => Promise<unknown>;

interface Delivery {
  academyId: string;
  kind: NotificationKind;
  push: PushMessage;
  data?: Record<string, unknown>;
  /** In-app path the inbox row opens on tap; the feed row is flat without it. */
  link?: string;
  /** Display name of the staff member who posted it. Announcements only. */
  sentBy?: string;
}

/** One recipient plus the message only they get. The unit `deliver` works in. */
type PersonalDelivery = Delivery & { userId: string };

/** The same message addressed to each of `userIds`. */
function each(userIds: string[], msg: Delivery): PersonalDelivery[] {
  return userIds.map((userId) => ({ ...msg, userId }));
}

/**
 * Resolve targets, write the inbox rows, and fan the built messages out over
 * push. Never throws.
 *
 * Per-recipient throughout, because the two shapes are the same job: a cancelled
 * class is one message to thirty people, a dues sweep is thirty messages to
 * thirty people, and both come down to one addressed list.
 *
 * The inbox write is the first thing that happens and is deliberately NOT
 * conditional on the send: the notification center is the durable copy, so a
 * dead Expo token must not cost the member the message.
 */
async function deliver(
  items: PersonalDelivery[],
  exec: DbExec,
  send: PushSender = sendPush,
): Promise<void> {
  if (items.length === 0) return;
  try {
    await insertNotifications(
      items.map((m) => ({
        academyId: m.academyId,
        userId: m.userId,
        kind: m.kind,
        title: m.push.title,
        body: m.push.body,
        link: m.link,
        sentBy: m.sentBy,
      })),
      exec,
    );
  } catch (err) {
    console.error("[notify] inbox write failed", err);
  }
  try {
    const byUser = new Map(
      (
        await getPushTargets(
          items.map((m) => m.userId),
          exec,
        )
      ).map((t) => [t.userId, t]),
    );
    await send(
      items.flatMap((m) =>
        (byUser.get(m.userId)?.tokens ?? []).map((to) => ({
          to,
          ...m.push,
          data: m.data,
        })),
      ),
    );
  } catch (err) {
    console.error("[notify] delivery failed", err);
  }
}

/** The gym's display name, or a neutral fallback. Never throws. */
async function academyName(academyId: string, exec: DbExec): Promise<string> {
  try {
    const academy = await getAcademyPublic(academyId, exec);
    return academy?.name ?? "your gym";
  } catch (err) {
    console.error("[notify] academy lookup failed", err);
    return "your gym";
  }
}

export interface MembershipDueInput {
  /** Where the message is filed. ONE branch, never one per covered branch. */
  academyId: string;
  userId: string;
  headline: string;
  detail: string;
}

/**
 * A membership month is unpaid and the clock is running (ADR 126).
 *
 * One message per MEMBERSHIP, filed against a single branch, even when the plan
 * covers three. Somebody who owes one payment must not get three warnings about
 * it, so the caller picks the branch and this never fans out.
 *
 * The wording arrives already built, from `membershipWarning` in the domain, so
 * the push, the notification centre, the web and the app all say the same
 * sentence about the same situation.
 */
export async function notifyMembershipDue(
  items: MembershipDueInput[],
  exec: DbExec,
  send?: PushSender,
): Promise<void> {
  await deliver(
    items.map((m) => ({
      academyId: m.academyId,
      userId: m.userId,
      kind: "membership_due" as const,
      push: { title: m.headline, body: m.detail },
      data: { type: "membership" },
      link: "/payments",
    })),
    exec,
    send,
  );
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

/** Class cancelled → push every booked student (highest stakes, §4). */
export async function notifyClassCancelled(
  input: ClassEventInput,
  exec: DbExec,
): Promise<void> {
  const push = buildCancelledMessage({
    academyName: await academyName(input.academyId, exec),
    className: input.className,
    whenLabel: formatWhen(input.startsAt, input.timeZone),
  });
  await deliver(
    each(input.studentIds, {
      academyId: input.academyId,
      kind: "class_cancelled",
      push,
      data: { type: "class", classId: input.classId },
      link: `/class/${input.classId}`,
    }),
    exec,
  );
}

/** Class time/instructor changed → push booked students (§4). */
export async function notifyClassChanged(
  input: ClassEventInput,
  exec: DbExec,
): Promise<void> {
  const push = buildClassChangeMessage({
    academyName: await academyName(input.academyId, exec),
    className: input.className,
    whenLabel: formatWhen(input.startsAt, input.timeZone),
  });
  await deliver(
    each(input.studentIds, {
      academyId: input.academyId,
      kind: "class_changed",
      push,
      data: { type: "class", classId: input.classId },
      link: `/class/${input.classId}`,
    }),
    exec,
  );
}

/** Membership approved → welcome push to the newly approved member (push only). */
export async function notifyMembershipApproved(
  input: {
    academyId: string;
    userId: string;
  },
  exec: DbExec,
): Promise<void> {
  const push = buildApprovalMessage({
    academyName: await academyName(input.academyId, exec),
  });
  await deliver(
    each([input.userId], {
      academyId: input.academyId,
      kind: "membership_approved",
      push,
      data: { type: "approved" },
      link: "/",
    }),
    exec,
  );
}

/**
 * Owner-written gym news (v3.7, spec O12; docs/issues/77). Lands in the inbox
 * and pushes.
 */
export async function notifyAnnouncement(
  input: {
    academyId: string;
    userIds: string[];
    title: string;
    body: string;
    sentBy: string;
  },
  exec: DbExec,
): Promise<void> {
  await deliver(
    each(input.userIds, {
      academyId: input.academyId,
      kind: "announcement",
      push: buildAnnouncementMessage({
        title: input.title,
        body: input.body,
      }),
      data: { type: "announcement" },
      sentBy: input.sentBy,
    }),
    exec,
  );
}

/**
 * One announcement across several branches (ADR 127).
 *
 * NOT through `deliver`, which pushes once per row: the inbox copy is per
 * branch, because the feed is per branch, while the push is per person, because
 * one message must buzz one phone once. The caller decides both lists with the
 * pure `announcementFanOut`.
 *
 * Both halves swallow their own errors, end to end, like every other function
 * here: an announcement must never fail the mutation that sent it.
 */
export async function notifyAnnouncementAcross(
  input: {
    rows: { entityId: string; userId: string }[];
    push: string[];
    title: string;
    body: string;
    sentBy: string;
  },
  exec: DbExec,
  send: PushSender = sendPush,
): Promise<void> {
  if (input.rows.length === 0) return;
  const message = buildAnnouncementMessage({
    title: input.title,
    body: input.body,
  });
  try {
    await insertNotifications(
      input.rows.map((r) => ({
        academyId: r.entityId,
        userId: r.userId,
        kind: "announcement" as const,
        title: message.title,
        body: message.body,
        sentBy: input.sentBy,
      })),
      exec,
    );
  } catch (err) {
    console.error("[notify] inbox write failed", err);
  }
  try {
    const targets = await getPushTargets(input.push, exec);
    await send(
      targets.flatMap((t) =>
        t.tokens.map((to) => ({
          to,
          ...message,
          data: { type: "announcement" },
        })),
      ),
    );
  } catch (err) {
    console.error("[notify] delivery failed", err);
  }
}

export interface SweepOptions extends ClaimRemindersOptions {
  send?: PushSender;
}

/**
 * Class-reminder sweep (Phase 4, docs/issues/17). The cron route calls this: it
 * claims every due class on the base connection (idempotent, concurrency-safe),
 * then pushes each class's booked students. Code ships in Phase 4; the frequent
 * cron SCHEDULE is deferred to Phase 5 (needs a sub-daily cron). Runs OUTSIDE the
 * tenant seam like the materialization sweep. Returns run counts for the route.
 */
export async function runReminderSweep(
  exec: DbExec,
  opts: SweepOptions = {},
): Promise<{
  processed: number;
  sent: number;
  duesProcessed: number;
  duesSent: number;
}> {
  const claimed = await claimDueReminderClasses({
    now: opts.now,
    leadMinutes: opts.leadMinutes,
    limit: opts.limit,
    exec,
  });
  // Claiming already stamped these rows, so a claimed-but-unsent reminder is
  // lost for good. Send the batch concurrently rather than one HTTP round trip
  // at a time, so the run finishes inside the serverless limit.
  await Promise.all(
    claimed.map((c) =>
      deliver(
        each(c.studentIds, {
          academyId: c.academyId,
          kind: "class_reminder",
          push: buildReminderMessage({
            className: c.title,
            whenLabel: formatWhen(c.startsAt, c.timeZone ?? undefined),
          }),
          data: { type: "class", classId: c.classId },
          link: `/class/${c.classId}`,
        }),
        exec,
        opts.send,
      ),
    ),
  );
  const sent = claimed.length;
  const dues = await sweepDuesReminders(exec, opts);
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
 * connection), then pushes them via the existing transport. Rides the
 * DAILY cron; the frequent cadence stays a Phase-5 concern. Never throws (each
 * `deliver` swallows its own errors).
 */
export async function sweepDuesReminders(
  exec: DbExec,
  opts: SweepOptions = {},
): Promise<{ processed: number; sent: number }> {
  const claimed = await claimDueDuesReminders({
    now: opts.now,
    limit: opts.limit,
    exec,
  });
  // Same as the class sweep: the period stamp is already written, so every
  // claimed member has to be attempted in this run.
  await deliver(
    claimed.map((d) => {
      const push = buildDuesReminderMessage({
        academyName: d.academyName,
        amountLabel: formatMoney(d.priceMinor, d.currency),
        dueLabel: formatDueLabel(d.nextDueAt),
        overdue: d.overdue,
      });
      return {
        academyId: d.academyId,
        userId: d.userId,
        kind: "dues_reminder" as const,
        push,
        data: { type: "dues" },
        link: "/payments",
      };
    }),
    exec,
    opts.send,
  );
  return { processed: claimed.length, sent: claimed.length };
}
