import type { TRPCRouterRecord } from "@trpc/server";

import type { AnnouncementAudience } from "@matops/domain";
import { and, desc, eq, isNull, sql } from "@matops/db";
import { notification } from "@matops/db/schema";
import { announcementRecipients } from "@matops/domain";
import { AnnounceSchema } from "@matops/validators";

import type { MemberScope } from "../members";
import { rosterOf } from "../members";
import { notifyAnnouncement } from "../notify";
import { memberProcedure, staffProcedure } from "../trpc";

/** The user ids one audience resolves to, using the pure domain rule. */
async function announcementTargets(
  ctx: MemberScope,
  audience: AnnouncementAudience,
): Promise<string[]> {
  const roster = await rosterOf(ctx);
  return announcementRecipients(roster, audience);
}

const FEED_LIMIT = 50;

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

  /**
   * How many people each audience reaches right now (staff only). The compose
   * form labels its button with this, so nobody posts blind.
   */
  audienceCounts: staffProcedure.query(async ({ ctx }) => {
    const roster = await rosterOf(ctx);
    return {
      all: announcementRecipients(roster, "all").length,
      students: announcementRecipients(roster, "students").length,
      staff: announcementRecipients(roster, "staff").length,
    };
  }),

  /** Post gym news to an audience (owner or instructor, spec O12). */
  announce: staffProcedure
    .input(AnnounceSchema)
    .mutation(async ({ ctx, input }) => {
      const recipients = await announcementTargets(ctx, input.audience);
      if (recipients.length === 0) return { ok: true as const, sent: 0 };
      ctx.afterCommit((exec) =>
        notifyAnnouncement(
          {
            academyId: ctx.academyId,
            userIds: recipients,
            title: input.title,
            body: input.body,
            sentBy: ctx.session.user.name,
          },
          exec,
        ),
      );
      return { ok: true as const, sent: recipients.length };
    }),
} satisfies TRPCRouterRecord;
