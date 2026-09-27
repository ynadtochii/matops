import type { TRPCRouterRecord } from "@trpc/server";

import { desc, eq } from "@matops/db";
import { memberNote, user } from "@matops/db/schema";
import {
  AddMemberNoteSchema,
  MemberActionSchema,
  NoteIdSchema,
} from "@matops/validators";

import { requireMember } from "../members";
import { staffProcedure } from "../trpc";

/**
 * Staff-private notes about a member (slice G.4, spec O4; ADR 41) — coaching
 * memory (injuries, goals, readiness). Staff-only on EVERY procedure and NEVER
 * read by a student-facing route, so a member never sees these. All on the
 * RLS-scoped `ctx.db` (the note table carries an `academy_id` policy), so every
 * staff member of the academy shares the same notes.
 */

// ponytail: newest 200 notes for one member. The screen is a scroll of coaching
// memory, not an archive; paginate if a coach ever hits it.
const NOTES_LIMIT = 200;

export const noteRouter = {
  /** One member's staff notes, newest first, with the author's name (spec O4). */
  forMember: staffProcedure
    .input(MemberActionSchema)
    .query(async ({ ctx, input }) => {
      const member = await requireMember(ctx, input.memberId);
      const rows = await ctx.db
        .select({
          id: memberNote.id,
          body: memberNote.body,
          authorId: memberNote.authorId,
          authorName: user.name,
          createdAt: memberNote.createdAt,
        })
        .from(memberNote)
        .leftJoin(user, eq(user.id, memberNote.authorId))
        .where(eq(memberNote.memberId, input.memberId))
        .orderBy(desc(memberNote.createdAt))
        .limit(NOTES_LIMIT);
      return rows.map(({ authorId, ...note }) => ({
        ...note,
        fromSignup: authorId === member.accountUserId,
      }));
    }),

  /** Add a staff note about a member (spec O4). */
  add: staffProcedure
    .input(AddMemberNoteSchema)
    .mutation(async ({ ctx, input }) => {
      await requireMember(ctx, input.memberId);
      await ctx.db.insert(memberNote).values({
        academyId: ctx.academyId,
        memberId: input.memberId,
        body: input.body,
        authorId: ctx.session.user.id,
      });
      return { ok: true as const };
    }),

  /** Delete a staff note (any staff at the academy — RLS scopes it). */
  remove: staffProcedure
    .input(NoteIdSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(memberNote).where(eq(memberNote.id, input.noteId));
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
