import { eq } from "drizzle-orm";

import type { DbExec } from "./client";
import { stripeHook } from "./payment-hook-schema";

export interface StripeHookRow {
  organizationId: string;
  token: string;
  secretCiphertext: string | null;
  createdAt: Date;
  lastEventAt: Date | null;
  lastProblem: string | null;
  lastProblemAt: Date | null;
}

export type StripeHookProblem = "bad_signature" | "test_event";

export async function getStripeHook(
  organizationId: string,
  exec: DbExec,
): Promise<StripeHookRow | null> {
  const [row] = await exec
    .select()
    .from(stripeHook)
    .where(eq(stripeHook.organizationId, organizationId));
  return row ?? null;
}

export async function resolveStripeHook(
  token: string,
  exec: DbExec,
): Promise<StripeHookRow | null> {
  const [row] = await exec
    .select()
    .from(stripeHook)
    .where(eq(stripeHook.token, token));
  return row ?? null;
}

export async function startStripeHook(
  organizationId: string,
  token: string,
  exec: DbExec,
): Promise<void> {
  await exec
    .insert(stripeHook)
    .values({ organizationId, token })
    .onConflictDoUpdate({
      target: stripeHook.organizationId,
      set: {
        token,
        secretCiphertext: null,
        createdAt: new Date(),
        lastEventAt: null,
        lastProblem: null,
        lastProblemAt: null,
      },
    });
}

export async function saveStripeHookSecret(
  organizationId: string,
  secretCiphertext: string,
  exec: DbExec,
): Promise<boolean> {
  const saved = await exec
    .update(stripeHook)
    .set({ secretCiphertext, lastProblem: null, lastProblemAt: null })
    .where(eq(stripeHook.organizationId, organizationId))
    .returning({ organizationId: stripeHook.organizationId });
  return saved.length > 0;
}

export async function deleteStripeHook(
  organizationId: string,
  exec: DbExec,
): Promise<void> {
  await exec
    .delete(stripeHook)
    .where(eq(stripeHook.organizationId, organizationId));
}

export async function touchStripeHook(
  organizationId: string,
  exec: DbExec,
): Promise<void> {
  await exec
    .update(stripeHook)
    .set({ lastEventAt: new Date(), lastProblem: null, lastProblemAt: null })
    .where(eq(stripeHook.organizationId, organizationId));
}

export async function recordStripeHookProblem(
  organizationId: string,
  problem: StripeHookProblem,
  exec: DbExec,
): Promise<void> {
  await exec
    .update(stripeHook)
    .set({ lastProblem: problem, lastProblemAt: new Date() })
    .where(eq(stripeHook.organizationId, organizationId));
}
