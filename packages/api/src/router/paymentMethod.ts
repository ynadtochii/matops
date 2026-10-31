import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import { asc, count, eq, max } from "@matops/db";
import { paymentMethod } from "@matops/db/schema";
import { MAX_PAYMENT_METHODS } from "@matops/domain";
import {
  PaymentMethodIdSchema,
  ReorderPaymentMethodsSchema,
  SavePaymentMethodSchema,
} from "@matops/validators";

import {
  organizationManagerProcedure,
  organizationOwnerProcedure,
} from "../trpc";

const NOT_FOUND = new TRPCError({
  code: "NOT_FOUND",
  message: "That way to pay is gone. Refresh and try again.",
});

export const paymentMethodRouter = {
  list: organizationManagerProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: paymentMethod.id,
        kind: paymentMethod.kind,
        label: paymentMethod.label,
        details: paymentMethod.details,
        enabled: paymentMethod.enabled,
      })
      .from(paymentMethod)
      .orderBy(asc(paymentMethod.position), asc(paymentMethod.createdAt)),
  ),

  save: organizationOwnerProcedure
    .input(SavePaymentMethodSchema)
    .mutation(async ({ ctx, input }) => {
      const values = {
        kind: input.kind,
        label: input.label,
        details: input.details,
        enabled: input.enabled,
      };
      if (input.id) {
        const [row] = await ctx.db
          .update(paymentMethod)
          .set(values)
          .where(eq(paymentMethod.id, input.id))
          .returning({ id: paymentMethod.id });
        if (!row) throw NOT_FOUND;
        return row;
      }

      const [stats] = await ctx.db
        .select({ n: count(), last: max(paymentMethod.position) })
        .from(paymentMethod);
      if ((stats?.n ?? 0) >= MAX_PAYMENT_METHODS) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `You can add up to ${MAX_PAYMENT_METHODS} ways to pay.`,
        });
      }
      const [row] = await ctx.db
        .insert(paymentMethod)
        .values({
          ...values,
          organizationId: ctx.organizationId,
          position: (stats?.last ?? -1) + 1,
        })
        .returning({ id: paymentMethod.id });
      if (!row) throw new Error("payment_method insert returned no row");
      return row;
    }),

  remove: organizationOwnerProcedure
    .input(PaymentMethodIdSchema)
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .delete(paymentMethod)
        .where(eq(paymentMethod.id, input.id))
        .returning({ id: paymentMethod.id });
      if (!row) throw NOT_FOUND;
      return { ok: true as const };
    }),

  reorder: organizationOwnerProcedure
    .input(ReorderPaymentMethodsSchema)
    .mutation(async ({ ctx, input }) => {
      for (const [position, id] of input.ids.entries()) {
        await ctx.db
          .update(paymentMethod)
          .set({ position })
          .where(eq(paymentMethod.id, id));
      }
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
