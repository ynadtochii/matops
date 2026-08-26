import type { DbReader } from "@matops/db";
import { and, eq } from "@matops/db";
import {
  memberDues,
  membershipPlan,
  paymentClaim,
  paymentSettings,
} from "@matops/db/schema";
import { DEFAULT_GRACE_DAYS } from "@matops/domain";

export async function readPaymentSettings(db: DbReader): Promise<{
  bankDetails: string;
  graceDays: number;
  enforcedAt: Date | null;
}> {
  const row = (
    await db
      .select({
        bankDetails: paymentSettings.bankDetails,
        graceDays: paymentSettings.graceDays,
        enforcedAt: paymentSettings.enforcedAt,
      })
      .from(paymentSettings)
      .limit(1)
  )[0];
  return {
    bankDetails: row?.bankDetails ?? "",
    graceDays: row?.graceDays ?? DEFAULT_GRACE_DAYS,
    enforcedAt: row?.enforcedAt ?? null,
  };
}

const DUES_COLUMNS = {
  memberId: memberDues.memberId,
  planId: memberDues.planId,
  nextDueAt: memberDues.nextDueAt,
  planName: membershipPlan.name,
  priceMinor: membershipPlan.priceMinor,
  currency: membershipPlan.currency,
  cycle: membershipPlan.cycle,
};

export type DuesWithPlan = {
  [K in keyof typeof DUES_COLUMNS]: (typeof DUES_COLUMNS)[K]["_"]["data"];
};

export function readAllDuesWithPlan(db: DbReader): Promise<DuesWithPlan[]> {
  return db
    .select(DUES_COLUMNS)
    .from(memberDues)
    .innerJoin(membershipPlan, eq(memberDues.planId, membershipPlan.id));
}

export async function readDuesWithPlan(
  db: DbReader,
  memberId: string,
): Promise<DuesWithPlan | undefined> {
  return (
    await db
      .select(DUES_COLUMNS)
      .from(memberDues)
      .innerJoin(membershipPlan, eq(memberDues.planId, membershipPlan.id))
      .where(eq(memberDues.memberId, memberId))
      .limit(1)
  )[0];
}

export async function readOpenClaim(
  db: DbReader,
  memberId: string,
  period: string,
): Promise<{ id: string; claimedAt: Date } | undefined> {
  return (
    await db
      .select({ id: paymentClaim.id, claimedAt: paymentClaim.claimedAt })
      .from(paymentClaim)
      .where(
        and(
          eq(paymentClaim.memberId, memberId),
          eq(paymentClaim.status, "pending"),
          eq(paymentClaim.period, period),
        ),
      )
      .limit(1)
  )[0];
}
