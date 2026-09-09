import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import type { DbReader } from "@matops/db";
import { and, deliverNoticeBatch, desc, eq, isNull, sql } from "@matops/db";
import {
  notification,
  notificationNotice,
  notificationRecipient,
} from "@matops/db/schema";
import { sendEmail } from "@matops/notifications";
import { IdSchema } from "@matops/validators";

import { memberProcedure, staffProcedure } from "../trpc";

const FEED_LIMIT = 50;
const NoticeIdSchema = z.object({ noticeId: IdSchema });

async function requireNotice(db: DbReader, noticeId: string) {
  const [row] = await db
    .select({ id: notificationNotice.id })
    .from(notificationNotice)
    .where(eq(notificationNotice.id, noticeId))
    .limit(1);
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "Notice not found" });
}

/**
 * The notification center (v3.7, spec S13/O12; docs/issues/77). Every message
 * the gym sends is also a row here, so a member can find it again after the push
 * is gone. Reads run on the RLS-scoped `ctx.db` and are further narrowed to the
 * caller's own user id: the academy policy alone would let one member read
 * another's feed.
 *
 * Writes go the other way — `announce` hands the fan-out to `ctx.afterCommit`
 * so the sends happen OUTSIDE the tenant transaction (docs/issues/60), on the
 * base connection, exactly like every other notification.
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

  deliveryIssues: staffProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        noticeId: notificationNotice.id,
        kind: notificationNotice.kind,
        subject: notificationNotice.subject,
        createdAt: notificationNotice.createdAt,
        status: notificationRecipient.status,
      })
      .from(notificationNotice)
      .innerJoin(
        notificationRecipient,
        eq(notificationRecipient.noticeId, notificationNotice.id),
      )
      .where(
        sql`${notificationRecipient.status} in ('pending','failed','unknown','no_email')`,
      )
      .orderBy(desc(notificationNotice.createdAt));
    const notices = new Map<
      string,
      {
        noticeId: string;
        kind: string;
        subject: string;
        createdAt: Date;
        pending: number;
        failed: number;
        unknown: number;
        noEmail: number;
      }
    >();
    for (const row of rows) {
      const item = notices.get(row.noticeId) ?? {
        noticeId: row.noticeId,
        kind: row.kind,
        subject: row.subject,
        createdAt: row.createdAt,
        pending: 0,
        failed: 0,
        unknown: 0,
        noEmail: 0,
      };
      if (row.status === "pending") item.pending += 1;
      if (row.status === "failed") item.failed += 1;
      if (row.status === "unknown") item.unknown += 1;
      if (row.status === "no_email") item.noEmail += 1;
      notices.set(row.noticeId, item);
    }
    return [...notices.values()].slice(0, 50);
  }),

  sendRemaining: staffProcedure
    .input(NoticeIdSchema)
    .mutation(async ({ ctx, input }) => {
      await requireNotice(ctx.db, input.noticeId);
      const delivery = {
        claimed: 0,
        accepted: 0,
        failed: 0,
        unknown: 0,
        noEmail: 0,
        remaining: 0,
      };
      ctx.afterCommit(async (exec) => {
        Object.assign(
          delivery,
          await deliverNoticeBatch(exec, sendEmail, {
            noticeId: input.noticeId,
            mode: "remaining",
          }),
        );
      });
      return { noticeId: input.noticeId, delivery };
    }),

  retryFailed: staffProcedure
    .input(NoticeIdSchema)
    .mutation(async ({ ctx, input }) => {
      await requireNotice(ctx.db, input.noticeId);
      const delivery = {
        claimed: 0,
        accepted: 0,
        failed: 0,
        unknown: 0,
        noEmail: 0,
        remaining: 0,
      };
      ctx.afterCommit(async (exec) => {
        Object.assign(
          delivery,
          await deliverNoticeBatch(exec, sendEmail, {
            noticeId: input.noticeId,
            mode: "failed",
          }),
        );
      });
      return { noticeId: input.noticeId, delivery };
    }),
} satisfies TRPCRouterRecord;
