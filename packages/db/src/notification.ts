import type { NotificationKind } from "@matops/domain";

import type { DbExec } from "./client";
import { notification } from "./notification-schema";

/**
 * Notification-center writes (v3.7, docs/issues/77). These run on the BASE
 * connection (service role, OUTSIDE the tenant seam) because their callers do:
 * `deliver()` in `@matops/api` hands sends to `ctx.afterCommit`, so the tenant
 * transaction is already closed, and both cron sweeps run cross-academy. Reads
 * are the opposite — the router reads through `ctx.db` under the seam, so a
 * member only ever sees their own academy's feed.
 *
 * `academy_id` is always passed explicitly for that reason: nothing here can
 * lean on `app.academy_id` being set.
 */

export interface NewNotification {
  academyId: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** In-app path to open on tap, e.g. "/class/<id>". */
  link?: string;
  /** Display name of the staff member who posted it. Announcements only. */
  sentBy?: string;
}

/** Write one inbox row per recipient. One statement; no-op on an empty list. */
export async function insertNotifications(
  rows: NewNotification[],
  exec: DbExec,
): Promise<number> {
  if (rows.length === 0) return 0;
  const written = await exec
    .insert(notification)
    .values(rows)
    .returning({ id: notification.id });
  return written.length;
}
