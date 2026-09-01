import { and, eq, isNull } from "drizzle-orm";

import type { DbExec } from "./client";
import type { DbReader } from "./tenant";
import { organization } from "./auth-schema";
import { entity } from "./entity-schema";

export interface AcademySettings {
  academyId: string;
  name: string;
  code: string;
  timeZone: string | null;
  address: string | null;
  mapUrl: string | null;
  curriculumForStudents: boolean;
}

export async function getAcademySettings(
  academyId: string,
  exec: DbReader,
): Promise<AcademySettings | null> {
  const rows = await exec
    .select({
      academyId: organization.id,
      name: organization.name,
      code: organization.publicCode,
      timeZone: organization.timeZone,
      address: organization.address,
      mapUrl: organization.mapUrl,
      curriculumForStudents: organization.curriculumForStudents,
    })
    .from(organization)
    .where(and(eq(organization.id, academyId), isNull(organization.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateAcademySettings(
  academyId: string,
  patch: {
    timeZone?: string;
    country?: string;
    address?: string;
    mapUrl?: string;
    curriculumForStudents?: boolean;
  },
  exec: DbExec,
): Promise<void> {
  const next: {
    timeZone?: string;
    country?: string | null;
    address?: string | null;
    mapUrl?: string | null;
    curriculumForStudents?: boolean;
  } = {};
  if (patch.timeZone !== undefined) next.timeZone = patch.timeZone;
  if (patch.country !== undefined) next.country = patch.country || null;
  if (patch.address !== undefined) next.address = patch.address || null;
  if (patch.mapUrl !== undefined) next.mapUrl = patch.mapUrl.trim() || null;
  if (patch.curriculumForStudents !== undefined)
    next.curriculumForStudents = patch.curriculumForStudents;
  if (Object.keys(next).length === 0) return;
  await exec
    .update(organization)
    .set(next)
    .where(and(eq(organization.id, academyId), isNull(organization.deletedAt)));
}

/**
 * Close the gym. Every entity it runs goes with it, in the same transaction:
 * an entity is where the classes, the codes and the booking links live, so
 * leaving one behind would keep the gym findable by code after its owner said
 * to delete it.
 */
export async function softDeleteAcademy(
  academyId: string,
  exec: DbExec,
): Promise<boolean> {
  return exec.transaction(async (tx) => {
    const rows = await tx
      .update(organization)
      .set({ deletedAt: new Date() })
      .where(
        and(eq(organization.id, academyId), isNull(organization.deletedAt)),
      )
      .returning({ id: organization.id });
    if (rows.length === 0) return false;
    await tx
      .update(entity)
      .set({ deletedAt: new Date() })
      .where(
        and(eq(entity.organizationId, academyId), isNull(entity.deletedAt)),
      );
    return true;
  });
}
