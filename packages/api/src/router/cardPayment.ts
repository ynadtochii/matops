import { randomBytes } from "node:crypto";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import {
  and,
  deleteStripeHook,
  desc,
  eq,
  getStripeHook,
  isNull,
  ne,
  saveStripeHookSecret,
  startStripeHook,
} from "@matops/db";
import { accessAssignment, cardPayment, person } from "@matops/db/schema";
import {
  CardPaymentIdSchema,
  SaveStripeHookSecretSchema,
} from "@matops/validators";

import { sealSecret } from "../secret-box";
import {
  organizationManagerIdentityProcedure,
  organizationManagerProcedure,
  organizationOwnerIdentityProcedure,
} from "../trpc";

type HookState = "none" | "needs_secret" | "ready";

const NOT_CONFIGURED =
  "Card payment confirmation is not set up on this server.";

function requireKey(key: Buffer | null | undefined): Buffer {
  if (!key) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: NOT_CONFIGURED,
    });
  }
  return key;
}

export const cardPaymentRouter = {
  hook: organizationManagerIdentityProcedure.query(async ({ ctx }) => {
    const hook = await getStripeHook(ctx.organizationId, ctx.baseDb);
    const state: HookState = !hook
      ? "none"
      : hook.secretCiphertext
        ? "ready"
        : "needs_secret";
    return {
      configured: Boolean(ctx.paymentSecretKey),
      state,
      url: hook ? `${ctx.appUrl}/api/stripe/hooks/${hook.token}` : null,
      lastEventAt: hook?.lastEventAt ?? null,
      lastProblem: hook?.lastProblem ?? null,
      lastProblemAt: hook?.lastProblemAt ?? null,
    };
  }),

  startHook: organizationOwnerIdentityProcedure.mutation(async ({ ctx }) => {
    requireKey(ctx.paymentSecretKey);
    const token = randomBytes(32).toString("base64url");
    await startStripeHook(ctx.organizationId, token, ctx.baseDb);
    return { url: `${ctx.appUrl}/api/stripe/hooks/${token}` };
  }),

  saveSecret: organizationOwnerIdentityProcedure
    .input(SaveStripeHookSecretSchema)
    .mutation(async ({ ctx, input }) => {
      const key = requireKey(ctx.paymentSecretKey);
      const saved = await saveStripeHookSecret(
        ctx.organizationId,
        sealSecret(key, input.secret, ctx.organizationId),
        ctx.baseDb,
      );
      if (!saved) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Start the setup first.",
        });
      }
      return { ok: true as const };
    }),

  removeHook: organizationOwnerIdentityProcedure.mutation(async ({ ctx }) => {
    await deleteStripeHook(ctx.organizationId, ctx.baseDb);
    return { ok: true as const };
  }),

  toReview: organizationManagerProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: cardPayment.id,
        month: cardPayment.month,
        amountMinor: cardPayment.amountMinor,
        currency: cardPayment.currency,
        outcome: cardPayment.outcome,
        reason: cardPayment.reason,
        createdAt: cardPayment.createdAt,
        name: person.name,
      })
      .from(cardPayment)
      .leftJoin(
        accessAssignment,
        eq(accessAssignment.id, cardPayment.assignmentId),
      )
      .leftJoin(person, eq(person.id, accessAssignment.personId))
      .where(
        and(
          ne(cardPayment.outcome, "confirmed"),
          isNull(cardPayment.dismissedAt),
        ),
      )
      .orderBy(desc(cardPayment.createdAt))
      .limit(50);
    return rows;
  }),

  dismiss: organizationManagerProcedure
    .input(CardPaymentIdSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(cardPayment)
        .set({ dismissedAt: new Date() })
        .where(eq(cardPayment.id, input.id));
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
