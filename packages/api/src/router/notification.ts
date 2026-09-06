import type { TRPCRouterRecord } from "@trpc/server";

import type { DbExec } from "@matops/db";
import type { AnnouncementAudience } from "@matops/domain";
import { and, desc, eq, isNull, sql, withScope } from "@matops/db";
import { notification } from "@matops/db/schema";
import { announcementFanOut, announcementRecipients } from "@matops/domain";
import {
  AnnounceAllSchema,
  AnnounceSchema,
  BranchSelectionSchema,
} from "@matops/validators";

import type { MemberScope } from "../members";
import { rosterOf } from "../members";
import { notifyAnnouncement, notifyAnnouncementAcross } from "../notify";
import { readOrganizationEntities } from "../organization-read";
import {
  memberProcedure,
  organizationManagerIdentityProcedure,
  staffProcedure,
} from "../trpc";

/** The user ids one audience resolves to, using the pure domain rule. */
async function announcementTargets(
  ctx: MemberScope,
  audience: AnnouncementAudience,
): Promise<string[]> {
  const roster = await rosterOf(ctx);
  return announcementRecipients(roster, audience);
}

/**
 * The recipients of one audience at each chosen branch, one scoped read per
 * branch (ADR 124). The branch list comes from the server's own read, so an
 * entity id the caller made up simply matches nothing.
 */
async function recipientsPerBranch(
  ctx: { organizationId: string; baseDb: DbExec },
  input: { audience: AnnouncementAudience; entityIds?: string[] },
): Promise<{ entityId: string; userIds: string[] }[]> {
  const branches = await readOrganizationEntities(
    ctx.organizationId,
    ctx.baseDb,
  );
  const chosen = input.entityIds
    ? branches.filter((b) => input.entityIds?.includes(b.id))
    : branches;

  const perEntity: { entityId: string; userIds: string[] }[] = [];
  for (const branch of chosen) {
    const userIds = await withScope(
      { organizationId: ctx.organizationId, entityId: branch.id },
      (db) => announcementTargets({ academyId: branch.id, db }, input.audience),
      ctx.baseDb,
    );
    perEntity.push({ entityId: branch.id, userIds });
  }
  return perEntity;
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

  /**
   * Post to several branches at once (ADR 127). Owner only, where the
   * per-branch `announce` is staff: an instructor runs one mat, and posting to
   * every branch is not that job.
   *
   * Every branch is read in its OWN scope, one transaction each, exactly as the
   * organization dashboard reads are. No organization-wide query over the
   * tenant tables, and an entity id that is not this gym's is dropped rather
   * than honoured, because the list comes from the server's own read.
   */
  announceAll: organizationManagerIdentityProcedure
    .input(AnnounceAllSchema)
    .mutation(async ({ ctx, input }) => {
      const perEntity = await recipientsPerBranch(ctx, {
        audience: input.audience,
        entityIds: input.entityIds,
      });
      const { rows, push } = announcementFanOut(perEntity);
      if (rows.length === 0) return { ok: true as const, rows: 0, pushed: 0 };

      await notifyAnnouncementAcross(
        {
          rows,
          push,
          title: input.title,
          body: input.body,
          sentBy: ctx.session.user.name,
        },
        ctx.baseDb,
      );
      return { ok: true as const, rows: rows.length, pushed: push.length };
    }),

  /**
   * How many PEOPLE each audience reaches across the chosen branches, counted
   * once each. The button labels itself with this, so nobody posts blind.
   */
  audienceCountsAll: organizationManagerIdentityProcedure
    .input(BranchSelectionSchema.optional())
    .query(async ({ ctx, input }) => {
      const counts = { all: 0, students: 0, staff: 0 };
      for (const audience of ["all", "students", "staff"] as const) {
        const perEntity = await recipientsPerBranch(ctx, {
          audience,
          entityIds: input?.entityIds,
        });
        counts[audience] = announcementFanOut(perEntity).push.length;
      }
      return counts;
    }),
} satisfies TRPCRouterRecord;
