import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import {
  findAcademyByCode,
  getAcademyCode,
  getAcademySettings,
  getPublicApiSettings,
  hasLegacyDuesAt,
  listMembershipsForUser,
  listPublicClasses,
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
  branchManagerIdentityProcedure,
  branchManagerProcedure,
  ownerIdentityProcedure,
  protectedProcedure,
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
   *
   * An empty list is not a broken gym (ADR 128). An owner who has made a gym
   * and not yet made its first branch belongs to no branch, and the landing
   * rule sends them to `/overview` to make one.
   */
  memberships: protectedProcedure.query(async ({ ctx }) => {
    const all = await listMembershipsForUser(ctx.session.user.id, ctx.baseDb);
    return all.filter(canEnroll).map((a) => ({
      academyId: a.academyId,
      organizationId: a.organizationId,
      name: a.name,
      role: a.role,
      status: a.status,
    }));
  }),

  /**
   * The academy this request named (name, the caller's role/status, and the
   * shareable code an owner gives students to join in the app —
   * docs/issues/32), or null.
   *
   * The academy is the one the request NAMED, and only that: the web reads it
   * from the URL and the app from secure-store, and there is no falling back to
   * the session's active organization, which would quietly answer for the
   * default academy whenever a client forgot the header (ADR 124).
   *
   * It stays a `protectedProcedure` rather than an entity tier because the
   * shell calls it to decide whether there is an academy to open at all, and a
   * refusal there would be a crash instead of a gate.
   */
  current: protectedProcedure.query(async ({ ctx }) => {
    const academyId = ctx.requestedEntityId;
    if (!academyId) return null;
    const activeOrganizationId = ctx.session.session.activeOrganizationId;
    if (!activeOrganizationId) return null;
    const mine = await listMembershipsForUser(ctx.session.user.id, ctx.baseDb);
    const academy = mine.find(
      (a) =>
        a.academyId === academyId &&
        a.organizationId === activeOrganizationId &&
        canEnroll(a),
    );
    if (!academy) return null;
    return {
      academyId: academy.academyId,
      organizationId: academy.organizationId,
      type: academy.type,
      userId: ctx.session.user.id,
      name: academy.name,
      role: academy.role,
      status: academy.status,
      joinedAt: academy.joinedAt,
      timeZone: academy.timeZone,
      country: academy.country,
      address: academy.address,
      mapUrl: academy.mapUrl,
      // Which gate this branch runs on, so a screen never offers a setting the
      // server no longer consults (ADR 126).
      membershipEnforced: academy.membershipEnforcedAt !== null,
      // Does this branch have a legacy dues history at all? A branch opened
      // after ADR 128 is born on memberships and never had plans or dues, so
      // switching it off must not reveal an empty Payments screen for a product
      // it never ran. Only a branch that predates the cutover has these rows.
      hasLegacyDues: await hasLegacyDuesAt(academyId, ctx.baseDb),
      curriculumForStudents: academy.curriculumForStudents,
      code: await getAcademyCode(academyId, ctx.baseDb),
    };
  }),

  settings: branchManagerProcedure.query(async ({ ctx }) => {
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

  updateSettings: branchManagerIdentityProcedure
    .input(UpdateAcademySettingsSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.timeZone !== undefined && !isValidTimeZone(input.timeZone)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That is not a time zone we recognise",
        });
      }
      await ctx.withScope((db) =>
        updateAcademySettings(ctx.academyId, input, db),
      );
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
    const { settings, shared } = await ctx.withScope(async (db) => {
      const settings = await getPublicApiSettings(ctx.academyId, db);
      const now = new Date();
      return {
        settings,
        shared: settings?.enabled
          ? await listPublicClasses(
              ctx.academyId,
              now,
              new Date(now.getTime() + PUBLIC_RANGE_DEFAULT_DAYS * DAY_MS),
              1,
              db,
            )
          : [],
      };
    });
    if (!settings) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Academy not found" });
    }
    return {
      bookingEnabled: settings.enabled,
      publicCode: settings.publicCode,
      hasSharedClass: shared.length > 0,
    };
  }),

  /**
   * The public booking surface (spec O6, ADR 115): the master switch, the
   * publishable key and the optional origin allowlist. Owner-only.
   */
  publicApi: branchManagerIdentityProcedure.query(async ({ ctx }) => {
    const settings = await ctx.withScope((db) =>
      getPublicApiSettings(ctx.academyId, db),
    );
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
  setPublicApi: branchManagerIdentityProcedure
    .input(PublicBookingEnabledSchema)
    .mutation(async ({ ctx, input }) => {
      const settings = await ctx.withScope((db) =>
        setPublicApiEnabled(ctx.academyId, input.enabled, db),
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
  rotatePublicApiKey: branchManagerIdentityProcedure.mutation(
    async ({ ctx }) => {
      return {
        apiKey: await ctx.withScope((db) =>
          rotatePublicApiKey(ctx.academyId, db),
        ),
      };
    },
  ),

  /** The websites allowed to call the API from a browser. Empty means any. */
  setPublicApiOrigins: branchManagerIdentityProcedure
    .input(PublicApiOriginsSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.withScope((db) =>
        setPublicApiOrigins(ctx.academyId, input.origins, db),
      );
      return { ok: true as const };
    }),

  /**
   * Soft delete (ADR 68): the rows survive, so the 6-digit code is never
   * reissued to a different gym and a mistaken delete is reversible in SQL.
   */
  remove: ownerIdentityProcedure
    .input(DeleteAcademySchema)
    .mutation(async ({ ctx, input }) => {
      const academy = await ctx.withScope((db) =>
        getAcademySettings(ctx.academyId, db),
      );
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
   * Rename the academy (owner only). The **name is a mutable label** — not
   * unique-constrained, because identity is the immutable `public_code` (the
   * Academy code) and the entity id. It writes `entity.name`, not the
   * organization's: a gym with two mats renames one of them, and the name every
   * screen shows is the entity's (ADR 124). The code is never touched.
   */
  rename: branchManagerIdentityProcedure
    .input(CreateAcademySchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.withScope((db) =>
        updateAcademySettings(ctx.academyId, { name: input.name.trim() }, db),
      );
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
