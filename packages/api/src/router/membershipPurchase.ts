import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { DbExec, TenantTx } from "@matops/db";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "@matops/db";
import {
  accessAssignment,
  accessPlan,
  accessPlanEntity,
  accessPlanPrice,
  entity,
  entityMembership,
  member,
  membershipMonth,
  membershipMonthAudit,
  membershipPurchase,
  person,
  user,
} from "@matops/db/schema";
import {
  monthOf,
  nextMonth,
  periodsOverlap,
  priceForMonth,
  purchaseActivationIssue,
} from "@matops/domain";
import {
  MembershipAvailabilitySchema,
  MembershipPurchaseIdSchema,
  PurchaseCatalogSchema,
  RejectMembershipPurchaseSchema,
  SelectMembershipPurchaseSchema,
} from "@matops/validators";

import { loadStaffAccess } from "../membership-access";
import {
  membershipBankDetails,
  membershipCalendar,
} from "../membership-status";
import { notifyMembershipPurchase } from "../notify";
import { enrolledProcedure, organizationManagerProcedure } from "../trpc";

function notifyReview(
  ctx: { afterCommit: (task: (exec: DbExec) => Promise<void>) => void },
  row: Purchase,
) {
  if (!row.userId) return row;
  const accountUserId = row.userId;
  ctx.afterCommit((exec) =>
    notifyMembershipPurchase(
      {
        academyId: row.entityId,
        userId: accountUserId,
        title:
          row.status === "confirmed"
            ? "Membership approved"
            : row.status === "resolution"
              ? row.priceMinor === 0
                ? "Membership needs review"
                : "Payment received, action needed"
              : row.status === "cancelled"
                ? "Membership request resolved"
                : "Membership request returned",
        body:
          row.status === "confirmed"
            ? `${row.planName} is approved from ${row.startMonth}. Includes ${row.branchNames.join(", ")}.`
            : `${row.planName}: ${row.reason ?? "Contact the gym for the next step."}`,
      },
      exec,
    ),
  );
  return row;
}

const unresolved = ["pending", "claimed", "rejected", "resolution"];
type Purchase = typeof membershipPurchase.$inferSelect;

function conflict(message: string): never {
  throw new TRPCError({ code: "CONFLICT", message });
}

async function currentMonth(db: TenantTx) {
  const { timeZone } = await membershipCalendar(db);
  return monthOf(new Date(), timeZone);
}

async function lockPerson(
  db: TenantTx,
  userId: string,
  organizationId: string,
) {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${userId}))`,
  );
  const rows = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
    );
  if (!rows.length)
    conflict("This person is no longer a member of this organization.");
}

async function purchase(db: TenantTx, id: string, userId?: string) {
  const [row] = await db
    .select()
    .from(membershipPurchase)
    .where(
      and(
        eq(membershipPurchase.id, id),
        userId ? eq(membershipPurchase.userId, userId) : undefined,
      ),
    )
    .for("update");
  if (!row)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This membership request is no longer available.",
    });
  return row;
}

async function save(db: TenantTx, id: string, values: Partial<Purchase>) {
  const [row] = await db
    .update(membershipPurchase)
    .set(values)
    .where(eq(membershipPurchase.id, id))
    .returning();
  if (!row) conflict("The membership request changed. Refresh and try again.");
  return row;
}

async function quote(
  db: TenantTx,
  planId: string,
  month: string,
  lock = false,
) {
  const query = db.select().from(accessPlan).where(eq(accessPlan.id, planId));
  const [plan] = lock ? await query.for("update") : await query;
  if (!plan)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This membership plan is no longer available.",
    });
  const branchQuery = db
    .select({
      id: entity.id,
      name: entity.name,
      status: entity.status,
      deletedAt: entity.deletedAt,
    })
    .from(accessPlanEntity)
    .innerJoin(entity, eq(accessPlanEntity.entityId, entity.id))
    .where(eq(accessPlanEntity.planId, planId))
    .orderBy(asc(entity.id));
  const branches = lock ? await branchQuery.for("share") : await branchQuery;
  const history = await db
    .select()
    .from(accessPlanPrice)
    .where(eq(accessPlanPrice.planId, planId));
  const price = priceForMonth(history, month);
  const unavailableReason =
    !plan.studentSelectable || plan.archivedAt !== null
      ? "This membership is not available for student selection."
      : !price
        ? "The gym has not set a price for this month."
        : !branches.length ||
            branches.some((b) => b.deletedAt !== null || b.status !== "active")
          ? "The gym needs to finish setting up the included branches."
          : null;
  const entityIds = branches.map((b) => b.id);
  const version = JSON.stringify({
    updatedAt: plan.updatedAt.toISOString(),
    month,
    price,
    entityIds,
  });
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    priceMinor: price?.priceMinor ?? 0,
    currency: price?.currency ?? "",
    branches: branches.map(({ id, name }) => ({ id, name })),
    entityIds,
    version,
    unavailableReason,
  };
}

async function restrictions(
  db: TenantTx,
  userId: string,
  branchId: string,
  entityIds: string[],
  startMonth: string,
  lock = true,
) {
  const membershipQuery = db
    .select()
    .from(entityMembership)
    .where(eq(entityMembership.userId, userId));
  const memberships = lock
    ? await membershipQuery.for("update")
    : await membershipQuery;
  const staffAccess = await loadStaffAccess(db, {
    entityIds: [branchId],
    userIds: [userId],
  });
  if (staffAccess.get(branchId)?.has(userId))
    return "You have staff access at this branch. No membership is required.";
  const selected = memberships.find((m) => m.entityId === branchId);
  if (selected?.status !== "active" || selected.role !== "student")
    return "Your branch must approve you as a student before this membership can start.";
  if (
    memberships.some(
      (m) => entityIds.includes(m.entityId) && m.status !== "active",
    )
  )
    return "An included branch needs to review your access. Ask the gym to resolve this first.";
  const assignmentQuery = db
    .select()
    .from(accessAssignment)
    .where(eq(accessAssignment.userId, userId));
  const assignments = lock
    ? await assignmentQuery.for("update")
    : await assignmentQuery;
  const coverage = await db.select().from(accessPlanEntity);
  const overlap = assignments.some(
    (a) =>
      periodsOverlap(a, { startMonth, endMonth: null }) &&
      coverage.some(
        (c) => c.planId === a.planId && entityIds.includes(c.entityId),
      ),
  );
  if (overlap)
    return "You already have a membership covering these branches. Ask the gym to change or restore your existing membership.";
  return null;
}

export const membershipPurchaseRouter = {
  catalog: enrolledProcedure
    .input(PurchaseCatalogSchema)
    .query(async ({ ctx, input }) => {
      const month = await currentMonth(ctx.db);
      const startMonth = input.start === "next" ? nextMonth(month) : month;
      const bankDetails = await membershipBankDetails(ctx.db);
      const plans = await ctx.db
        .select({ id: accessPlan.id })
        .from(accessPlan)
        .innerJoin(accessPlanEntity, eq(accessPlanEntity.planId, accessPlan.id))
        .where(
          and(
            eq(accessPlan.studentSelectable, true),
            isNull(accessPlan.archivedAt),
            eq(accessPlanEntity.entityId, ctx.entityId),
          ),
        );
      const quoted = await Promise.all(
        plans.map(async (p) => {
          const result = await quote(ctx.db, p.id, startMonth);
          const restriction =
            ctx.membership.status === "active"
              ? await restrictions(
                  ctx.db,
                  ctx.session.user.id,
                  ctx.entityId,
                  result.entityIds,
                  startMonth,
                  false,
                )
              : null;
          return {
            ...result,
            unavailableReason:
              result.unavailableReason ??
              restriction ??
              (result.priceMinor > 0 && !bankDetails.trim()
                ? "The gym needs to add bank transfer instructions."
                : null),
          };
        }),
      );
      return {
        month: startMonth,
        nextMonth: nextMonth(startMonth),
        canSelect:
          ctx.membership.status === "active" &&
          ctx.membership.role === "student",
        bankDetails,
        plans: quoted,
      };
    }),
  mine: enrolledProcedure.query(async ({ ctx }) => ({
    purchases: await ctx.db
      .select()
      .from(membershipPurchase)
      .where(
        or(
          ctx.membership.personId
            ? eq(membershipPurchase.personId, ctx.membership.personId)
            : undefined,
          and(
            isNull(membershipPurchase.personId),
            eq(membershipPurchase.userId, ctx.session.user.id),
          ),
        ),
      )
      .orderBy(desc(membershipPurchase.createdAt)),
    bankDetails: await membershipBankDetails(ctx.db),
    currentMonth: await currentMonth(ctx.db),
  })),
  select: enrolledProcedure
    .input(SelectMembershipPurchaseSchema)
    .mutation(async ({ ctx, input }) => {
      await lockPerson(ctx.db, ctx.session.user.id, ctx.organizationId);
      const month = await currentMonth(ctx.db);
      const startMonth = input.start === "next" ? nextMonth(month) : month;
      const existing = await ctx.db
        .select()
        .from(membershipPurchase)
        .where(
          and(
            or(
              ctx.membership.personId
                ? eq(membershipPurchase.personId, ctx.membership.personId)
                : undefined,
              and(
                isNull(membershipPurchase.personId),
                eq(membershipPurchase.userId, ctx.session.user.id),
              ),
            ),
            inArray(membershipPurchase.status, unresolved),
          ),
        )
        .for("update");
      const held = existing[0];
      if (held) {
        if (
          held.planId === input.planId &&
          held.startMonth === startMonth &&
          held.version === input.version
        )
          return held;
        conflict(
          "You already have a membership request. Finish or cancel it before choosing another.",
        );
      }
      const selected = await quote(ctx.db, input.planId, startMonth, true);
      if (selected.unavailableReason) conflict(selected.unavailableReason);
      if (!selected.entityIds.includes(ctx.entityId))
        conflict("Choose a membership covering your current branch.");
      if (selected.version !== input.version)
        conflict(
          "The membership terms changed. Review the latest price and branches before choosing.",
        );
      const reason = await restrictions(
        ctx.db,
        ctx.session.user.id,
        ctx.entityId,
        selected.entityIds,
        startMonth,
      );
      if (reason) conflict(reason);
      if (
        selected.priceMinor > 0 &&
        !(await membershipBankDetails(ctx.db)).trim()
      )
        conflict("The gym needs to add bank transfer instructions first.");
      const id = crypto.randomUUID();
      const [made] = await ctx.db
        .insert(membershipPurchase)
        .values({
          id,
          organizationId: ctx.organizationId,
          personId: ctx.membership.personId,
          userId: ctx.session.user.id,
          entityId: ctx.entityId,
          planId: selected.id,
          planName: selected.name,
          priceMinor: selected.priceMinor,
          currency: selected.currency,
          startMonth,
          entityIds: selected.entityIds,
          branchNames: selected.branches.map((b) => b.name),
          version: selected.version,
          reference: `MEM-${id.replaceAll("-", "").toUpperCase()}`,
        })
        .returning();
      if (!made)
        conflict("Could not save your membership selection. Try again.");
      return made;
    }),
  claim: enrolledProcedure
    .input(MembershipPurchaseIdSchema)
    .mutation(async ({ ctx, input }) => {
      const row = await purchase(ctx.db, input.id, ctx.session.user.id);
      if (row.status === "claimed" || row.status === "confirmed") return row;
      if (row.status !== "pending")
        conflict("This request cannot accept a payment claim.");
      return save(ctx.db, row.id, {
        status: row.priceMinor === 0 ? "pending" : "claimed",
        claimedAt: row.priceMinor === 0 ? null : new Date(),
        reason: null,
      });
    }),
  cancel: enrolledProcedure
    .input(MembershipPurchaseIdSchema)
    .mutation(async ({ ctx, input }) => {
      const row = await purchase(ctx.db, input.id, ctx.session.user.id);
      if (row.status === "cancelled") return row;
      if (
        (row.status !== "pending" &&
          !(row.status === "rejected" && row.priceMinor === 0)) ||
        row.claimedAt
      )
        conflict(
          "A reported payment needs the gym to review it. Contact the gym before changing this request.",
        );
      return save(ctx.db, row.id, { status: "cancelled" });
    }),
  review: organizationManagerProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        purchase: membershipPurchase,
        personId: sql<string>`coalesce(${membershipPurchase.personId}::text, ${person.id}::text, ${membershipPurchase.userId})`,
        studentName: sql<string>`coalesce(${person.name}, ${user.name})`,
        studentEmail: sql<
          string | null
        >`coalesce(${person.email}, ${user.email})`,
      })
      .from(membershipPurchase)
      .leftJoin(person, eq(membershipPurchase.personId, person.id))
      .leftJoin(user, eq(membershipPurchase.userId, user.id))
      .where(
        inArray(membershipPurchase.status, [
          "claimed",
          "pending",
          "resolution",
          "rejected",
        ]),
      )
      .orderBy(asc(membershipPurchase.createdAt));
    return rows
      .filter(({ purchase: p }) => p.status !== "pending" || p.priceMinor === 0)
      .map(({ purchase: p, ...student }) => ({ ...p, ...student }));
  }),
  confirm: organizationManagerProcedure
    .input(MembershipPurchaseIdSchema)
    .mutation(async ({ ctx, input }) => {
      const [identity] = await ctx.db
        .select({
          personId: sql<
            string | null
          >`coalesce(${membershipPurchase.personId}::text, ${person.id}::text)`,
          accountUserId: membershipPurchase.userId,
        })
        .from(membershipPurchase)
        .leftJoin(
          person,
          and(
            eq(person.organizationId, membershipPurchase.organizationId),
            eq(person.accountUserId, membershipPurchase.userId),
          ),
        )
        .where(eq(membershipPurchase.id, input.id));
      if (!identity)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This membership request is no longer available.",
        });
      if (!identity.accountUserId)
        conflict("This membership request needs a linked account.");
      await lockPerson(ctx.db, identity.accountUserId, ctx.organizationId);
      const row = await purchase(ctx.db, input.id);
      if (row.status === "confirmed" || row.status === "resolution") return row;
      if (
        row.status !== "claimed" &&
        row.status !== "rejected" &&
        !(row.status === "pending" && row.priceMinor === 0)
      )
        conflict(
          "The student must report their payment before it can be confirmed.",
        );
      const selected = await quote(ctx.db, row.planId, row.startMonth, true);
      const month = await currentMonth(ctx.db);
      const reason = purchaseActivationIssue({
        startMonth: row.startMonth,
        currentMonth: month,
        quotedVersion: row.version,
        currentVersion: selected.version,
        unavailableReason: selected.unavailableReason,
        restriction: await restrictions(
          ctx.db,
          identity.accountUserId,
          row.entityId,
          row.entityIds,
          row.startMonth,
        ),
      });
      const reviewed = {
        reviewedBy: ctx.session.user.id,
        reviewedAt: new Date(),
        confirmedAt: new Date(),
      };
      if (reason)
        return notifyReview(
          ctx,
          await save(ctx.db, row.id, {
            ...reviewed,
            status: "resolution",
            reason,
          }),
        );
      const [assignment] = await ctx.db
        .insert(accessAssignment)
        .values({
          organizationId: ctx.organizationId,
          personId: identity.personId,
          userId: identity.accountUserId,
          planId: row.planId,
          assigningEntityId: row.entityId,
          startMonth: row.startMonth,
          assignedBy: ctx.session.user.id,
        })
        .returning();
      if (!assignment)
        conflict("Could not activate the membership. Try again.");
      if (row.priceMinor > 0) {
        await ctx.db.insert(membershipMonth).values({
          organizationId: ctx.organizationId,
          assignmentId: assignment.id,
          month: row.startMonth,
          paid: true,
          recordedBy: ctx.session.user.id,
          recordedAt: new Date(),
        });
        await ctx.db.insert(membershipMonthAudit).values({
          organizationId: ctx.organizationId,
          assignmentId: assignment.id,
          month: row.startMonth,
          wasPaid: null,
          paid: true,
          actorId: ctx.session.user.id,
        });
      }
      await ctx.db
        .insert(entityMembership)
        .values(
          row.entityIds.map((entityId) => ({
            organizationId: ctx.organizationId,
            entityId,
            personId: identity.personId,
            userId: identity.accountUserId,
            role: "student",
            status: "active",
            joinedAt: new Date(),
          })),
        )
        .onConflictDoNothing({
          target: identity.personId
            ? [entityMembership.entityId, entityMembership.personId]
            : [entityMembership.entityId, entityMembership.userId],
        });
      const enrolled = await ctx.db
        .select({ status: entityMembership.status })
        .from(entityMembership)
        .where(
          and(
            identity.personId
              ? eq(entityMembership.personId, identity.personId)
              : and(
                  isNull(entityMembership.personId),
                  eq(entityMembership.userId, identity.accountUserId),
                ),
            inArray(entityMembership.entityId, row.entityIds),
          ),
        )
        .for("update");
      if (
        enrolled.length !== row.entityIds.length ||
        enrolled.some((m) => m.status !== "active")
      )
        conflict(
          "Branch access changed during approval. Review the request again. No membership was activated.",
        );
      return notifyReview(
        ctx,
        await save(ctx.db, row.id, {
          ...reviewed,
          status: "confirmed",
          reason: null,
          assignmentId: assignment.id,
        }),
      );
    }),
  reject: organizationManagerProcedure
    .input(RejectMembershipPurchaseSchema)
    .mutation(async ({ ctx, input }) => {
      const row = await purchase(ctx.db, input.id);
      if (row.status === "rejected" || row.status === "cancelled") return row;
      if (
        row.status !== "claimed" &&
        !(row.status === "pending" && row.priceMinor === 0)
      )
        conflict(
          "Only a payment claim or free membership request can be returned.",
        );
      return notifyReview(
        ctx,
        await save(ctx.db, row.id, {
          status: "rejected",
          reason: input.reason,
          reviewedBy: ctx.session.user.id,
          reviewedAt: new Date(),
        }),
      );
    }),
  close: organizationManagerProcedure
    .input(RejectMembershipPurchaseSchema)
    .mutation(async ({ ctx, input }) => {
      const row = await purchase(ctx.db, input.id);
      if (row.status === "cancelled") return row;
      if (row.status === "rejected" && row.priceMinor > 0)
        conflict("Confirm this declined payment to restore access.");
      if (row.status !== "rejected" && row.status !== "resolution")
        conflict(
          "Return the request or record its payment outcome before closing it.",
        );
      return notifyReview(
        ctx,
        await save(ctx.db, row.id, {
          status: "cancelled",
          reason: input.reason,
          reviewedBy: ctx.session.user.id,
          reviewedAt: new Date(),
        }),
      );
    }),
  setAvailability: organizationManagerProcedure
    .input(MembershipAvailabilitySchema)
    .mutation(async ({ ctx, input }) => {
      const [plan] = await ctx.db
        .select()
        .from(accessPlan)
        .where(eq(accessPlan.id, input.planId))
        .for("update");
      if (!plan)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This membership plan is no longer available.",
        });
      if (input.available) {
        if (
          plan.archivedAt !== null ||
          plan.priceMinor === null ||
          !plan.currency
        )
          conflict("Restore this plan and set its price before publishing it.");
        const coverage = await ctx.db
          .select({ branch: entity })
          .from(accessPlanEntity)
          .innerJoin(entity, eq(accessPlanEntity.entityId, entity.id))
          .where(eq(accessPlanEntity.planId, plan.id));
        if (
          !coverage.length ||
          coverage.some(
            ({ branch }) =>
              branch.deletedAt !== null || branch.status !== "active",
          )
        )
          conflict("Every included branch must be active before publishing.");
        if (
          plan.priceMinor > 0 &&
          !(await membershipBankDetails(ctx.db)).trim()
        )
          conflict(
            "Add bank transfer instructions before publishing a paid plan.",
          );
      }
      await ctx.db
        .update(accessPlan)
        .set({ studentSelectable: input.available })
        .where(eq(accessPlan.id, input.planId));
      return { available: input.available };
    }),
} satisfies TRPCRouterRecord;
