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
  isNotNull,
  isNull,
  listOwnedOrganizations,
  ne,
  recordMilestone,
  withScope,
} from "@matops/db";
import {
  academyInvite,
  accessAssignment,
  accessPlan,
  accessPlanEntity,
  accessPlanPrice,
  classParticipation,
  classTemplate,
  entity,
  entityMembership,
  organization,
  paymentMethod,
} from "@matops/db/schema";
import {
  branchLaunchIssues,
  organizationSetup,
  setupProgress,
  slugify,
} from "@matops/domain";
import { CreateAcademySchema, IdSchema } from "@matops/validators";

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
          message: "Couldn't create the gym. Try again.",
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
        const [methods] = await tx
          .select({ n: count() })
          .from(paymentMethod)
          .where(eq(paymentMethod.enabled, true));
        const [cardLinks] = await tx
          .select({ n: count() })
          .from(accessPlanPrice)
          .innerJoin(accessPlan, eq(accessPlan.id, accessPlanPrice.planId))
          .where(
            and(
              isNull(accessPlan.archivedAt),
              isNotNull(accessPlanPrice.paymentLinkUrl),
            ),
          );
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
        const [openPaidPlans] = await tx
          .select({ n: count() })
          .from(accessPlanPrice)
          .innerJoin(accessPlan, eq(accessPlan.id, accessPlanPrice.planId))
          .where(
            and(
              isNull(accessPlan.archivedAt),
              eq(accessPlan.staffOnly, false),
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
          waysToPay: (methods?.n ?? 0) + (cardLinks?.n ?? 0) > 0,
          plans: plans?.n ?? 0,
          paidPlans: paidPlans?.n ?? 0,
          openPaidPlans: openPaidPlans?.n ?? 0,
          assignments: assignments?.n ?? 0,
        };
      },
      ctx.baseDb,
    );

    const now = new Date();
    let branchesLocated = 0;
    let branchesScheduled = 0;
    let activeStudents = 0;
    let bookings = 0;
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

          const [students] = await tx
            .select({ n: count() })
            .from(entityMembership)
            .where(
              and(
                eq(entityMembership.role, "student"),
                eq(entityMembership.status, "active"),
              ),
            );
          activeStudents += students?.n ?? 0;

          const [booked] = await tx
            .select({ n: count() })
            .from(classParticipation)
            .where(ne(classParticipation.bookingStatus, "none"));
          bookings += booked?.n ?? 0;

          // Who actually runs the mat, which includes an owner who teaches
          // their own classes (ADR 129).
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
            }),
          });
        },
        ctx.baseDb,
      );
    }

    const items = organizationSetup({
      branches: branches.length,
      branchesLocated,
      branchesScheduled,
      activeStudents,
      bookings,
      paymentsOn: branches.some((b) => b.membershipEnforcedAt !== null),
      waysToPay: gym.waysToPay,
      paidPlans: gym.paidPlans,
      openPaidPlans: gym.openPaidPlans,
      plans: gym.plans,
      assignments: gym.assignments,
      uncoveredMembers,
      invites,
    });

    return { items, progress: setupProgress(items), branches: health };
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
