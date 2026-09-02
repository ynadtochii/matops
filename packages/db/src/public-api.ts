import { randomBytes } from "node:crypto";
import { and, asc, eq, gte, isNull, lt } from "drizzle-orm";

import type { DbExec } from "./client";
import type { DbReader } from "./tenant";
import { academyProfile, entity } from "./entity-schema";
import { classInstance } from "./scheduling";

/**
 * Public booking API helpers (ADR 115). Every function here runs on the BASE
 * connection: the caller has no session and no academy scope, so there is no
 * tenant transaction to run inside. This is the SECOND enumerated exception to
 * the tenant seam, with the drop-in submit as its precedent (docs/issues/12,
 * 25). Each function is pinned to an academy id the key already resolved.
 *
 * The class reads select the published columns and nothing else, so the deny
 * list in the plan is enforced by the query rather than by a mapping step
 * somebody can forget.
 *
 * The academy is an `entity` and its switch, key and allowed origins live on
 * its `academy_profile` (ADR 124). A gym with two mats publishes two booking
 * links, each with its own key, because each is its own place.
 */

export interface PublicApiAcademy {
  academyId: string;
  name: string;
  timeZone: string | null;
  country: string | null;
  address: string | null;
  mapUrl: string | null;
  publicCode: string;
  origins: string[];
  enabled: boolean;
}

/**
 * A publishable key. It ships inside a browser page, so it is not a secret: it
 * names the academy, can be revoked, and carries the per-academy limits. The
 * prefix makes one recognisable in a log or a support ticket.
 */
export function newPublicApiKey(): string {
  return `mk_pub_${randomBytes(24).toString("base64url")}`;
}

const academyCols = {
  academyId: entity.id,
  name: entity.name,
  timeZone: entity.timeZone,
  country: entity.country,
  address: entity.address,
  mapUrl: entity.mapUrl,
  publicCode: entity.publicCode,
  origins: academyProfile.publicApiOrigins,
  enabled: academyProfile.publicBookingEnabled,
};

function toAcademy(row: {
  academyId: string;
  name: string;
  timeZone: string | null;
  country: string | null;
  address: string | null;
  mapUrl: string | null;
  publicCode: string;
  origins: string[] | null;
  enabled: boolean;
}): PublicApiAcademy {
  return { ...row, origins: row.origins ?? [] };
}

/**
 * The academy a key belongs to, or null when the key is unknown. A key on a
 * deleted academy is unknown. The master switch comes back on the row rather
 * than filtering the query, so a gym that paused answers "switched off" instead
 * of "bad key" and the integrator knows which one to fix.
 */
export async function resolvePublicApiKey(
  key: string,
  exec: DbReader,
): Promise<PublicApiAcademy | null> {
  const rows = await exec
    .select(academyCols)
    .from(academyProfile)
    .innerJoin(entity, eq(entity.id, academyProfile.entityId))
    .where(and(eq(academyProfile.publicApiKey, key), isNull(entity.deletedAt)))
    .limit(1);
  const row = rows[0];
  return row ? toAcademy(row) : null;
}

/** The same academy by its 6-digit code, for the shared `/book/<code>` page. */
export async function findPublicAcademyByCode(
  code: string,
  exec: DbReader,
): Promise<(PublicApiAcademy & { apiKey: string }) | null> {
  const rows = await exec
    .select({ ...academyCols, apiKey: academyProfile.publicApiKey })
    .from(entity)
    .innerJoin(academyProfile, eq(academyProfile.entityId, entity.id))
    .where(
      and(
        eq(entity.publicCode, code),
        eq(academyProfile.publicBookingEnabled, true),
        isNull(entity.deletedAt),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row?.apiKey) return null;
  return { ...toAcademy(row), apiKey: row.apiKey };
}

export interface PublicApiSettings {
  enabled: boolean;
  apiKey: string | null;
  origins: string[];
  publicCode: string;
}

export async function getPublicApiSettings(
  academyId: string,
  exec: DbReader,
): Promise<PublicApiSettings | null> {
  const rows = await exec
    .select({
      enabled: academyProfile.publicBookingEnabled,
      apiKey: academyProfile.publicApiKey,
      origins: academyProfile.publicApiOrigins,
      publicCode: entity.publicCode,
    })
    .from(entity)
    .innerJoin(academyProfile, eq(academyProfile.entityId, entity.id))
    .where(and(eq(entity.id, academyId), isNull(entity.deletedAt)))
    .limit(1);
  const row = rows[0];
  return row ? { ...row, origins: row.origins ?? [] } : null;
}

/**
 * Turn the public surface on or off, and mint the key the first time it goes
 * on. Switching off keeps the key: the owner may be pausing for a week, and a
 * paused gym that comes back should not have to re-paste a key into its site.
 */
export async function setPublicApiEnabled(
  academyId: string,
  enabled: boolean,
  exec: DbExec,
): Promise<PublicApiSettings | null> {
  const current = await getPublicApiSettings(academyId, exec);
  if (!current) return null;
  const apiKey = enabled
    ? (current.apiKey ?? newPublicApiKey())
    : current.apiKey;
  await exec
    .update(academyProfile)
    .set({ publicBookingEnabled: enabled, publicApiKey: apiKey })
    .where(eq(academyProfile.entityId, academyId));
  return { ...current, enabled, apiKey };
}

/** Rotate the key: the old one stops working the moment this commits. */
export async function rotatePublicApiKey(
  academyId: string,
  exec: DbExec,
): Promise<string> {
  const apiKey = newPublicApiKey();
  await exec
    .update(academyProfile)
    .set({ publicApiKey: apiKey })
    .where(eq(academyProfile.entityId, academyId));
  return apiKey;
}

export async function setPublicApiOrigins(
  academyId: string,
  origins: string[],
  exec: DbExec,
): Promise<void> {
  await exec
    .update(academyProfile)
    .set({ publicApiOrigins: origins })
    .where(eq(academyProfile.entityId, academyId));
}

export interface PublicClass {
  id: string;
  title: string;
  discipline: string | null;
  startsAt: Date;
  durationMinutes: number;
}

const publicClassCols = {
  id: classInstance.id,
  title: classInstance.title,
  discipline: classInstance.discipline,
  startsAt: classInstance.startsAt,
  durationMinutes: classInstance.durationMinutes,
};

/** The academy's PUBLISHED, scheduled, live classes in a window. */
export async function listPublicClasses(
  academyId: string,
  from: Date,
  to: Date,
  limit: number,
  exec: DbReader,
): Promise<PublicClass[]> {
  return exec
    .select(publicClassCols)
    .from(classInstance)
    .where(
      and(
        eq(classInstance.academyId, academyId),
        eq(classInstance.publicBookable, true),
        eq(classInstance.status, "scheduled"),
        isNull(classInstance.deletedAt),
        gte(classInstance.startsAt, from),
        lt(classInstance.startsAt, to),
      ),
    )
    .orderBy(asc(classInstance.startsAt))
    .limit(limit);
}

export type PublicClassLookup =
  { found: false } | { found: true; cancelled: boolean; cls: PublicClass };

/**
 * One published class, for the booking write. An unpublished, deleted or
 * unknown id is `found: false`, which the endpoint answers with a 404 — never a
 * 403, so the API cannot be used to confirm that a private class exists. A
 * class the owner cancelled after the page loaded is a separate answer, because
 * the person is looking at a real class that has just gone.
 */
export async function getPublicClass(
  academyId: string,
  classId: string,
  exec: DbReader,
): Promise<PublicClassLookup> {
  const rows = await exec
    .select({ ...publicClassCols, status: classInstance.status })
    .from(classInstance)
    .where(
      and(
        eq(classInstance.id, classId),
        eq(classInstance.academyId, academyId),
        eq(classInstance.publicBookable, true),
        isNull(classInstance.deletedAt),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return { found: false };
  const { status, ...cls } = row;
  return { found: true, cancelled: status === "cancelled", cls };
}
