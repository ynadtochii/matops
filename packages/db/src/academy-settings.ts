import { and, eq, isNull } from "drizzle-orm";

import type { DbExec } from "./client";
import type { DbReader } from "./tenant";
import { organization } from "./auth-schema";
import { academyProfile, entity } from "./entity-schema";

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
      academyId: entity.id,
      name: entity.name,
      code: entity.publicCode,
      timeZone: entity.timeZone,
      address: entity.address,
      mapUrl: entity.mapUrl,
      curriculumForStudents: academyProfile.curriculumForStudents,
    })
    .from(entity)
    .innerJoin(academyProfile, eq(academyProfile.entityId, entity.id))
    .where(and(eq(entity.id, academyId), isNull(entity.deletedAt)))
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
  const { curriculumForStudents, ...place } = next;
  if (Object.keys(place).length > 0) {
    await exec
      .update(entity)
      .set(place)
      .where(and(eq(entity.id, academyId), isNull(entity.deletedAt)));
  }
  if (curriculumForStudents !== undefined) {
    await exec
      .update(academyProfile)
      .set({ curriculumForStudents })
      .where(eq(academyProfile.entityId, academyId));
  }
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
