import { randomBytes } from "node:crypto";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import type { BranchIssue } from "@matops/domain";
import {
  and,
  count,
  eq,
  gt,
  inArray,
  isNull,
  listOwnedOrganizations,
  recordMilestone,
  withScope,
} from "@matops/db";
import {
  academyInvite,
  academyProfile,
  accessAssignment,
  accessPlan,
  accessPlanEntity,
  accessPlanPrice,
  classTemplate,
  entity,
  entityMembership,
  membershipPolicy,
  organization,
} from "@matops/db/schema";
import {
  branchLaunchIssues,
  isBjjAcademy,
  organizationSetup,
  setupProgress,
  slugify,
} from "@matops/domain";
import {
  CreateAcademySchema,
  IdSchema,
  OrganizationModulesSchema,
} from "@matops/validators";

import { studentRosterOf } from "../members";
import { loadRosterStanding } from "../membership-access";
import { assignmentAppliesNow } from "../membership-status";
import { readOrganizationEntities } from "../organization-read";
import {
  organizationManagerIdentityProcedure,
  protectedProcedure,
  refreshSessionCookie,
} from "../trpc";

/**
 * The gym itself, as against the branches it runs (ADR 127).
 *
 * Writes go on the BASE connection: `organization` carries no RLS policy and
 * migration `0020` revoked `matops_app`'s write access to the identity tables,
 * which is the whole reason the identity tier exists (ADR 92).
 */
export const organizationRouter = {
  /**
   * "Start a gym" (spec FP1, ADR 128). Writes the organization and the owner
   * `member` row Better Auth adds with it, and nothing else: no branch, no
   * public code, no schedule. The owner picks the first branch's type and name
   * afterwards, from `/overview`.
   *
   * The gym becomes the caller's active organization, so the refreshed session
   * cookie is what the overview reads on the way in.
   */
  create: protectedProcedure
    .input(CreateAcademySchema)
    .mutation(async ({ ctx, input }) => {
      const slug = `${slugify(input.name)}-${randomBytes(3).toString("hex")}`;
      const org = await ctx.authApi.createOrganization({
        body: { name: input.name, slug },
        headers: ctx.headers,
      });
      if (!org) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not create the gym",
        });
      }
      await recordMilestone(
        {
          organizationId: org.id,
          name: "organization_created",
          actorRole: "owner",
        },
        ctx.baseDb,
      );
      await refreshSessionCookie(ctx);
      return { organizationId: org.id };
    }),

  /**
   * The gyms this caller owns, branch or no branch.
   *
   * The post-login gate reads this when the caller belongs to no branch, which
   * an owner who has not made the first one does. Without it that owner is
   * offered the student join-by-code screen (ADR 128).
   */
  mine: protectedProcedure.query(({ ctx }) =>
    listOwnedOrganizations(ctx.session.user.id, ctx.baseDb),
  ),

  /**
   * Make one of those gyms the active one, which every organization-tier
   * procedure needs and a fresh session never carries. `academy.setActive`
   * cannot do it: it names an ENTITY, and this caller may have none.
   */
  setActive: protectedProcedure
    .input(z.object({ organizationId: IdSchema }))
    .mutation(async ({ ctx, input }) => {
      const owned = await listOwnedOrganizations(
        ctx.session.user.id,
        ctx.baseDb,
      );
      if (!owned.some((o) => o.organizationId === input.organizationId)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You do not run that gym",
        });
      }
      await ctx.authApi.setActiveOrganization({
        body: { organizationId: input.organizationId },
        headers: ctx.headers,
      });
      return { ok: true as const };
    }),

  /**
   * What this gym still has to do before it can run (spec FP8).
   *
   * Every item is derived from a row, never from a flag somebody ticked, so
   * the list cannot claim a step is finished when the thing it names is gone.
   * Read the way every organization read is (ADR 124): authorize the owner,
   * take the organization-scoped facts, then one entity scope per branch,
   * combined by a pure function afterwards.
   */
  setup: organizationManagerIdentityProcedure.query(async ({ ctx }) => {
    const branches = await readOrganizationEntities(
      ctx.organizationId,
      ctx.baseDb,
    );

    const gym = await withScope(
      { organizationId: ctx.organizationId },
      async (tx) => {
        const [org] = await tx
          .select({ name: organization.name })
          .from(organization)
          .where(eq(organization.id, ctx.organizationId));
        const [policy] = await tx
          .select({ bankDetails: membershipPolicy.bankDetails })
          .from(membershipPolicy)
          .where(eq(membershipPolicy.organizationId, ctx.organizationId));
        const [plans] = await tx
          .select({ n: count() })
          .from(accessPlan)
          .where(isNull(accessPlan.archivedAt));
        const [paidPlans] = await tx
          .select({ n: count() })
          .from(accessPlanPrice)
          .innerJoin(accessPlan, eq(accessPlan.id, accessPlanPrice.planId))
          .where(
            and(
              isNull(accessPlan.archivedAt),
              gt(accessPlanPrice.priceMinor, 0),
            ),
          );
        const [assignments] = await tx
          .select({ n: count() })
          .from(accessAssignment)
          .where(
            and(eq(accessAssignment.status, "active"), assignmentAppliesNow()),
          );
        return {
          name: org?.name ?? "",
          bankDetails: (policy?.bankDetails ?? "").trim().length > 0,
          plans: plans?.n ?? 0,
          paidPlans: paidPlans?.n ?? 0,
          assignments: assignments?.n ?? 0,
        };
      },
      ctx.baseDb,
    );

    const now = new Date();
    let branchesLocated = 0;
    let branchesScheduled = 0;
    let instructors = 0;
    let uncoveredMembers = 0;
    // `academy_invite` carries no `matops_app` grants at all (ADR 60), so this
    // read has to happen on the base connection: asking for it inside the
    // tenant transaction is a flat "permission denied", which took the whole
    // setup list down for any gym that had a branch.
    const [links] = await ctx.baseDb
      .select({ n: count() })
      .from(academyInvite)
      .where(
        and(
          inArray(
            academyInvite.academyId,
            branches.map((b) => b.id),
          ),
          isNull(academyInvite.revokedAt),
        ),
      );
    const invites = links?.n ?? 0;
    const health: { id: string; name: string; issues: BranchIssue[] }[] = [];
    for (const branch of branches) {
      await withScope(
        { organizationId: ctx.organizationId, entityId: branch.id },
        async (tx) => {
          const [place] = await tx
            .select({
              timeZone: entity.timeZone,
              address: entity.address,
              type: entity.type,
            })
            .from(entity)
            .where(eq(entity.id, branch.id));
          if (place?.timeZone && place.address) branchesLocated += 1;

          const [templates] = await tx
            .select({ n: count() })
            .from(classTemplate)
            .where(
              and(
                eq(classTemplate.status, "active"),
                isNull(classTemplate.deletedAt),
              ),
            );
          if ((templates?.n ?? 0) > 0) branchesScheduled += 1;

          const [staff] = await tx
            .select({ n: count() })
            .from(entityMembership)
            .where(
              and(
                eq(entityMembership.role, "instructor"),
                eq(entityMembership.status, "active"),
              ),
            );
          instructors += staff?.n ?? 0;

          // Who actually runs the mat, which includes an owner who teaches
          // their own classes (ADR 129). The count above is the gym-level
          // "bring an instructor in" step and is a different question.
          const [running] = await tx
            .select({ n: count() })
            .from(entityMembership)
            .where(
              and(
                inArray(entityMembership.role, ["owner", "instructor"]),
                eq(entityMembership.status, "active"),
              ),
            );

          let uncovered = 0;
          if (branch.membershipEnforcedAt) {
            const active = (
              await studentRosterOf({ academyId: branch.id, db: tx })
            )
              .filter((m) => m.status === "active")
              .map((m) => ({
                userId: m.userId,
                status: m.status,
                role: m.role,
              }));
            const standing = await loadRosterStanding(tx, {
              entityId: branch.id,
              people: active,
              now,
            });
            uncovered = active.filter(
              (m) => !standing.get(m.userId)?.covered,
            ).length;
            uncoveredMembers += uncovered;
          }

          const bjj = isBjjAcademy(place?.type ?? "");
          const [profile] = bjj
            ? await tx
                .select({ enabled: academyProfile.publicBookingEnabled })
                .from(academyProfile)
                .where(eq(academyProfile.entityId, branch.id))
            : [];
          const [shared] = profile?.enabled
            ? await tx
                .select({ n: count() })
                .from(classTemplate)
                .where(
                  and(
                    eq(classTemplate.publicBookable, true),
                    isNull(classTemplate.deletedAt),
                  ),
                )
            : [];
          const [covering] = await tx
            .select({ n: count() })
            .from(accessPlanEntity)
            .where(eq(accessPlanEntity.entityId, branch.id));

          health.push({
            id: branch.id,
            name: branch.name,
            issues: branchLaunchIssues({
              scheduled: (templates?.n ?? 0) > 0,
              staffed: (running?.n ?? 0) > 0,
              enforced: branch.membershipEnforcedAt !== null,
              uncovered,
              planCovers: (covering?.n ?? 0) > 0,
              bjj,
              publicBookingEnabled: profile?.enabled ?? false,
              publicClasses: shared?.n ?? 0,
            }),
          });
        },
        ctx.baseDb,
      );
    }

    const items = organizationSetup({
      gymNamed: gym.name.trim().length > 0,
      branches: branches.length,
      branchesLocated,
      branchesScheduled,
      instructors,
      bankDetails: gym.bankDetails,
      paidPlans: gym.paidPlans,
      plans: gym.plans,
      assignments: gym.assignments,
      uncoveredMembers,
      invites,
    });

    return { items, progress: setupProgress(items), branches: health };
  }),

  /**
   * What the gym has agreed to pay and where that stands (ADR 128).
   *
   * A read only. Nothing in this codebase charges anybody: the offer, the date
   * free access ends and the agreed price are set by us, out of band, and shown
   * here so an owner is never surprised by a bill and a pilot that quietly ran
   * past its date is visible.
   */
  account: organizationManagerIdentityProcedure.query(async ({ ctx }) => {
    const rows = await ctx.baseDb
      .select({
        offer: organization.offer,
        pilotEndsOn: organization.pilotEndsOn,
        agreedPriceMinor: organization.agreedPriceMinor,
        agreedPriceCurrency: organization.agreedPriceCurrency,
        billingContact: organization.billingContact,
        accountStatus: organization.accountStatus,
      })
      .from(organization)
      .where(eq(organization.id, ctx.organizationId))
      .limit(1);
    const row = rows[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "No gym" });
    return row;
  }),

  modules: organizationManagerIdentityProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.baseDb
      .select({
        curriculumEnabled: organization.curriculumEnabled,
        referralsEnabled: organization.referralsEnabled,
      })
      .from(organization)
      .where(eq(organization.id, ctx.organizationId))
      .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "No gym" });
    return row;
  }),

  setModules: organizationManagerIdentityProcedure
    .input(OrganizationModulesSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.baseDb
        .update(organization)
        .set(input)
        .where(eq(organization.id, ctx.organizationId));
      return input;
    }),

  /**
   * Rename the gym. Writes `organization.name` and nothing else: each branch
   * keeps its own name, which is the one every screen shows (ADR 124).
   */
  rename: organizationManagerIdentityProcedure
    .input(CreateAcademySchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.baseDb
        .update(organization)
        .set({ name: input.name.trim() })
        .where(eq(organization.id, ctx.organizationId));
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
