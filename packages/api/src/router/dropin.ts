import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import {
  createDropIn,
  desc,
  getAcademyPublic,
  listAcademyClassesInWindow,
} from "@matops/db";
import { dropIn } from "@matops/db/schema";
import {
  canSubmitDropIn,
  checkInFetchWindow,
  normalizePhone,
  resolveCheckInClass,
} from "@matops/domain";
import { AcademyPublicSchema, DropInSchema } from "@matops/validators";

import { ownerProcedure, publicProcedure, rateLimited } from "../trpc";

/**
 * Public drop-in / lead capture (slice 3.5, spec O4/§4; docs/issues/25). The
 * `submit` + `academyInfo` procedures are PUBLIC (unauthenticated) — the one
 * enumerated exception to the tenant seam (docs/issues/12): a no-app visitor
 * scans the gym QR and fills a short form. Writes run on the trusted base
 * connection via `@matops/db` helpers, each pinned to the validated academy id.
 * Owner reads (`list`) go through the RLS-scoped `ctx.db`.
 */
export const dropInRouter = {
  /** Academy name for the public drop-in page header; 404 if the id is unknown. */
  academyInfo: publicProcedure
    .use(rateLimited(30, 60_000))
    .input(AcademyPublicSchema)
    .query(async ({ ctx, input }) => {
      const academy = await getAcademyPublic(input.academyId, ctx.baseDb);
      if (!academy) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Gym not found" });
      }
      return { name: academy.name };
    }),

  /**
   * Record a drop-in: a lead + attendance for the gym. Consent is required
   * (validator + `canSubmitDropIn`). Resolves the current class server-side and
   * attaches it when exactly one is on; otherwise it's a general visit lead
   * (spec §4). Deduped by phone — a repeat visitor bumps their visit count.
   */
  submit: publicProcedure
    .use(rateLimited(5, 10 * 60_000))
    .input(DropInSchema)
    .mutation(async ({ ctx, input }) => {
      const academy = await getAcademyPublic(input.academyId, ctx.baseDb);
      if (!academy) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Gym not found" });
      }
      const gate = canSubmitDropIn(input);
      if (!gate.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            gate.reason === "no-consent"
              ? "Please tick the consent box to continue"
              : "Please enter your name and phone number",
        });
      }

      // Attach the current class if exactly one is on right now (else general lead).
      const now = Date.now();
      const window = checkInFetchWindow(new Date(now));
      const classes = await listAcademyClassesInWindow(
        input.academyId,
        window.from.getTime(),
        window.to.getTime(),
        ctx.baseDb,
      );
      const candidates = resolveCheckInClass(classes, new Date(now));
      const classId =
        candidates.length === 1 ? (candidates[0]?.id ?? null) : null;

      const { visitCount } = await createDropIn(
        {
          academyId: input.academyId,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: normalizePhone(input.phone),
          email: input.email ?? null,
          classId,
          consent: input.consent,
        },
        ctx.baseDb,
      );
      return { ok: true as const, firstVisit: visitCount === 1 };
    }),

  /** Drop-in leads for the active academy (spec O4). Owner-only, RLS-scoped. */
  list: ownerProcedure.query(({ ctx }) => {
    return ctx.db
      .select({
        id: dropIn.id,
        firstName: dropIn.firstName,
        lastName: dropIn.lastName,
        phone: dropIn.phone,
        email: dropIn.email,
        consent: dropIn.consent,
        visitCount: dropIn.visitCount,
        lastVisitAt: dropIn.lastVisitAt,
      })
      .from(dropIn)
      .orderBy(desc(dropIn.lastVisitAt));
  }),
} satisfies TRPCRouterRecord;
