import type { DbExec } from "@matops/db";
import type { NotificationKind, PushMessage } from "@matops/domain";
import type { BatchPush } from "@matops/notifications";
import {
  getAcademyPublic,
  getPushTargets,
  insertNotifications,
} from "@matops/db";
import {
  buildApprovalMessage,
  buildCancelledMessage,
  buildClassChangeMessage,
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

type PushSender = (messages: BatchPush[]) => Promise<unknown>;

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
  writeInbox = true,
): Promise<void> {
  if (items.length === 0) return;
  if (writeInbox) {
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

interface ClassEventInput {
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
    sendPush,
    false,
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
    sendPush,
    false,
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
