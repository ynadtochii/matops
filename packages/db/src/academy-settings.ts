import { and, eq, isNull } from "drizzle-orm";

import type { DbExec } from "./client";
import type { DbReader } from "./tenant";
import { organization } from "./auth-schema";
import { db } from "./client";

export interface AcademySettings {
  academyId: string;
  name: string;
  code: string;
  timeZone: string | null;
  address: string | null;
  mapUrl: string | null;
}

export async function getAcademySettings(
  academyId: string,
  exec: DbReader = db,
): Promise<AcademySettings | null> {
  const rows = await exec
    .select({
      academyId: organization.id,
      name: organization.name,
      code: organization.publicCode,
      timeZone: organization.timeZone,
      address: organization.address,
      mapUrl: organization.mapUrl,
    })
    .from(organization)
    .where(and(eq(organization.id, academyId), isNull(organization.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateAcademySettings(
  academyId: string,
  patch: { timeZone?: string; address?: string; mapUrl?: string },
  exec: DbExec = db,
): Promise<void> {
  const next: {
    timeZone?: string;
    address?: string | null;
    mapUrl?: string | null;
  } = {};
  if (patch.timeZone !== undefined) next.timeZone = patch.timeZone;
  if (patch.address !== undefined) next.address = patch.address || null;
  if (patch.mapUrl !== undefined) next.mapUrl = patch.mapUrl.trim() || null;
  if (Object.keys(next).length === 0) return;
  await exec
    .update(organization)
    .set(next)
    .where(and(eq(organization.id, academyId), isNull(organization.deletedAt)));
}

export async function softDeleteAcademy(
  academyId: string,
  exec: DbExec = db,
): Promise<boolean> {
  const rows = await exec
    .update(organization)
    .set({ deletedAt: new Date() })
    .where(and(eq(organization.id, academyId), isNull(organization.deletedAt)))
    .returning({ id: organization.id });
  return rows.length > 0;
}
