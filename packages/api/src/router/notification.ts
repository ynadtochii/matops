import type { TRPCRouterRecord } from "@trpc/server";

import { and, desc, eq, isNull, sql } from "@matops/db";
import { notification } from "@matops/db/schema";

import { memberProcedure } from "../trpc";

const FEED_LIMIT = 50;

/**
 * The notification center (v3.7, spec S13/O12; docs/issues/77). Every message
 * the gym sends is also a row here, so a member can find it again after the push
 * is gone. Reads run on the RLS-scoped `ctx.db` and are further narrowed to the
 * caller's own user id: the academy policy alone would let one member read
 * another's feed.
 */
export const notificationRouter = {
  /** The caller's feed for this academy, newest first. */
  list: memberProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: notification.id,
        kind: notification.kind,
        title: notification.title,
        body: notification.body,
        link: notification.link,
        sentBy: notification.sentBy,
        createdAt: notification.createdAt,
        readAt: notification.readAt,
      })
      .from(notification)
      .where(eq(notification.userId, ctx.session.user.id))
      .orderBy(desc(notification.createdAt))
      .limit(FEED_LIMIT);
  }),

  /** How many unread rows the caller has — the nav badge. */
  unreadCount: memberProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(notification)
      .where(
        and(
          eq(notification.userId, ctx.session.user.id),
          isNull(notification.readAt),
        ),
      );
    return row?.n ?? 0;
  }),

  /** Mark the caller's whole feed read. Fired when the center is opened. */
  markAllRead: memberProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(notification)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notification.userId, ctx.session.user.id),
          isNull(notification.readAt),
        ),
      );
    return { ok: true as const };
  }),
} satisfies TRPCRouterRecord;
