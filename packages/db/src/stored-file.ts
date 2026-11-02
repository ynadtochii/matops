import { and, eq, inArray, lt, sql } from "drizzle-orm";

import type { DbReader, DbWriter } from "./tenant";
import { entity, entityMembership } from "./entity-schema";
import { storedFile } from "./stored-file-schema";

export type StoredFileRow = typeof storedFile.$inferSelect;

export interface StoredObjectRef {
  id: string;
  objectKey: string;
}

export async function insertPendingFile(
  input: {
    id: string;
    academyId: string;
    uploadedBy: string;
    kind: string;
    objectKey: string;
    contentType: string;
    sizeBytes: number;
  },
  exec: DbWriter,
): Promise<void> {
  await exec.insert(storedFile).values(input);
}

export async function getStoredFile(
  input: { academyId: string; id: string },
  exec: DbReader,
): Promise<StoredFileRow | null> {
  const rows = await exec
    .select()
    .from(storedFile)
    .where(
      and(
        eq(storedFile.academyId, input.academyId),
        eq(storedFile.id, input.id),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function markFileReady(
  input: { academyId: string; id: string },
  exec: DbWriter,
): Promise<void> {
  await exec
    .update(storedFile)
    .set({ status: "ready" })
    .where(
      and(
        eq(storedFile.academyId, input.academyId),
        eq(storedFile.id, input.id),
        eq(storedFile.status, "pending"),
      ),
    );
}

export async function deleteStoredFiles(
  input: { academyId: string; ids: string[] },
  exec: DbWriter,
): Promise<string[]> {
  if (input.ids.length === 0) return [];
  const rows = await exec
    .delete(storedFile)
    .where(
      and(
        eq(storedFile.academyId, input.academyId),
        inArray(storedFile.id, input.ids),
      ),
    )
    .returning({ objectKey: storedFile.objectKey });
  return rows.map((row) => row.objectKey);
}

export async function stalePendingFiles(
  input: { academyId: string; before: Date },
  exec: DbReader,
): Promise<StoredObjectRef[]> {
  return exec
    .select({ id: storedFile.id, objectKey: storedFile.objectKey })
    .from(storedFile)
    .where(
      and(
        eq(storedFile.academyId, input.academyId),
        eq(storedFile.status, "pending"),
        lt(storedFile.createdAt, input.before),
      ),
    );
}

export async function expiredReceipts(
  input: { academyId: string; before: Date },
  exec: DbReader,
): Promise<StoredObjectRef[]> {
  return exec
    .select({ id: storedFile.id, objectKey: storedFile.objectKey })
    .from(storedFile)
    .where(
      and(
        eq(storedFile.academyId, input.academyId),
        eq(storedFile.kind, "payment_receipt"),
        lt(storedFile.createdAt, input.before),
      ),
    );
}

export async function academyStoredBytes(
  academyId: string,
  exec: DbReader,
): Promise<number> {
  const [row] = await exec
    .select({
      total:
        sql<number>`coalesce(sum(${storedFile.sizeBytes}), 0)::bigint`.mapWith(
          Number,
        ),
    })
    .from(storedFile)
    .where(eq(storedFile.academyId, academyId));
  return row?.total ?? 0;
}

export async function setMembershipAvatar(
  input: { membershipId: string; fileId: string | null },
  exec: DbWriter,
): Promise<string | null> {
  const [current] = await exec
    .select({ fileId: entityMembership.avatarFileId })
    .from(entityMembership)
    .where(eq(entityMembership.id, input.membershipId))
    .limit(1);
  if (!current) throw new Error("setMembershipAvatar: membership not found");
  await exec
    .update(entityMembership)
    .set({ avatarFileId: input.fileId })
    .where(eq(entityMembership.id, input.membershipId));
  return current.fileId;
}

export async function setEntityIcon(
  input: { entityId: string; fileId: string | null },
  exec: DbWriter,
): Promise<string | null> {
  const [current] = await exec
    .select({ fileId: entity.iconFileId })
    .from(entity)
    .where(eq(entity.id, input.entityId))
    .limit(1);
  if (!current) throw new Error("setEntityIcon: entity not found");
  await exec
    .update(entity)
    .set({ iconFileId: input.fileId })
    .where(eq(entity.id, input.entityId));
  return current.fileId;
}
