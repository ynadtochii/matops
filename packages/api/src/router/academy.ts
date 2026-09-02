import { randomBytes } from "node:crypto";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import {
  findAcademyByCode,
  getAcademyCode,
  getAcademySettings,
  getPublicApiSettings,
  listMembershipsForUser,
  listPublicClasses,
  provisionOrganization,
  rotatePublicApiKey,
  setPublicApiEnabled,
  setPublicApiOrigins,
  softDeleteAcademy,
  updateAcademySettings,
} from "@matops/db";
import { classTemplate } from "@matops/db/schema";
import {
  canEnroll,
  DAY_MS,
  driftingTemplateZones,
  isStudentLensMembership,
  isValidTimeZone,
  isWebLensMembership,
  matchesDeleteAcademyPhrase,
  PUBLIC_RANGE_DEFAULT_DAYS,
  slugify,
} from "@matops/domain";
import {
  AcademyCodeSchema,
  CreateAcademySchema,
  DeleteAcademySchema,
  IdSchema,
  PublicApiOriginsSchema,
  PublicBookingEnabledSchema,
  UpdateAcademySettingsSchema,
} from "@matops/validators";

import { academyContext } from "../academy-tz";
import {
  ownerIdentityProcedure,
  ownerProcedure,
  protectedProcedure,
  refreshSessionCookie,
  staffIdentityProcedure,
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
    return all.filter(canEnroll).map((a) => ({
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
      country: academy.country,
      address: academy.address,
      mapUrl: academy.mapUrl,
      curriculumForStudents: academy.curriculumForStudents,
      code: await getAcademyCode(academyId, ctx.baseDb),
    };
  }),

  settings: ownerProcedure.query(async ({ ctx }) => {
    const { timeZone, country } = await academyContext(ctx);
    const zones = await ctx.db
      .selectDistinct({ timeZone: classTemplate.timeZone })
      .from(classTemplate);
    return {
      timeZone,
      country,
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
   * What staff send to someone who asks about training (spec O6): whether the
   * public booking page is live and the code its URL is built from. Staff, not
   * owner, because the instructor reading the gym's messages is usually the one
   * asked. It returns three fields and never the publishable key, which stays
   * on the owner-only `publicApi` query.
   *
   * `hasSharedClass` looks at the same window the visitor's page asks for, so
   * an empty one means a working link that shows nothing — the one failure a
   * link on its own cannot reveal.
   */
  shareLinks: staffIdentityProcedure.query(async ({ ctx }) => {
    const settings = await getPublicApiSettings(ctx.academyId, ctx.baseDb);
    if (!settings) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Academy not found" });
    }
    const now = new Date();
    const shared = settings.enabled
      ? await listPublicClasses(
          ctx.academyId,
          now,
          new Date(now.getTime() + PUBLIC_RANGE_DEFAULT_DAYS * DAY_MS),
          1,
          ctx.baseDb,
        )
      : [];
    return {
      bookingEnabled: settings.enabled,
      publicCode: settings.publicCode,
      hasSharedClass: shared.length > 0,
    };
  }),

  /**
   * The public booking surface (spec O6, ADR 115): the master switch, the
   * publishable key and the optional origin allowlist. Owner-only, and it reads
   * the base connection because `organization` carries no tenant policy.
   */
  publicApi: ownerIdentityProcedure.query(async ({ ctx }) => {
    const settings = await getPublicApiSettings(ctx.academyId, ctx.baseDb);
    if (!settings) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Academy not found" });
    }
    return settings;
  }),

  /**
   * Switch public booking on or off. Switching on mints the key the first time;
   * switching off keeps it, because a gym that pauses for a week should not have
   * to re-paste a key into its website afterwards.
   */
  setPublicApi: ownerIdentityProcedure
    .input(PublicBookingEnabledSchema)
    .mutation(async ({ ctx, input }) => {
      const settings = await setPublicApiEnabled(
        ctx.academyId,
        input.enabled,
        ctx.baseDb,
      );
      if (!settings) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Academy not found",
        });
      }
      return settings;
    }),

  /** Rotate the key: the old one stops working the moment this commits. */
  rotatePublicApiKey: ownerIdentityProcedure.mutation(async ({ ctx }) => {
    return { apiKey: await rotatePublicApiKey(ctx.academyId, ctx.baseDb) };
  }),

  /** The websites allowed to call the API from a browser. Empty means any. */
  setPublicApiOrigins: ownerIdentityProcedure
    .input(PublicApiOriginsSchema)
    .mutation(async ({ ctx, input }) => {
      await setPublicApiOrigins(ctx.academyId, input.origins, ctx.baseDb);
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
      // Belt to the hook's braces (ADR 124). `afterCreateOrganization` already
      // ran the same provisioner; running it again creates nothing and repairs
      // an organization whose setup died half way.
      const { entityId } = await provisionOrganization(
        { organizationId: org.id, ownerUserId: ctx.session.user.id },
        ctx.baseDb,
      );
      await refreshSessionCookie(ctx);
      return { academyId: org.id, organizationId: org.id, entityId };
    }),

  /**
   * Rename the active academy (owner only). The **name is a mutable label** — not
   * unique-constrained, because identity is the immutable `public_code` (the
   * Academy code) + the org id. Updates via Better Auth so its org permission
   * check applies; the code is never touched.
   */
  rename: ownerIdentityProcedure
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

  /**
   * Switch the active academy (multi-academy switcher, docs/issues/18).
   *
   * The caller names an ENTITY, which is what the switcher lists. Better Auth
   * only knows organizations, so the entity's own organization is what goes on
   * the session; the entity id is what the client sends as `x-matops-entity`
   * from then on (ADR 124).
   */
  setActive: protectedProcedure
    .input(z.object({ academyId: IdSchema }))
    .mutation(async ({ ctx, input }) => {
      const mine = await listMembershipsForUser(
        ctx.session.user.id,
        ctx.baseDb,
      );
      const academy = mine.find((a) => a.academyId === input.academyId);
      if (!academy) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You are not a member of that academy",
        });
      }
      await ctx.authApi.setActiveOrganization({
        body: { organizationId: academy.organizationId },
        headers: ctx.headers,
      });
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
