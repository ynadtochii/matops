import { and, eq, isNull } from "drizzle-orm";

import { resolveAcademyTimeZone } from "@matops/domain";

import type { DbExec } from "./client";
import type { LiveLinkRow } from "./live-link";
import type { DbReader } from "./tenant";
import { deskLink } from "./drop-in-link-schema";
import { entity } from "./entity-schema";
import { getOrCreateLiveLink, rotateLiveLink } from "./live-link";
import { storedFile } from "./stored-file-schema";

export function getOrCreateDeskLink(
  input: { academyId: string; createdBy: string },
  exec: DbExec,
): Promise<LiveLinkRow> {
  return getOrCreateLiveLink(deskLink, input, exec);
}

export function rotateDeskLink(
  input: { academyId: string; createdBy: string },
  exec: DbExec,
): Promise<LiveLinkRow> {
  return rotateLiveLink(deskLink, input, exec);
}

export interface DeskAcademy {
  id: string;
  organizationId: string;
  name: string;
  timeZone: string;
  membershipEnforcedAt: Date | null;
  iconKey: string | null;
}

export async function resolveDeskLink(
  token: string,
  exec: DbReader,
): Promise<DeskAcademy | null> {
  const [row] = await exec
    .select({
      id: entity.id,
      organizationId: entity.organizationId,
      name: entity.name,
      timeZone: entity.timeZone,
      membershipEnforcedAt: entity.membershipEnforcedAt,
      iconKey: storedFile.objectKey,
    })
    .from(deskLink)
    .innerJoin(entity, eq(deskLink.academyId, entity.id))
    .leftJoin(storedFile, eq(storedFile.id, entity.iconFileId))
    .where(
      and(
        eq(deskLink.token, token),
        isNull(deskLink.revokedAt),
        eq(entity.status, "active"),
        isNull(entity.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  return { ...row, timeZone: resolveAcademyTimeZone(row.timeZone) };
}
