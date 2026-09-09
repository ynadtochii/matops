import { eq } from "drizzle-orm";

import { monthOf } from "@matops/domain";

import type { SeedExec } from "./registry";
import { createEntity, provisionOrganization } from "../provision";
import {
  accessPlan,
  accessPlanEntity,
  accessPlanPrice,
  entity,
  membershipPolicy,
  organization,
} from "../schema";
import { SEED_MARKER } from "./registry";

/**
 * The pilot gym (ADR 126): one organization running a BJJ academy, a gym and a
 * sauna, with the three example plans the spec names.
 *
 * Kept apart from the "Alma beta" demo because it is testing a different thing.
 * Alma is one academy with a full history; this is the smallest arrangement
 * that exercises SHARED memberships, which needs three branches and plans that
 * overlap on one of them.
 *
 * Idempotent: every insert either names a deterministic id or does nothing on
 * conflict, so running it twice changes nothing. `seed down` removes it, since
 * its ids carry the seed marker and teardown deletes by organization.
 */
const PILOT_ORG_ID = `${SEED_MARKER}org_pilot`;
const PILOT_GYM_ID = `${SEED_MARKER}ent_pilot_gym`;
const PILOT_SAUNA_ID = `${SEED_MARKER}ent_pilot_sauna`;

/**
 * `access_plan.id` is a uuid column, so the plans cannot carry the `seed_`
 * marker in their ids the way the branches do. These are fixed uuids instead,
 * which is what makes the seed idempotent; teardown finds them by organization.
 */
const PLAN_ID = {
  bjj: "5eed0000-0000-4000-8000-000000000001",
  bjj_gym: "5eed0000-0000-4000-8000-000000000002",
  gym_sauna: "5eed0000-0000-4000-8000-000000000003",
} as const;

const PILOT_TIME_ZONE = "Europe/Lisbon";

interface PilotReport {
  organizationId: string;
  branches: { id: string; name: string; type: string }[];
  plans: { id: string; name: string; covers: string[] }[];
}

export async function seedPilot(
  exec: SeedExec,
  ownerUserId: string,
): Promise<PilotReport> {
  await exec
    .insert(organization)
    .values({
      id: PILOT_ORG_ID,
      name: "Pilot Gym",
      slug: "seed-pilot-gym",
      createdAt: new Date(),
      // A general branch cannot be opened without this, so the pilot turns it
      // on for ITSELF and for nobody else (step 1.6).
      generalBranchesEnabled: true,
      curriculumEnabled: true,
      referralsEnabled: true,
    })
    .onConflictDoNothing();

  // The default branch takes the organization's own id (ADR 124), so the BJJ
  // academy is provisioned rather than created.
  await provisionOrganization(
    { organizationId: PILOT_ORG_ID, ownerUserId },
    exec,
  );
  await exec
    .update(entity)
    .set({
      name: "Pilot BJJ",
      timeZone: PILOT_TIME_ZONE,
      membershipEnforcedAt: new Date(),
    })
    .where(eq(entity.id, PILOT_ORG_ID));

  await exec
    .insert(membershipPolicy)
    .values({
      organizationId: PILOT_ORG_ID,
      graceDays: 7,
      calendarTimeZone: PILOT_TIME_ZONE,
      bankDetails:
        "Pilot Gym\nIBAN: PT50 0002 0123 1234 5678 9015 4\nRef: the reference on your membership",
    })
    .onConflictDoNothing();

  for (const branch of [
    { id: PILOT_GYM_ID, name: "Pilot Gym floor" },
    { id: PILOT_SAUNA_ID, name: "Pilot Sauna" },
  ]) {
    const already = await exec
      .select({ id: entity.id })
      .from(entity)
      .where(eq(entity.id, branch.id))
      .limit(1);
    if (already.length > 0) continue;
    // The id is passed in rather than renamed afterwards: `entity_membership`
    // holds a composite key to `entity`, so an id update would be refused the
    // moment the owner's membership exists.
    await createEntity(
      {
        organizationId: PILOT_ORG_ID,
        entityId: branch.id,
        type: "general_space",
        name: branch.name,
        ownerUserId,
        timeZone: "Europe/Lisbon",
      },
      exec,
    );
  }

  const plans = [
    {
      id: PLAN_ID.bjj,
      name: "BJJ Only",
      priceMinor: 5000,
      covers: [PILOT_ORG_ID],
    },
    {
      id: PLAN_ID.bjj_gym,
      name: "BJJ + Gym",
      priceMinor: 7000,
      covers: [PILOT_ORG_ID, PILOT_GYM_ID],
    },
    {
      id: PLAN_ID.gym_sauna,
      name: "Gym + Sauna",
      priceMinor: 6000,
      covers: [PILOT_GYM_ID, PILOT_SAUNA_ID],
    },
  ];
  const month = monthOf(new Date(), PILOT_TIME_ZONE);
  for (const plan of plans) {
    await exec
      .insert(accessPlan)
      .values({
        id: plan.id,
        organizationId: PILOT_ORG_ID,
        name: plan.name,
        priceMinor: plan.priceMinor,
        currency: "EUR",
      })
      .onConflictDoNothing();
    // A plan with no price for the month cannot be sold or assigned, so the
    // pilot would otherwise be three plans nobody can hold.
    await exec
      .insert(accessPlanPrice)
      .values({
        organizationId: PILOT_ORG_ID,
        planId: plan.id,
        effectiveMonth: month,
        priceMinor: plan.priceMinor,
        currency: "EUR",
        recordedBy: ownerUserId,
      })
      .onConflictDoNothing();
    await exec
      .insert(accessPlanEntity)
      .values(
        plan.covers.map((entityId) => ({
          organizationId: PILOT_ORG_ID,
          planId: plan.id,
          entityId,
        })),
      )
      .onConflictDoNothing();
  }

  const branches = await exec
    .select({ id: entity.id, name: entity.name, type: entity.type })
    .from(entity)
    .where(eq(entity.organizationId, PILOT_ORG_ID));

  return {
    organizationId: PILOT_ORG_ID,
    branches,
    plans,
  };
}
