import { randomBytes } from "node:crypto";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import {
  and,
  bookVisitor,
  createDropIn,
  createPendingMembership,
  desc,
  eq,
  getAcademyMembership,
  getAcademyPublic,
  listAcademyClassesInWindow,
  ne,
  resolveAccountByEmail,
  sql,
} from "@matops/db";
import { dropIn } from "@matops/db/schema";
import {
  approveMembership,
  canPromoteLead,
  canSubmitDropIn,
  CODE_JOIN_ROLE,
  isBjjAcademy,
  normalizePhone,
  PROMOTE_REFUSAL_REASON,
  visitorClassChoices,
  visitorFetchWindow,
} from "@matops/domain";
import {
  AcademyPublicSchema,
  DropInSchema,
  LeadIdSchema,
  LinkLeadSchema,
  PromoteLeadSchema,
  SetLeadEmailSchema,
  SetLeadStageSchema,
} from "@matops/validators";

import { activateMember, requireMembership } from "../members";
import {
  ownerIdentityProcedure,
  ownerProcedure,
  publicProcedure,
  rateLimited,
} from "../trpc";

const LEAD_GONE = "That lead is no longer in your list";

/**
 * The classes a visitor at the gym QR may pick: the ones they can check into
 * now, and the ones they could book instead. Both the page and the submit call
 * it, so what the form offers and what the write accepts cannot drift.
 */
async function visitorChoices(
  academyId: string,
  exec: Parameters<typeof listAcademyClassesInWindow>[3],
  now: Date,
) {
  const window = visitorFetchWindow(now);
  const classes = await listAcademyClassesInWindow(
    academyId,
    window.from.getTime(),
    window.to.getTime(),
    exec,
  );
  return visitorClassChoices(classes, now);
}

// Correlated subqueries, so the table names are spelled out: drizzle renders a
// column reference inside a raw template unqualified, which is ambiguous the
// moment the same column name exists on both sides of the correlation.
const presentVisits = sql<number>`(
  select count(*)::int from "drop_in_visit" v
  where v.drop_in_id = "drop_in".id and v.attendance_status = 'present'
)`;

const lastVisitAt = sql<Date | null>`(
  select max(v.attended_at) from "drop_in_visit" v
  where v.drop_in_id = "drop_in".id and v.attendance_status = 'present'
)`;

const nextBookingAt = sql<Date | null>`(
  select min(c.starts_at) from "drop_in_visit" v
  join "class" c on c.id = v.class_id
  where v.drop_in_id = "drop_in".id
    and v.booking_status = 'booked'
    and c.status = 'scheduled'
    and c.deleted_at is null
    and c.starts_at >= now()
)`;

/**
 * Public drop-in / lead capture (slice 3.5, spec O4/§4; docs/issues/25). The
 * `submit` + `academyInfo` procedures are PUBLIC (unauthenticated) — the one
 * enumerated exception to the tenant seam (docs/issues/12): a no-app visitor
 * scans the gym QR and fills a short form. Writes run on the trusted base
 * connection via `@matops/db` helpers, each pinned to the validated academy id.
 * Owner reads (`list`) go through the RLS-scoped `ctx.db`.
 */
/**
 * The wall poster is a BJJ thing (ADR 126). A general space has no visitor path
 * in this release, so it answers 404 rather than half-supporting one: a visitor
 * row carries no membership, and a strict room letting in somebody nothing
 * counts is exactly the over-booking capacity exists to stop.
 */
function requireVisitorBranch<T extends { type: string }>(
  academy: T | null,
): T {
  if (!academy || !isBjjAcademy(academy.type)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Gym not found" });
  }
  return academy;
}

export const dropInRouter = {
  /**
   * The public drop-in page header, plus the classes to offer. 404 if the id is
   * unknown. Only id, title and start go out: a visitor picking a class has no
   * business knowing who teaches it or how full it is.
   */
  academyInfo: publicProcedure
    .use(rateLimited(30, 60_000))
    .input(AcademyPublicSchema)
    .query(async ({ ctx, input }) => {
      const academy = requireVisitorBranch(
        await getAcademyPublic(input.academyId, ctx.baseDb),
      );
      const choices = await visitorChoices(
        input.academyId,
        ctx.baseDb,
        new Date(),
      );
      const pick = (c: { id: string; title: string; startsAt: Date }) => ({
        id: c.id,
        title: c.title,
        startsAt: c.startsAt,
      });
      return {
        name: academy.name,
        timeZone: academy.timeZone,
        country: academy.country,
        classesNow: choices.now.map(pick),
        classesUpcoming: choices.upcoming.map(pick),
      };
    }),

  /**
   * Record a drop-in: a lead, plus the class they came for. Consent is required
   * (validator + `canSubmitDropIn`). Deduped by phone, so a repeat visitor bumps
   * their visit count.
   *
   * The class the visitor picked decides what is written. One that is on now
   * means they are standing in the room, so it is an attendance. One that is
   * later is a booking they can still be marked absent against. Picking nothing
   * is still a lead: someone who walks in to ask about the gym is worth keeping
   * even though they attended nothing.
   *
   * The pick is re-checked here against a freshly resolved list rather than
   * trusted, so a stale page cannot attach a visitor to a class that has since
   * ended, been cancelled, or belongs to another gym.
   */
  submit: publicProcedure
    .use(rateLimited(5, 10 * 60_000))
    .input(DropInSchema)
    .mutation(async ({ ctx, input }) => {
      requireVisitorBranch(await getAcademyPublic(input.academyId, ctx.baseDb));
      const gate = canSubmitDropIn(input);
      if (!gate.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            gate.reason === "no-consent"
              ? "Please tick the consent box to continue"
              : "Please enter your name, phone number and email",
        });
      }

      const now = new Date();
      const choices = await visitorChoices(input.academyId, ctx.baseDb, now);

      let attend = choices.now.find((c) => c.id === input.classId) ?? null;
      const book = attend
        ? null
        : (choices.upcoming.find((c) => c.id === input.classId) ?? null);
      if (input.classId && !attend && !book) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "That class is no longer open. Please pick another.",
        });
      }
      // No pick and exactly one class on: they can only be here for that one.
      if (!input.classId && choices.now.length === 1) {
        attend = choices.now[0] ?? null;
      }

      const lead = {
        academyId: input.academyId,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: normalizePhone(input.phone),
        email: input.email,
        consent: input.consent,
        source: "wall_qr" as const,
      };
      const { visitCount } = book
        ? await bookVisitor(
            {
              ...lead,
              classId: book.id,
              cancelToken: randomBytes(24).toString("base64url"),
            },
            ctx.baseDb,
          )
        : await createDropIn(
            { ...lead, classId: attend?.id ?? null },
            ctx.baseDb,
          );

      return {
        ok: true as const,
        firstVisit: visitCount <= 1,
        booked: book !== null,
        classTitle: (book ?? attend)?.title ?? null,
      };
    }),

  /**
   * The lead pipeline for the active academy (spec O4). Owner-only, RLS-scoped.
   * Stage is stored; activity is derived from `drop_in_visit` on every read, so
   * the two can never disagree.
   */
  list: ownerProcedure.query(({ ctx }) => {
    return ctx.db
      .select({
        id: dropIn.id,
        firstName: dropIn.firstName,
        lastName: dropIn.lastName,
        phone: dropIn.phone,
        email: dropIn.email,
        consent: dropIn.consent,
        stage: dropIn.stage,
        source: dropIn.source,
        contactedAt: dropIn.contactedAt,
        convertedUserId: dropIn.convertedUserId,
        visitCount: presentVisits,
        lastVisitAt,
        nextBookingAt,
        createdAt: dropIn.createdAt,
        lastSeenAt: dropIn.lastVisitAt,
      })
      .from(dropIn)
      .orderBy(desc(dropIn.lastVisitAt));
  }),

  /**
   * Move a lead to a stage that is the owner's own decision (spec O4). Setting
   * `contacted` stamps when, so "I have spoken to them" carries a date.
   * `invited` and `joined` are refused here: they follow from an action, and
   * the validator already narrows the input to the three that do not.
   */
  setStage: ownerProcedure
    .input(SetLeadStageSchema)
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .update(dropIn)
        .set({
          stage: input.stage,
          contactedAt:
            input.stage === "contacted" ? new Date() : dropIn.contactedAt,
        })
        .where(eq(dropIn.id, input.id))
        .returning({ id: dropIn.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: LEAD_GONE });
      return { ok: true as const };
    }),

  /**
   * Stamp a lead `invited` (spec O4). Its own action, not a side effect of
   * copying the join link: an owner copies a link to look at it, or sends it
   * through a channel matops never sees, so a copy is evidence of nothing. A
   * lead who already joined is left alone, so a stray tap cannot undo a real
   * conversion.
   */
  markInvited: ownerProcedure
    .input(LeadIdSchema)
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .update(dropIn)
        .set({ stage: "invited" })
        .where(and(eq(dropIn.id, input.id), ne(dropIn.stage, "joined")))
        .returning({ id: dropIn.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: LEAD_GONE });
      return { ok: true as const };
    }),

  /**
   * Set the email a lead can be promoted on (ADR 118). The front desk records
   * none, and rows captured before the wall-QR form required one may have none
   * either, so an owner given an address by voice needs a way to store it.
   */
  setEmail: ownerProcedure
    .input(SetLeadEmailSchema)
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .update(dropIn)
        .set({ email: input.email })
        .where(eq(dropIn.id, input.id))
        .returning({ id: dropIn.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: LEAD_GONE });
      return { ok: true as const };
    }),

  /**
   * Turn a lead into a member (ADR 118). This is the one place matops makes an
   * account for someone who has not proved they own the address, so it is
   * narrow on purpose:
   *
   * `canPromoteLead` refuses without consent or an email, and the email must
   * still equal the one the owner saw on screen, so a lead edited in another
   * tab cannot be promoted onto an address nobody confirmed.
   *
   * A NEW account is activated at once: the owner has met this person, so a
   * second approval step is ceremony. An EXISTING account is a real person who
   * never asked to join this gym, so it lands `pending` and they get their say
   * on the request queue. `createPendingMembership` is idempotent, so a member
   * who is already active is left exactly as they are and only the lead moves.
   *
   * Writes `user` and `member` on the base connection (both are outside the RLS
   * seam, ADR 66), and the lead itself through a scoped transaction.
   */
  promote: ownerIdentityProcedure
    .input(PromoteLeadSchema)
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.withScope(async (db) => {
        const rows = await db
          .select({
            firstName: dropIn.firstName,
            lastName: dropIn.lastName,
            phone: dropIn.phone,
            email: dropIn.email,
            consent: dropIn.consent,
            stage: dropIn.stage,
          })
          .from(dropIn)
          .where(eq(dropIn.id, input.id))
          .limit(1);
        return rows[0] ?? null;
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: LEAD_GONE });

      const gate = canPromoteLead(lead);
      if (!gate.ok) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: PROMOTE_REFUSAL_REASON[gate.reason],
        });
      }
      if (lead.email !== input.email) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This lead's email changed. Check it and try again.",
        });
      }

      const account = await resolveAccountByEmail(
        {
          email: input.email,
          name: `${lead.firstName} ${lead.lastName}`.trim(),
          phone: lead.phone,
        },
        ctx.baseDb,
      );
      await createPendingMembership(
        {
          userId: account.userId,
          organizationId: ctx.organizationId,
          entityId: ctx.academyId,
          invitedRole: CODE_JOIN_ROLE,
        },
        ctx.baseDb,
      );
      const membership = await getAcademyMembership(
        account.userId,
        ctx.academyId,
        ctx.baseDb,
      );
      if (!membership) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not create that membership. Try again.",
        });
      }

      const activated = !account.existed && membership.status === "pending";
      if (activated) {
        await activateMember(ctx, {
          memberId: membership.memberId,
          userId: account.userId,
          granted: approveMembership({
            status: membership.status,
            invitedRole: CODE_JOIN_ROLE,
          }),
        });
      }

      await ctx.withScope((db) =>
        db
          .update(dropIn)
          .set({ stage: "joined", convertedUserId: account.userId })
          .where(eq(dropIn.id, input.id)),
      );

      return {
        ok: true as const,
        status: activated ? ("active" as const) : ("pending" as const),
        existingAccount: account.existed,
      };
    }),

  /**
   * Link a lead to the member they became, for the case where the phone on the
   * two forms differs and the automatic match at self-join could not fire. A
   * link to a member, never a free-text flag.
   */
  markJoined: ownerProcedure
    .input(LinkLeadSchema)
    .mutation(async ({ ctx, input }) => {
      await requireMembership(
        input.userId,
        ctx.academyId,
        ctx.db,
        "That person is not a member of this academy",
      );
      const [row] = await ctx.db
        .update(dropIn)
        .set({ stage: "joined", convertedUserId: input.userId })
        .where(eq(dropIn.id, input.id))
        .returning({ id: dropIn.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: LEAD_GONE });
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
