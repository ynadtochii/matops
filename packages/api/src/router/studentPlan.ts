import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import { and, eq, inArray, isNull } from "@matops/db";
import {
  accessAssignment,
  membershipAccessHold,
  membershipMonth,
} from "@matops/db/schema";
import { canSwapChosenPlan, isStaff, monthOf } from "@matops/domain";
import { ChoosePlanSchema } from "@matops/validators";

import { staffOf } from "../members";
import {
  enabledPaymentMethods,
  membershipCalendar,
  membershipStanding,
} from "../membership-status";
import {
  appendMonthAudit,
  loadAssignment,
  monthEvidence,
} from "../month-write";
import { loadChoosablePlans } from "../student-plans";
import { memberProcedure } from "../trpc";
import { assignOne, lockAssignmentsOf } from "./accessPlan";

export const studentPlanRouter = {
  options: memberProcedure.query(async ({ ctx }) => {
    const staff = await staffOf({ academyId: ctx.entity.id, db: ctx.db });
    return {
      plans: await loadChoosablePlans(ctx.db, ctx.entity.id),
      methods: await enabledPaymentMethods(ctx.db),
      staff: staff.flatMap((s) =>
        s.accountUserId ? [{ userId: s.accountUserId, name: s.name }] : [],
      ),
    };
  }),

  choose: memberProcedure
    .input(ChoosePlanSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.entity.membershipEnforcedAt) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Your gym does not take membership payments here yet.",
        });
      }
      const personId = ctx.membership.personId;
      if (isStaff(ctx.membership) || !personId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only students choose a membership.",
        });
      }
      const plan = (await loadChoosablePlans(ctx.db, ctx.entity.id)).find(
        (p) => p.id === input.planId,
      );
      if (!plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That plan is not available any more. Pick another one.",
        });
      }

      await lockAssignmentsOf(ctx.db, personId, ctx.organizationId);
      const now = new Date();
      const standing = await membershipStanding(
        ctx.db,
        { personId, accountUserId: ctx.session.user.id },
        now,
      );
      const current = standing.filter(
        (m) => m.status === "active" && m.entityIds.includes(ctx.entity.id),
      );
      const same = current.find((m) => m.planId === plan.id);
      if (same) return { assignmentId: same.assignmentId, created: false };

      const holds = current.length
        ? await ctx.db
            .select({ assignmentId: membershipAccessHold.assignmentId })
            .from(membershipAccessHold)
            .where(
              and(
                inArray(
                  membershipAccessHold.assignmentId,
                  current.map((m) => m.assignmentId),
                ),
                isNull(membershipAccessHold.resolvedAt),
              ),
            )
        : [];
      for (const m of current) {
        const swappable = canSwapChosenPlan({
          chosenBySelf: m.chosenBySelf,
          firstMonth: m.firstMonth,
          paymentStatus: m.paymentStatus as
            "unpaid" | "reported" | "confirmed" | "rejected",
          held: holds.some((h) => h.assignmentId === m.assignmentId),
        });
        if (!swappable) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "You already have a membership. Ask your gym to change it.",
          });
        }
      }
      for (const m of current) {
        await ctx.db
          .delete(membershipMonth)
          .where(eq(membershipMonth.assignmentId, m.assignmentId));
        await ctx.db
          .delete(accessAssignment)
          .where(eq(accessAssignment.id, m.assignmentId));
      }

      const done = await assignOne(ctx, {
        userId: ctx.session.user.id,
        planId: plan.id,
        assigningEntityId: ctx.entity.id,
      });
      const assignment = await loadAssignment(ctx.db, done.id);
      const calendar = await membershipCalendar(ctx.db);
      const month = monthOf(now, calendar.timeZone);
      const evidence = await monthEvidence(ctx.db, assignment, month);
      const firstMonth = { ...evidence, deadline: now };
      const [written] = await ctx.db
        .insert(membershipMonth)
        .values({
          organizationId: ctx.organizationId,
          assignmentId: done.id,
          month,
          status: "unpaid",
          version: 1,
          priceMinor: firstMonth.priceMinor,
          currency: firstMonth.currency,
          deadline: firstMonth.deadline,
          calendarTimeZone: firstMonth.calendarTimeZone,
        })
        .onConflictDoNothing({
          target: [membershipMonth.assignmentId, membershipMonth.month],
        })
        .returning({ id: membershipMonth.id });
      if (written) {
        await appendMonthAudit(ctx.db, {
          organizationId: ctx.organizationId,
          assignmentId: done.id,
          month,
          event: "chosen",
          beforeStatus: null,
          afterStatus: "unpaid",
          evidence: firstMonth,
          actorId: ctx.session.user.id,
        });
      }
      return { assignmentId: done.id, created: true };
    }),
} satisfies TRPCRouterRecord;
