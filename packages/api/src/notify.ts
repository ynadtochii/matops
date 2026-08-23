import type { ClaimRemindersOptions } from "@matops/db";
import type { NotificationKind, PushMessage } from "@matops/domain";
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
async function deliver(items: PersonalDelivery[]): Promise<void> {
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
    );
  } catch (err) {
    console.error("[notify] inbox write failed", err);
  }
  try {
    const byUser = new Map(
      (await getPushTargets(items.map((m) => m.userId))).map((t) => [
        t.userId,
        t,
      ]),
    );
    await sendPush(
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

/** Class cancelled → push every booked student (highest stakes, §4). */
export async function notifyClassCancelled(
  input: ClassEventInput,
): Promise<void> {
  const push = buildCancelledMessage({
    academyName: await academyName(input.academyId),
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
  );
}

/** Class time/instructor changed → push booked students (§4). */
export async function notifyClassChanged(
  input: ClassEventInput,
): Promise<void> {
  const push = buildClassChangeMessage({
    academyName: await academyName(input.academyId),
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
  );
}

/** Membership approved → welcome push to the newly approved member (push only). */
export async function notifyMembershipApproved(input: {
  academyId: string;
  userId: string;
}): Promise<void> {
  const push = buildApprovalMessage({
    academyName: await academyName(input.academyId),
  });
  await deliver(
    each([input.userId], {
      academyId: input.academyId,
      kind: "membership_approved",
      push,
      data: { type: "approved" },
      link: "/",
    }),
  );
}

/**
 * Owner-written gym news (v3.7, spec O12; docs/issues/77). Lands in the inbox
 * and pushes.
 */
export async function notifyAnnouncement(input: {
  academyId: string;
  userIds: string[];
  title: string;
  body: string;
  sentBy: string;
}): Promise<void> {
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
  );
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
      ),
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
 * connection), then pushes them via the existing transport. Rides the
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
  // claimed member has to be attempted in this run.
  await deliver(
    claimed.map((d) => {
      const push = buildDuesReminderMessage({
        academyName: d.academyName,
        amountLabel: `${d.currency} ${(d.priceMinor / 100).toFixed(2)}`,
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
  );
  return { processed: claimed.length, sent: claimed.length };
}
