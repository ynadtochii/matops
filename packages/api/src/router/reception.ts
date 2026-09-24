import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import type { ReceptionBranch, TenantTx } from "@matops/db";
import type { ReceptionAction } from "@matops/domain";
import {
  and,
  asc,
  eq,
  getReceptionLinkStatus,
  gte,
  isNull,
  like,
  lockReceptionLink,
  lt,
  replaceReceptionLink,
  revokeReceptionLink,
  sql,
} from "@matops/db";
import { classInstance, entityMembership, person } from "@matops/db/schema";
import {
  isBjjAcademy,
  receptionClassAction,
  receptionClasses,
  receptionClassWindow,
  receptionSearchText,
  resolveAcademyTimeZone,
} from "@matops/domain";
import { DropInSchema } from "@matops/validators";

import type { BranchPerson } from "../branch-person";
import {
  countBranchNamesakes,
  eligibleBranchPerson,
  findBranchPerson,
  searchableName,
} from "../branch-person";
import { bookForMember } from "../member-booking";
import { checkInMember } from "../member-checkin";
import { CLASS_NOT_FOUND } from "../messages";
import { receptionProcedure } from "../reception";
import { branchManagerIdentityProcedure } from "../trpc";
import { submitDropIn } from "./dropin";

const HELP_DESK = "Please ask reception for help.";

interface ReceptionBranchCtx {
  academyId: string;
  organizationId: string;
  branch: ReceptionBranch;
}

function branchRule(ctx: ReceptionBranchCtx) {
  return {
    timeZone: resolveAcademyTimeZone(ctx.branch.timeZone),
    bookingWindowDays: ctx.branch.bookingWindowDays,
  };
}

function gatedEntity(ctx: ReceptionBranchCtx) {
  return {
    id: ctx.academyId,
    name: ctx.branch.name,
    membershipEnforcedAt: ctx.branch.membershipEnforcedAt,
  };
}

/**
 * The selected person, re-resolved from the branch's own roster. Two people who
 * share a name are refused rather than guessed at: reception cannot tell them
 * apart either, and the wrong register entry is worse than a short queue. The
 * staff desk has no such rule, because staff pick a row and know who they mean.
 */
async function requirePerson(
  db: TenantTx,
  ctx: ReceptionBranchCtx,
  personId: string,
): Promise<BranchPerson> {
  const subject = await findBranchPerson(db, ctx, personId);
  if (!subject) throw new TRPCError({ code: "FORBIDDEN", message: HELP_DESK });
  if ((await countBranchNamesakes(db, ctx, subject.name)) > 1) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `More than one member has this name. ${HELP_DESK}`,
    });
  }
  return subject;
}

/**
 * A shared screen never explains why somebody was refused. The precise reason
 * is a private matter (unpaid dues, a suspended membership), so it is replaced
 * with one neutral sentence and the desk sorts it out.
 */
async function receptionWrite<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof TRPCError && error.code === "PRECONDITION_FAILED") {
      throw new TRPCError({
        code: error.code,
        message: `We couldn't do that right now. ${HELP_DESK}`,
      });
    }
    throw error;
  }
}

/**
 * The class still offers the action the screen showed. `checkIn` is guarded by
 * the shared check-in window inside the write, but a class that has come inside
 * that window must stop being bookable, or a card loaded an hour ago would
 * reserve a place for somebody standing at the door.
 */
async function requireAction(
  db: TenantTx,
  classId: string,
  now: Date,
  rule: { timeZone: string; bookingWindowDays: number },
  wanted: ReceptionAction,
): Promise<void> {
  const [cls] = await db
    .select({
      id: classInstance.id,
      title: classInstance.title,
      startsAt: classInstance.startsAt,
      durationMinutes: classInstance.durationMinutes,
      status: classInstance.status,
      deletedAt: classInstance.deletedAt,
    })
    .from(classInstance)
    .where(eq(classInstance.id, classId))
    .limit(1);
  if (!cls || cls.deletedAt)
    throw new TRPCError({ code: "NOT_FOUND", message: CLASS_NOT_FOUND });
  if (receptionClassAction(cls, now, rule) !== wanted) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `That class has moved on. ${HELP_DESK}`,
    });
  }
}

/**
 * Reception (ADR 139). Two audiences over one credential model.
 *
 * The four link procedures are the OWNER's: they create, replace and disable
 * the permanent entrance link and never reveal an existing secret. Everything
 * below them runs on the entrance cookie, which names one branch and can do
 * nothing else.
 *
 * The selected person is revalidated on every read and every write. The browser
 * is told which action a class offers, but the server decides it again before
 * writing, so a stale card cannot check somebody into tomorrow.
 */
export const receptionRouter = {
  linkStatus: branchManagerIdentityProcedure.query(async ({ ctx }) => {
    return ctx.withScope((db) => getReceptionLinkStatus(ctx.academyId, db));
  }),

  createLink: branchManagerIdentityProcedure.mutation(async ({ ctx }) => {
    return ctx.withScope(async (db) => {
      await lockReceptionLink(ctx.academyId, db);
      const current = await getReceptionLinkStatus(ctx.academyId, db);
      if (current.enabled) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "This branch already has a reception link. Rotate it to get a new one.",
        });
      }
      return replaceReceptionLink(ctx.academyId, ctx.session.user.id, db);
    });
  }),

  replaceLink: branchManagerIdentityProcedure.mutation(async ({ ctx }) => {
    return ctx.withScope((db) =>
      replaceReceptionLink(ctx.academyId, ctx.session.user.id, db),
    );
  }),

  disableLink: branchManagerIdentityProcedure.mutation(async ({ ctx }) => {
    const revoked = await ctx.withScope((db) =>
      revokeReceptionLink(ctx.academyId, db),
    );
    return { ok: true as const, revoked };
  }),

  /** Who this screen belongs to. No class list: that follows the person. */
  info: receptionProcedure.query(({ ctx }) => ({
    academyId: ctx.academyId,
    name: ctx.branch.name,
    timeZone: ctx.branch.timeZone,
    country: ctx.branch.country,
    visitorsEnabled: isBjjAcademy(ctx.branch.type),
  })),

  search: receptionProcedure
    .input(z.object({ query: z.string().trim().min(2).max(80) }))
    .query(async ({ ctx, input }) => {
      const query = receptionSearchText(input.query);
      if (query.length < 2) return [];
      const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
      const rows = await ctx.withScope((db) =>
        db
          .select({
            id: person.id,
            name: person.name,
            matches: sql<number>`(count(*) over (partition by ${searchableName}))::int`,
          })
          .from(person)
          .innerJoin(entityMembership, eq(entityMembership.personId, person.id))
          .where(
            and(
              eligibleBranchPerson(ctx.academyId, ctx.organizationId),
              like(searchableName, pattern),
            ),
          )
          .orderBy(asc(person.name), asc(person.id))
          .limit(5),
      );
      return rows.map(({ id, name, matches }) => ({
        id,
        name,
        ambiguous: matches > 1,
      }));
    }),

  /**
   * Today's and tomorrow's classes for one selected person. The person is
   * resolved first so an unknown id gets nothing at all, and the cards carry no
   * attendee names, contacts or balances.
   */
  classes: receptionProcedure
    .input(z.object({ personId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const rule = branchRule(ctx);
      const window = receptionClassWindow(now, rule.timeZone);
      return ctx.withScope(async (db) => {
        await requirePerson(db, ctx, input.personId);
        const rows = await db
          .select({
            id: classInstance.id,
            title: classInstance.title,
            startsAt: classInstance.startsAt,
            durationMinutes: classInstance.durationMinutes,
            status: classInstance.status,
            deletedAt: classInstance.deletedAt,
          })
          .from(classInstance)
          .where(
            and(
              isNull(classInstance.deletedAt),
              gte(classInstance.startsAt, window.from),
              lt(classInstance.startsAt, window.to),
            ),
          )
          .orderBy(asc(classInstance.startsAt));
        return receptionClasses(rows, now, rule);
      });
    }),

  checkIn: receptionProcedure
    .input(z.object({ personId: z.uuid(), classId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withScope(async (db) => {
        const subject = await requirePerson(db, ctx, input.personId);
        return receptionWrite(() =>
          checkInMember(db, {
            entity: gatedEntity(ctx),
            organizationId: ctx.organizationId,
            classId: input.classId,
            membership: subject,
            accountUserId: subject.accountUserId,
            source: "reception_self",
          }),
        );
      });
    }),

  /**
   * Reserve a place on a class that has not opened for check-in yet. It is the
   * member booking write with the person named by the screen, so the admission
   * rules, the capacity accounting and the booking window are the ones a member
   * gets on their own phone.
   */
  book: receptionProcedure
    .input(z.object({ personId: z.uuid(), classId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const rule = branchRule(ctx);
      const now = new Date();
      return ctx.withScope(async (db) => {
        const subject = await requirePerson(db, ctx, input.personId);
        await requireAction(db, input.classId, now, rule, "book");
        return receptionWrite(() =>
          bookForMember(db, {
            entity: gatedEntity(ctx),
            membership: subject,
            accountUserId: subject.accountUserId,
            classId: input.classId,
            academyId: ctx.academyId,
            organizationId: ctx.organizationId,
            bookingWindowDays: rule.bookingWindowDays,
            timeZone: rule.timeZone,
          }),
        );
      });
    }),

  submitVisitor: receptionProcedure
    .input(DropInSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.academyId !== ctx.academyId)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Please use this gym's reception form.",
        });
      return submitDropIn({ ...input, academyId: ctx.academyId }, ctx.baseDb);
    }),
} satisfies TRPCRouterRecord;
