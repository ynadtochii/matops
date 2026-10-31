import type { TenantTx } from "@matops/db";
import {
  accessPlan,
  accessPlanEntity,
  accessPlanPrice,
} from "@matops/db/schema";
import { choosablePlans, monthOf, rowForMonth } from "@matops/domain";

import { enabledPaymentMethods, membershipCalendar } from "./membership-status";

export async function loadChoosablePlans(db: TenantTx, entityId: string) {
  const calendar = await membershipCalendar(db);
  const month = monthOf(new Date(), calendar.timeZone);
  const plans = await db
    .select({
      id: accessPlan.id,
      name: accessPlan.name,
      description: accessPlan.description,
      archivedAt: accessPlan.archivedAt,
      staffOnly: accessPlan.staffOnly,
    })
    .from(accessPlan);
  const coverage = await db
    .select({
      planId: accessPlanEntity.planId,
      entityId: accessPlanEntity.entityId,
    })
    .from(accessPlanEntity);
  const prices = await db
    .select({
      planId: accessPlanPrice.planId,
      effectiveMonth: accessPlanPrice.effectiveMonth,
      priceMinor: accessPlanPrice.priceMinor,
      currency: accessPlanPrice.currency,
      paymentLinkUrl: accessPlanPrice.paymentLinkUrl,
    })
    .from(accessPlanPrice);
  const methods = await enabledPaymentMethods(db);

  const offers = plans.map((p) => {
    const current = rowForMonth(
      prices.filter((row) => row.planId === p.id),
      month,
    );
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      archived: p.archivedAt !== null,
      staffOnly: p.staffOnly,
      entityIds: coverage
        .filter((c) => c.planId === p.id)
        .map((c) => c.entityId),
      amount: current
        ? { priceMinor: current.priceMinor, currency: current.currency }
        : null,
      cardLink: Boolean(current?.paymentLinkUrl),
      waysToPay: methods.filter((m) => !m.offPlanIds.includes(p.id)).length,
    };
  });
  return choosablePlans(offers, { entityId }).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    amount: p.amount,
    cardLink: p.cardLink,
  }));
}
