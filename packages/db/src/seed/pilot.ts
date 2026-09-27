import { eq } from "drizzle-orm";

import type { SeedExec } from "./registry";
import { provisionOrganization } from "../provision";
import { entity, member, organization } from "../schema";
import { SEED_MARKER, seedMemberId } from "./registry";

/**
 * Idempotent: every insert either names a deterministic id or does nothing on
 * conflict, so running it twice changes nothing. `seed down` removes it, since
 * its ids carry the seed marker and teardown deletes by organization.
 */
const PILOT_ORG_ID = `${SEED_MARKER}org_pilot`;

const PILOT_TIME_ZONE = "Europe/Lisbon";

interface PilotReport {
  organizationId: string;
  academy: { id: string; name: string; timeZone: string | null };
}

export async function seedPilot(
  exec: SeedExec,
  ownerUserId: string,
): Promise<PilotReport> {
  await exec
    .insert(organization)
    .values({
      id: PILOT_ORG_ID,
      name: "Pilot BJJ",
      slug: "seed-pilot-gym",
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  // A linked person requires an organization member in the same gym.
  await exec
    .insert(member)
    .values({
      id: seedMemberId("pilot", "owner"),
      organizationId: PILOT_ORG_ID,
      userId: ownerUserId,
      role: "owner",
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: [member.organizationId, member.userId] });

  // The default branch takes the organization's own id (ADR 124), so the BJJ
  // academy is provisioned rather than created.
  await provisionOrganization(
    { organizationId: PILOT_ORG_ID, ownerUserId },
    exec,
  );
  const [academy] = await exec
    .update(entity)
    .set({
      name: "Pilot BJJ",
      timeZone: PILOT_TIME_ZONE,
    })
    .where(eq(entity.id, PILOT_ORG_ID))
    .returning({ id: entity.id, name: entity.name, timeZone: entity.timeZone });
  if (!academy) throw new Error("The pilot academy was not provisioned.");

  return { organizationId: PILOT_ORG_ID, academy };
}
