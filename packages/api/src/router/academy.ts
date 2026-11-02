import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import {
  currentWaiver,
  eq,
  findAcademyByCode,
  getAcademyCode,
  getAcademySettings,
  listMembershipsForUser,
  recordMilestone,
  saveWaiverVersion,
  softDeleteAcademy,
  updateAcademySettings,
} from "@matops/db";
import { classTemplate, entity } from "@matops/db/schema";
import {
  canEnroll,
  driftingTemplateZones,
  isStudentLensMembership,
  isValidTimeZone,
  matchesDeleteAcademyPhrase,
  publicFileUrl,
} from "@matops/domain";
import {
  AcademyCodeSchema,
  CreateAcademySchema,
  DeleteAcademySchema,
  IdSchema,
  SaveWaiverSchema,
  SetMembershipEnforcedSchema,
  UpdateAcademySettingsSchema,
} from "@matops/validators";

import { academyContext } from "../academy-tz";
import {
  branchManagerIdentityProcedure,
  branchManagerProcedure,
  ownerIdentityProcedure,
  protectedProcedure,
} from "../trpc";

export const academyRouter = {
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
   * by code, 1 → open it automatically, 2+ → pick one. Any role on purpose, so
   * a returning student is not re-asked for a code; it drops
   * `removed`/`suspended` memberships, where the user has no standing to land
   * on.
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
      bookingWindowDays: academy.bookingWindowDays,
      // Which gate this branch runs on, so a screen never offers a setting the
      // server no longer consults (ADR 126).
      membershipEnforced: academy.membershipEnforcedAt !== null,
      code: await getAcademyCode(academyId, ctx.baseDb),
      iconUrl: publicFileUrl(ctx.appUrl, academy.iconKey),
      avatarUrl: publicFileUrl(ctx.appUrl, academy.avatarKey),
      uploadsEnabled: ctx.storage !== null,
    };
  }),

  settings: branchManagerProcedure.query(async ({ ctx }) => {
    const academy = await academyContext(ctx);
    const zones = await ctx.db
      .selectDistinct({ timeZone: classTemplate.timeZone })
      .from(classTemplate);
    return {
      ...academy,
      waiver: await currentWaiver(ctx.academyId, ctx.db),
      drifting: driftingTemplateZones(
        academy.timeZone,
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
      await ctx.withScope(async (db) => {
        if (input.waiverRequired && !(await currentWaiver(ctx.academyId, db))) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Write the agreement before you turn it on.",
          });
        }
        await updateAcademySettings(ctx.academyId, input, db);
      });
      return { ok: true as const };
    }),

  saveWaiver: branchManagerProcedure
    .input(SaveWaiverSchema)
    .mutation(({ ctx, input }) =>
      saveWaiverVersion(
        {
          academyId: ctx.academyId,
          body: input.body,
          createdBy: ctx.session.user.id,
        },
        ctx.db,
      ),
    ),

  /**
   * Turn membership payments on or off for this academy (ADR 154). On keeps
   * the first switch-on time, so turning it on twice does not move it.
   */
  setMembershipEnforced: ownerIdentityProcedure
    .input(SetMembershipEnforcedSchema)
    .mutation(async ({ ctx, input }) => {
      const enforcedAt = input.enforced
        ? (ctx.entity.membershipEnforcedAt ?? new Date())
        : null;
      await ctx.withScope((db) =>
        db
          .update(entity)
          .set({ membershipEnforcedAt: enforcedAt })
          .where(eq(entity.id, ctx.academyId)),
      );
      if (enforcedAt !== null) {
        await recordMilestone(
          {
            organizationId: ctx.organizationId,
            entityId: ctx.academyId,
            name: "branch_activated",
            actorRole: "owner",
          },
          ctx.baseDb,
        );
      }
      return { enforced: enforcedAt !== null };
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
