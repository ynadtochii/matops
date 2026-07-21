import { randomBytes } from "node:crypto";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { getMembership, listMembershipsForUser } from "@matops/db";
import {
  isStudentLensMembership,
  isWebLensMembership,
  slugify,
} from "@matops/domain";
import { CreateAcademySchema } from "@matops/validators";

import { protectedProcedure } from "../trpc";

export const academyRouter = {
  /**
   * The academies this signed-in user runs — the WEB lens (owner / instructor,
   * plus a pending instructor still awaiting approval). Drives the switcher.
   */
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const all = await listMembershipsForUser(ctx.session.user.id);
    return all.filter(isWebLensMembership);
  }),

  /**
   * The academies this user TRAINS at — the MOBILE (student) lens: active
   * students + members invited as students, awaiting approval. Drives the mobile
   * switcher + student home (the deferred mobile pass, docs/issues/18).
   */
  listMineStudent: protectedProcedure.query(async ({ ctx }) => {
    const all = await listMembershipsForUser(ctx.session.user.id);
    return all.filter(isStudentLensMembership);
  }),

  /** The active academy (name + the caller's role/status there), or null. */
  current: protectedProcedure.query(async ({ ctx }) => {
    const academyId = ctx.session.session.activeOrganizationId;
    if (!academyId) return null;
    const mine = await listMembershipsForUser(ctx.session.user.id);
    const academy = mine.find((a) => a.academyId === academyId);
    if (!academy) return null;
    return {
      academyId: academy.academyId,
      name: academy.name,
      role: academy.role,
      status: academy.status,
    };
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
      return { academyId: org.id };
    }),

  /** Switch the active academy (multi-academy switcher, docs/issues/18). */
  setActive: protectedProcedure
    .input(z.object({ academyId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      // Only switch to an academy the caller actually belongs to.
      const membership = await getMembership(
        ctx.session.user.id,
        input.academyId,
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
