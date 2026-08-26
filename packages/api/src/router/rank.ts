import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import { and, desc, eq, getMemberIdForUser } from "@matops/db";
import { memberRank, rankPromotion } from "@matops/db/schema";
import { isRankChange, isRankRegression, isValidRank } from "@matops/domain";
import {
  ClearMemberRankSchema,
  MemberActionSchema,
  SetMemberRankSchema,
} from "@matops/validators";

import { nameByUser, requireMember, rosterOf } from "../members";
import { enrolledProcedure, staffProcedure } from "../trpc";

/**
 * Member rank / belts (slice G.2/G.3, spec O4/S7; ADR 41). Rank is a JUDGMENT the
 * coach records — no automation, no progress prediction. Staff (owner or
 * instructor) set/change a member's rank per discipline; the student reads their
 * own ranks + promotion timeline. All reads/writes run on the RLS-scoped `ctx.db`
 * (the rank tables carry `academy_id` policies); member identity (`member.id`) is
 * resolved on the base connection where needed.
 */

export const rankRouter = {
  // ─── Staff: read + set a member's ranks ─────────────────────────────────────

  /**
   * One member's current ranks + promotion history (spec O4). Staff-only. The
   * history is newest-first with the promoting staff member's name resolved.
   */
  forMember: staffProcedure
    .input(MemberActionSchema)
    .query(async ({ ctx, input }) => {
      await requireMember(ctx, input.memberId);
      const ranks = await ctx.db
        .select({
          discipline: memberRank.discipline,
          belt: memberRank.belt,
          stripes: memberRank.stripes,
        })
        .from(memberRank)
        .where(eq(memberRank.memberId, input.memberId));
      const history = await ctx.db
        .select({
          id: rankPromotion.id,
          discipline: rankPromotion.discipline,
          fromBelt: rankPromotion.fromBelt,
          fromStripes: rankPromotion.fromStripes,
          toBelt: rankPromotion.toBelt,
          toStripes: rankPromotion.toStripes,
          promotedBy: rankPromotion.promotedBy,
          promotedAt: rankPromotion.promotedAt,
        })
        .from(rankPromotion)
        .where(eq(rankPromotion.memberId, input.memberId))
        .orderBy(desc(rankPromotion.promotedAt));
      const byUser = nameByUser(await rosterOf(ctx));
      return {
        ranks,
        history: history.map((h) => ({
          ...h,
          promotedByName: byUser.get(h.promotedBy) ?? "Staff",
        })),
      };
    }),

  /**
   * Set (or change) a member's rank in one discipline (spec O4). Validates the
   * belt + stripes against the seeded rank system, refuses a demotion (rank only
   * goes up — `isRankRegression`; a mistake is undone with `clear`, not by
   * lowering), upserts the current rank, and appends a promotion record when the
   * rank actually changed (`isRankChange`) — both writes in the one RLS
   * transaction `ctx.db` already is.
   */
  set: staffProcedure
    .input(SetMemberRankSchema)
    .mutation(async ({ ctx, input }) => {
      await requireMember(ctx, input.memberId);
      if (!isValidRank(input.discipline, input.belt, input.stripes)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That belt or stripe count isn't valid for this discipline.",
        });
      }
      const current = (
        await ctx.db
          .select({ belt: memberRank.belt, stripes: memberRank.stripes })
          .from(memberRank)
          .where(
            and(
              eq(memberRank.memberId, input.memberId),
              eq(memberRank.discipline, input.discipline),
            ),
          )
          .limit(1)
      )[0];

      if (isRankRegression(input.discipline, current ?? null, input)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Rank can only go up. To fix a mistake, clear the rank first, then set it again.",
        });
      }

      if (!isRankChange(current ?? null, input)) {
        return { ok: true as const, changed: false };
      }

      const staffId = ctx.session.user.id;
      await ctx.db
        .insert(memberRank)
        .values({
          academyId: ctx.academyId,
          memberId: input.memberId,
          discipline: input.discipline,
          belt: input.belt,
          stripes: input.stripes,
          updatedBy: staffId,
        })
        .onConflictDoUpdate({
          target: [
            memberRank.academyId,
            memberRank.memberId,
            memberRank.discipline,
          ],
          set: { belt: input.belt, stripes: input.stripes, updatedBy: staffId },
        });
      await ctx.db.insert(rankPromotion).values({
        academyId: ctx.academyId,
        memberId: input.memberId,
        discipline: input.discipline,
        fromBelt: current?.belt ?? null,
        fromStripes: current?.stripes ?? null,
        toBelt: input.belt,
        toStripes: input.stripes,
        promotedBy: staffId,
      });
      return { ok: true as const, changed: true };
    }),

  /** Clear a member's rank in one discipline (spec O4 — a correction). */
  clear: staffProcedure
    .input(ClearMemberRankSchema)
    .mutation(async ({ ctx, input }) => {
      await requireMember(ctx, input.memberId);
      await ctx.db
        .delete(memberRank)
        .where(
          and(
            eq(memberRank.memberId, input.memberId),
            eq(memberRank.discipline, input.discipline),
          ),
        );
      return { ok: true as const };
    }),

  // ─── Student: my own ranks (read-only) ──────────────────────────────────────

  /**
   * The caller's own ranks + promotion timeline for the S7 profile (enrolled,
   * read-only). Only the gym sets rank — this is a read. Empty until a coach
   * sets it.
   */
  mine: enrolledProcedure.query(async ({ ctx }) => {
    const memberId = await getMemberIdForUser(
      ctx.session.user.id,
      ctx.academyId,
      ctx.db,
    );
    if (!memberId) return { ranks: [], history: [] };
    const ranks = await ctx.db
      .select({
        discipline: memberRank.discipline,
        belt: memberRank.belt,
        stripes: memberRank.stripes,
      })
      .from(memberRank)
      .where(eq(memberRank.memberId, memberId));
    const history = await ctx.db
      .select({
        id: rankPromotion.id,
        discipline: rankPromotion.discipline,
        fromBelt: rankPromotion.fromBelt,
        fromStripes: rankPromotion.fromStripes,
        toBelt: rankPromotion.toBelt,
        toStripes: rankPromotion.toStripes,
        promotedAt: rankPromotion.promotedAt,
      })
      .from(rankPromotion)
      .where(eq(rankPromotion.memberId, memberId))
      .orderBy(desc(rankPromotion.promotedAt));
    return { ranks, history };
  }),
} satisfies TRPCRouterRecord;
