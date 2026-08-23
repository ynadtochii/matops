import { randomBytes } from "node:crypto";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import {
  findAcademyByCode,
  getAcademyCode,
  getAcademySettings,
  getMembership,
  listMembershipsForUser,
  softDeleteAcademy,
  updateAcademySettings,
} from "@matops/db";
import { classTemplate } from "@matops/db/schema";
import {
  driftingTemplateZones,
  isStudentLensMembership,
  isValidTimeZone,
  isWebLensMembership,
  matchesDeleteAcademyPhrase,
  slugify,
} from "@matops/domain";
import {
  AcademyCodeSchema,
  CreateAcademySchema,
  DeleteAcademySchema,
  IdSchema,
  UpdateAcademySettingsSchema,
} from "@matops/validators";

import { academyTimeZone } from "../academy-tz";
import {
  ownerIdentityProcedure,
  ownerProcedure,
  protectedProcedure,
  refreshSessionCookie,
} from "../trpc";

export const academyRouter = {
  /**
   * The academies this signed-in user runs — the WEB lens (owner / instructor,
   * plus a pending instructor still awaiting approval). Drives the switcher.
   */
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const all = await listMembershipsForUser(ctx.session.user.id, ctx.baseDb);
    return all.filter(isWebLensMembership);
  }),

  /**
   * The academies this user TRAINS at — the MOBILE (student) lens: active
   * students + members invited as students, awaiting approval. Drives the mobile
   * switcher + student home (the deferred mobile pass, docs/issues/18).
   */
  listMineStudent: protectedProcedure.query(async ({ ctx }) => {
    const all = await listMembershipsForUser(ctx.session.user.id, ctx.baseDb);
    return all.filter(isStudentLensMembership);
  }),

  /**
   * The post-login gate list (ADR 49): every academy this user has a LIVE tie to
   * — pending or active, any role. Drives where a fresh session lands: 0 → join
   * by code, 1 → open it automatically, 2+ → pick one. Broader than `listMine`
   * (the web-lens switcher) on purpose, so a returning student is not re-asked
   * for a code; it drops `removed`/`suspended` memberships, where the user has no
   * standing to land on.
   */
  memberships: protectedProcedure.query(async ({ ctx }) => {
    const all = await listMembershipsForUser(ctx.session.user.id, ctx.baseDb);
    return all
      .filter((a) => a.status === "pending" || a.status === "active")
      .map((a) => ({
        academyId: a.academyId,
        name: a.name,
        role: a.role,
        status: a.status,
      }));
  }),

  /** The active academy (name, the caller's role/status, and the shareable code
   * an owner gives students to join in the app — docs/issues/32), or null. */
  current: protectedProcedure.query(async ({ ctx }) => {
    const academyId = ctx.session.session.activeOrganizationId;
    if (!academyId) return null;
    const mine = await listMembershipsForUser(ctx.session.user.id, ctx.baseDb);
    const academy = mine.find((a) => a.academyId === academyId);
    if (!academy) return null;
    return {
      academyId: academy.academyId,
      userId: ctx.session.user.id,
      name: academy.name,
      role: academy.role,
      status: academy.status,
      joinedAt: academy.joinedAt,
      timeZone: academy.timeZone,
      address: academy.address,
      mapUrl: academy.mapUrl,
      code: await getAcademyCode(academyId, ctx.baseDb),
    };
  }),

  settings: ownerProcedure.query(async ({ ctx }) => {
    const timeZone = await academyTimeZone(ctx);
    const zones = await ctx.db
      .selectDistinct({ timeZone: classTemplate.timeZone })
      .from(classTemplate);
    return {
      timeZone,
      drifting: driftingTemplateZones(
        timeZone,
        zones.map((z) => z.timeZone),
      ),
    };
  }),

  updateSettings: ownerIdentityProcedure
    .input(UpdateAcademySettingsSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.timeZone !== undefined && !isValidTimeZone(input.timeZone)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That is not a time zone we recognise",
        });
      }
      await updateAcademySettings(ctx.academyId, input, ctx.baseDb);
      return { ok: true as const };
    }),

  /**
   * Soft delete (ADR 68): the rows survive, so the 6-digit code is never
   * reissued to a different gym and a mistaken delete is reversible in SQL.
   */
  remove: ownerIdentityProcedure
    .input(DeleteAcademySchema)
    .mutation(async ({ ctx, input }) => {
      const academy = await getAcademySettings(ctx.academyId, ctx.baseDb);
      if (!academy) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Academy not found",
        });
      }
      if (!matchesDeleteAcademyPhrase(input.confirm, academy.name)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Type "delete ${academy.name}" to confirm`,
        });
      }
      const deleted = await softDeleteAcademy(ctx.academyId, ctx.baseDb);
      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Academy not found",
        });
      }
      return { ok: true as const };
    }),

  /**
   * Look up an academy by its shared 6-digit code — the mobile search step
   * before joining (spec S2, docs/issues/32). Signed-in only (the mobile join
   * flow runs after sign-in); returns just the id + name to confirm, or null if
   * no academy has that code.
   */
  findByCode: protectedProcedure
    .input(AcademyCodeSchema)
    .query(async ({ ctx, input }) => {
      return findAcademyByCode(input.code, ctx.baseDb);
    }),

  /**
   * "Start a gym" (spec 1.1, docs/issues/20). Creates the organization; Better
   * Auth adds the creator as `owner` and the afterCreateOrganization hook flips
   * that membership to `active` — so the creator is a working owner at once. The
   * new academy also becomes the active one.
   */
  create: protectedProcedure
    .input(CreateAcademySchema)
    .mutation(async ({ ctx, input }) => {
      // Unique slug: readable stem + short random suffix (Better Auth requires it).
      const slug = `${slugify(input.name)}-${randomBytes(3).toString("hex")}`;
      const org = await ctx.authApi.createOrganization({
        body: { name: input.name, slug },
        headers: ctx.headers,
      });
      if (!org) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not create the academy",
        });
      }
      await refreshSessionCookie(ctx);
      return { academyId: org.id };
    }),

  /**
   * Rename the active academy (owner only). The **name is a mutable label** — not
   * unique-constrained, because identity is the immutable `public_code` (the
   * Academy code) + the org id. Updates via Better Auth so its org permission
   * check applies; the code is never touched.
   */
  rename: ownerProcedure
    .input(CreateAcademySchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.authApi.updateOrganization({
        body: {
          organizationId: ctx.academyId,
          data: { name: input.name.trim() },
        },
        headers: ctx.headers,
      });
      return { ok: true as const };
    }),

  /** Switch the active academy (multi-academy switcher, docs/issues/18). */
  setActive: protectedProcedure
    .input(z.object({ academyId: IdSchema }))
    .mutation(async ({ ctx, input }) => {
      // Only switch to an academy the caller actually belongs to.
      const membership = await getMembership(
        ctx.session.user.id,
        input.academyId,
        ctx.baseDb,
      );
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of that academy",
        });
      }
      await ctx.authApi.setActiveOrganization({
        body: { organizationId: input.academyId },
        headers: ctx.headers,
      });
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
