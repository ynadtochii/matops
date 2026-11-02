import { TRPCError } from "@trpc/server";

import type { DbExec, StripeHookProblem } from "@matops/db";
import {
  eq,
  recordStripeHookProblem,
  resolveStripeHook,
  takeRateLimit,
  touchStripeHook,
  withScope,
} from "@matops/db";
import { db } from "@matops/db/client";
import { cardPayment } from "@matops/db/schema";
import { formatMoney, parsePaymentLinkReference } from "@matops/domain";

import type { StripeWebhookEvent } from "./stripe-signature";
import {
  loadAssignment,
  lockMembershipMonth,
  monthEvidence,
  writeMonthDecision,
} from "./month-write";
import { clientIp, take } from "./rate-limit";
import { openSecretWithAny } from "./secret-box";
import { verifyStripeEvent } from "./stripe-signature";

export type CardPaymentOutcome =
  "confirmed" | "paid_twice" | "needs_review" | "duplicate" | "ignored";

const TOKEN = /^[A-Za-z0-9_-]{20,100}$/;
const MAX_BODY_BYTES = 64 * 1024;
const PER_IP_PER_MINUTE = 300;
const PER_GYM_PER_MINUTE = 600;
const MINUTE_MS = 60_000;

export async function handleCardPaymentEvent(
  event: StripeWebhookEvent,
  deps: { organizationId: string; baseDb: DbExec },
): Promise<CardPaymentOutcome> {
  if (event.type !== "checkout.session.completed") return "ignored";
  const session = event.object;
  const sessionId = session.id;
  const amount = session.amount_total;
  const currency = session.currency;
  if (
    session.payment_status !== "paid" ||
    typeof sessionId !== "string" ||
    typeof amount !== "number" ||
    typeof currency !== "string"
  ) {
    return "ignored";
  }
  const paidCurrency = currency.toUpperCase();
  const reference = parsePaymentLinkReference(
    typeof session.client_reference_id === "string"
      ? session.client_reference_id
      : null,
  );

  const result = await withScope(
    { organizationId: deps.organizationId },
    async (tx) => {
      const [recorded] = await tx
        .insert(cardPayment)
        .values({
          organizationId: deps.organizationId,
          stripeSessionId: sessionId,
          assignmentId: reference?.assignmentId ?? null,
          month: reference?.month ?? null,
          amountMinor: amount,
          currency: paidCurrency,
          outcome: "needs_review",
        })
        .onConflictDoNothing({ target: cardPayment.stripeSessionId })
        .returning({ id: cardPayment.id });
      if (!recorded) return { outcome: "duplicate" as const, promote: null };

      const settle = async (
        outcome: "confirmed" | "paid_twice" | "needs_review",
        reason: string | null,
      ) => {
        await tx
          .update(cardPayment)
          .set({ outcome, reason })
          .where(eq(cardPayment.id, recorded.id));
        return { outcome, promote: null };
      };

      if (!reference) {
        return settle(
          "needs_review",
          "The payment has no MatOps reference, so it matches no month.",
        );
      }
      let assignment;
      let evidence;
      try {
        assignment = await loadAssignment(tx, reference.assignmentId);
        evidence = await monthEvidence(tx, assignment, reference.month);
      } catch (err) {
        if (err instanceof TRPCError)
          return settle("needs_review", err.message);
        throw err;
      }
      const held = await lockMembershipMonth(
        tx,
        reference.assignmentId,
        reference.month,
      );
      const status = held?.status ?? "unpaid";
      if (status === "confirmed") {
        return settle(
          "paid_twice",
          "The month was already paid. Refund one payment in Stripe.",
        );
      }
      if (status === "rejected") {
        return settle(
          "needs_review",
          "The month was rejected. Decide in MatOps before it counts.",
        );
      }
      if (
        evidence.priceMinor !== amount ||
        evidence.currency !== paidCurrency
      ) {
        return settle(
          "needs_review",
          `Paid ${formatMoney(amount, paidCurrency)}, but the month costs ${formatMoney(evidence.priceMinor, evidence.currency)}.`,
        );
      }
      const written = await writeMonthDecision(tx, {
        organizationId: deps.organizationId,
        assignment,
        month: reference.month,
        held,
        nextStatus: "confirmed",
        evidence,
        actorId: null,
        event: "stripe_paid",
        reason: sessionId,
        now: new Date(),
      });
      await settle("confirmed", null);
      return { outcome: "confirmed" as const, promote: written.promote };
    },
    deps.baseDb,
  );
  if (result.promote) await result.promote(deps.baseDb);
  return result.outcome;
}

function recentlyRecorded(
  hook: { lastProblem: string | null; lastProblemAt: Date | null },
  problem: StripeHookProblem,
): boolean {
  return (
    hook.lastProblem === problem &&
    hook.lastProblemAt !== null &&
    Date.now() - hook.lastProblemAt.getTime() < MINUTE_MS
  );
}

export async function cardPaymentWebhookResponse(
  request: Request,
  token: string,
  deps: {
    secretKeys: readonly Buffer[];
    requireLive: boolean;
    report: (err: unknown, context: Record<string, unknown>) => void;
    baseDb?: DbExec;
  },
): Promise<Response> {
  const baseDb = deps.baseDb ?? db;
  if (deps.secretKeys.length === 0) {
    return new Response("Card payments are not set up", { status: 503 });
  }
  if (
    !take(
      `stripe-hook:ip:${clientIp(request.headers)}`,
      PER_IP_PER_MINUTE,
      MINUTE_MS,
    )
  ) {
    return new Response("Too many requests", { status: 429 });
  }
  if (!TOKEN.test(token)) return new Response("Not found", { status: 404 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return new Response("Too large", { status: 413 });
  }
  const hook = await resolveStripeHook(token, baseDb);
  if (!hook) return new Response("Not found", { status: 404 });
  if (!hook.secretCiphertext) {
    return new Response("The signing secret is not saved yet", {
      status: 409,
    });
  }
  const secret = openSecretWithAny(
    deps.secretKeys,
    hook.secretCiphertext,
    hook.organizationId,
  );
  if (!secret) {
    deps.report(new Error("stripe hook secret cannot be opened"), {
      organizationId: hook.organizationId,
    });
    return new Response("Secret unavailable", { status: 500 });
  }

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return new Response("Too large", { status: 413 });
  }
  let event: StripeWebhookEvent;
  try {
    event = verifyStripeEvent(
      secret,
      body,
      request.headers.get("stripe-signature"),
    );
  } catch {
    if (!recentlyRecorded(hook, "bad_signature")) {
      await recordStripeHookProblem(
        hook.organizationId,
        "bad_signature",
        baseDb,
      );
    }
    return new Response("Invalid signature", { status: 400 });
  }
  if (
    !(await takeRateLimit(
      `stripe-hook:gym:${hook.organizationId}`,
      PER_GYM_PER_MINUTE,
      MINUTE_MS,
      baseDb,
    ))
  ) {
    return new Response("Too many requests", { status: 429 });
  }
  if (deps.requireLive && !event.livemode) {
    if (!recentlyRecorded(hook, "test_event")) {
      await recordStripeHookProblem(hook.organizationId, "test_event", baseDb);
    }
    return Response.json({ received: true, outcome: "ignored" });
  }
  await touchStripeHook(hook.organizationId, baseDb);
  try {
    const outcome = await handleCardPaymentEvent(event, {
      organizationId: hook.organizationId,
      baseDb,
    });
    return Response.json({ received: true, outcome });
  } catch (err) {
    deps.report(err, {
      organizationId: hook.organizationId,
      eventId: event.id,
      eventType: event.type,
    });
    return new Response("Event failed", { status: 500 });
  }
}
