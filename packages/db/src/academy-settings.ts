import { and, eq, isNull, sql } from "drizzle-orm";

import type { DbExec } from "./client";
import type { DbReader, DbWriter } from "./tenant";
import { organization } from "./auth-schema";
import { academyProfile, entity } from "./entity-schema";

export interface AcademySettings {
  academyId: string;
  name: string;
  code: string;
  timeZone: string | null;
  address: string | null;
  mapUrl: string | null;
  bookingWindowDays: number;
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
      bookingWindowDays: entity.bookingWindowDays,
      curriculumForStudents: sql<boolean>`coalesce(${academyProfile.curriculumForStudents}, false)`,
    })
    .from(entity)
    .leftJoin(academyProfile, eq(academyProfile.entityId, entity.id))
    .where(and(eq(entity.id, academyId), isNull(entity.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateAcademySettings(
  academyId: string,
  patch: {
    name?: string;
    timeZone?: string;
    country?: string;
    address?: string;
    mapUrl?: string;
    bookingWindowDays?: number;
    curriculumForStudents?: boolean;
  },
  exec: DbWriter,
): Promise<void> {
  const next: {
    name?: string;
    timeZone?: string;
    country?: string | null;
    address?: string | null;
    mapUrl?: string | null;
    bookingWindowDays?: number;
    curriculumForStudents?: boolean;
  } = {};
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.timeZone !== undefined) next.timeZone = patch.timeZone;
  if (patch.country !== undefined) next.country = patch.country || null;
  if (patch.address !== undefined) next.address = patch.address || null;
  if (patch.mapUrl !== undefined) next.mapUrl = patch.mapUrl.trim() || null;
  if (patch.bookingWindowDays !== undefined)
    next.bookingWindowDays = patch.bookingWindowDays;
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
 * Close one academy (ADR 68, entity-scoped by ADR 124).
 *
 * The named ENTITY is what closes, so a gym running two mats can shut one and
 * keep the other's classes, roster and join code working. The organization
 * follows only when that was its last live entity: an owner group with no place
 * to run classes is a closed gym, and leaving it open would keep an owner
 * signed in to nothing.
 */
export async function softDeleteAcademy(
  entityId: string,
  exec: DbExec,
): Promise<boolean> {
  return exec.transaction(async (tx) => {
    const targets = await tx
      .select({ organizationId: entity.organizationId })
      .from(entity)
      .where(and(eq(entity.id, entityId), isNull(entity.deletedAt)))
      .limit(1);
    const organizationId = targets[0]?.organizationId;
    if (!organizationId) return false;

    const locked = await tx
      .select({ id: organization.id })
      .from(organization)
      .where(
        and(
          eq(organization.id, organizationId),
          isNull(organization.deletedAt),
        ),
      )
      .for("update");
    if (locked.length === 0) return false;

    const closedAt = new Date();
    const closed = await tx
      .update(entity)
      .set({ deletedAt: closedAt })
      .where(
        and(
          eq(entity.id, entityId),
          eq(entity.organizationId, organizationId),
          isNull(entity.deletedAt),
        ),
      )
      .returning({ id: entity.id });
    if (closed.length === 0) return false;

    const live = await tx
      .select({ id: entity.id })
      .from(entity)
      .where(
        and(
          eq(entity.organizationId, organizationId),
          isNull(entity.deletedAt),
        ),
      )
      .limit(1);
    if (live.length === 0) {
      await tx
        .update(organization)
        .set({ deletedAt: closedAt })
        .where(
          and(
            eq(organization.id, organizationId),
            isNull(organization.deletedAt),
          ),
        );
    }
    return true;
  });
}
