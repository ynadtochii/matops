import { createHash } from "node:crypto";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { DbExec, DropInAcademy } from "@matops/db";
import {
  desc,
  eq,
  getOrCreateDropInLink,
  listAcademyClassesInWindow,
  lookupReturningLead,
  resolveDropInLink,
  rotateDropInLink,
  sql,
  submitDropInVisit,
  takeRateLimit,
} from "@matops/db";
import { dropIn, entityMembership, person, user } from "@matops/db/schema";
import {
  isStaffRole,
  VISITOR_LINK_DAYS,
  VISITOR_LIST_DAYS,
  visitorClassChoices,
  visitorWindow,
} from "@matops/domain";
import {
  DropInClassesSchema,
  DropInLookupSchema,
  DropInSubmitSchema,
  LinkTokenSchema,
  SetLeadStageSchema,
} from "@matops/validators";

import { clientIp } from "../rate-limit";
import {
  branchManagerIdentityProcedure,
  branchManagerProcedure,
  memberIdentityProcedure,
  publicProcedure,
  rateLimited,
} from "../trpc";

const LEAD_GONE = "That lead is no longer in your list";
const LINK_GONE = "This link isn't valid. Ask the gym for a new one.";
const CONTACT_WINDOW_MS = 10 * 60_000;
const CONTACT_MAX = 10;

async function requireLink(token: string, exec: DbExec) {
  const academy = await resolveDropInLink(token, exec);
  if (!academy) {
    console.warn("[drop-in] unknown or rotated link");
    throw new TRPCError({ code: "NOT_FOUND", message: LINK_GONE });
  }
  return academy;
}

async function limitContact(
  ctx: { headers: Headers; baseDb: DbExec },
  scope: string,
  token: string,
) {
  const key = createHash("sha256")
    .update(`${scope}:${clientIp(ctx.headers)}:${token}`)
    .digest("hex");
  if (!(await takeRateLimit(key, CONTACT_MAX, CONTACT_WINDOW_MS, ctx.baseDb))) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many tries. Wait a few minutes and try again.",
    });
  }
}

async function visitorChoices(
  academy: DropInAcademy,
  classId: string | undefined,
  exec: DbExec,
) {
  const now = new Date();
  const days = classId ? VISITOR_LINK_DAYS : VISITOR_LIST_DAYS;
  const window = visitorWindow(now, academy.timeZone, days);
  const listed = await listAcademyClassesInWindow(
    academy.academyId,
    window.from.getTime(),
    window.to.getTime(),
    exec,
  );
  const classes = classId ? listed.filter((c) => c.id === classId) : listed;
  const pick = (c: { id: string; title: string; startsAt: Date }) => ({
    id: c.id,
    title: c.title,
    startsAt: c.startsAt,
  });
  const choices = visitorClassChoices(classes, now, academy.timeZone, days);
  return {
    now: choices.now.map(pick),
    upcoming: choices.upcoming.map(pick),
  };
}

const REFUSAL: Record<
  "link" | "class" | "no-match" | "agreement" | "phone-taken",
  { code: TRPCError["code"]; message: string }
> = {
  link: { code: "NOT_FOUND", message: LINK_GONE },
  class: {
    code: "PRECONDITION_FAILED",
    message: "That class changed or is no longer open. Pick another one.",
  },
  "no-match": {
    code: "PRECONDITION_FAILED",
    message: "We need a few more details. Please fill in the form.",
  },
  agreement: {
    code: "PRECONDITION_FAILED",
    message: "The agreement changed. Please read it and accept it again.",
  },
  "phone-taken": {
    code: "CONFLICT",
    message:
      "This phone number is saved with a different email. Use the email you gave before, or ask the gym.",
  },
};

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
 * The drop-in link and the lead pipeline (spec O4, ADR 147). `resolve`,
 * `classes`, `lookup` and `submit` are PUBLIC: the one enumerated exception to
 * the tenant seam (docs/issues/12). Each one resolves the academy from the live
 * token on the base connection; no academy id or lead id is ever taken from the
 * browser. Owner reads (`list`) go through the RLS-scoped `ctx.db`.
 */
export const dropInRouter = {
  link: memberIdentityProcedure.query(async ({ ctx }) => ({
    ...(await getOrCreateDropInLink(
      { academyId: ctx.academyId, createdBy: ctx.session.user.id },
      ctx.baseDb,
    )),
    sharedBy: ctx.entityMembership?.id ?? null,
  })),

  rotateLink: branchManagerIdentityProcedure.mutation(({ ctx }) =>
    rotateDropInLink(
      { academyId: ctx.academyId, createdBy: ctx.session.user.id },
      ctx.baseDb,
    ),
  ),

  resolve: publicProcedure
    .use(rateLimited(30, 60_000))
    .input(LinkTokenSchema)
    .query(async ({ ctx, input }) => {
      const academy = await requireLink(input.token, ctx.baseDb);
      return {
        name: academy.name,
        timeZone: academy.timeZone,
        country: academy.country,
        signupHealthQuestion: academy.signupHealthQuestion,
        waiver: academy.waiver,
      };
    }),

  classes: publicProcedure
    .use(rateLimited(30, 60_000))
    .input(DropInClassesSchema)
    .query(async ({ ctx, input }) =>
      visitorChoices(
        await requireLink(input.token, ctx.baseDb),
        input.classId,
        ctx.baseDb,
      ),
    ),

  lookup: publicProcedure
    .input(DropInLookupSchema)
    .mutation(async ({ ctx, input }) => {
      await limitContact(ctx, "lookup", input.token);
      const academy = await requireLink(input.token, ctx.baseDb);
      const match = await lookupReturningLead(academy, input, ctx.baseDb);
      if (!match) console.warn("[drop-in] lookup found no usable lead");
      return { match };
    }),

  submit: publicProcedure
    .input(DropInSubmitSchema)
    .mutation(async ({ ctx, input }) => {
      await limitContact(ctx, "submit", input.token);
      const outcome = await submitDropInVisit(input, ctx.baseDb);
      if (!outcome.ok) {
        console.warn(`[drop-in] submit refused: ${outcome.reason}`);
        if (outcome.reason === "answers") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: outcome.message ?? "Check your answers and try again.",
          });
        }
        throw new TRPCError(REFUSAL[outcome.reason]);
      }
      return {
        mode: outcome.mode,
        classTitle: outcome.classTitle,
        startsAt: outcome.startsAt,
      };
    }),

  /**
   * The lead pipeline for the active academy (spec O4). Owner-only, RLS-scoped.
   * Stage is stored; activity is derived from `drop_in_visit` on every read, so
   * the two can never disagree.
   */
  list: branchManagerProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
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
        belt: dropIn.belt,
        stripes: dropIn.stripes,
        health: dropIn.health,
        emailUpdates: sql<boolean>`${dropIn.emailUpdatesAt} is not null`,
        waiverAcceptedAt: dropIn.waiverAcceptedAt,
        visitCount: presentVisits,
        lastVisitAt,
        nextBookingAt,
        createdAt: dropIn.createdAt,
        lastSeenAt: dropIn.lastVisitAt,
        sharerName: sql<string | null>`coalesce(${person.name}, ${user.name})`,
        sharerRole: entityMembership.role,
      })
      .from(dropIn)
      .leftJoin(
        entityMembership,
        eq(entityMembership.id, dropIn.sharedByMembershipId),
      )
      .leftJoin(person, eq(person.id, entityMembership.personId))
      .leftJoin(user, eq(user.id, entityMembership.userId))
      .orderBy(desc(dropIn.lastVisitAt));
    return rows.map(({ sharerName, sharerRole, ...lead }) => ({
      ...lead,
      sharedBy:
        sharerName && sharerRole
          ? {
              name: sharerName,
              kind: isStaffRole({ role: sharerRole })
                ? ("coach" as const)
                : ("student" as const),
            }
          : null,
    }));
  }),

  /**
   * Move a lead to a stage that is the owner's own decision (spec O4). Setting
   * `contacted` stamps when, so "I have spoken to them" carries a date.
   * `invited` and `joined` are refused here: they follow from an action, and
   * the validator already narrows the input to the three that do not.
   */
  setStage: branchManagerProcedure
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
} satisfies TRPCRouterRecord;
