import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import type { DbExec } from "./client";
import type { LiveLinkTable } from "./drop-in-link-schema";
import type { DbReader } from "./tenant";

export interface LiveLinkRow {
  token: string;
  createdAt: Date;
}

function newLinkToken(): string {
  return randomBytes(18).toString("base64url");
}

function linkCols(table: LiveLinkTable) {
  return { token: table.token, createdAt: table.createdAt };
}

export async function getLiveLink(
  table: LiveLinkTable,
  academyId: string,
  exec: DbReader,
): Promise<LiveLinkRow | null> {
  const rows = await exec
    .select(linkCols(table))
    .from(table)
    .where(and(eq(table.academyId, academyId), isNull(table.revokedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function rotateLiveLink(
  table: LiveLinkTable,
  input: { academyId: string; createdBy: string },
  exec: DbExec,
): Promise<LiveLinkRow> {
  return exec.transaction(async (tx) => {
    await tx
      .update(table)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(table.academyId, input.academyId), isNull(table.revokedAt)),
      );
    const [row] = await tx
      .insert(table)
      .values({
        academyId: input.academyId,
        token: newLinkToken(),
        createdBy: input.createdBy,
      })
      .returning(linkCols(table));
    if (!row) throw new Error("live link insert returned no row");
    return row;
  });
}

export async function getOrCreateLiveLink(
  table: LiveLinkTable,
  input: { academyId: string; createdBy: string },
  exec: DbExec,
): Promise<LiveLinkRow> {
  const live = await getLiveLink(table, input.academyId, exec);
  if (live) return live;
  await exec
    .insert(table)
    .values({
      academyId: input.academyId,
      token: newLinkToken(),
      createdBy: input.createdBy,
    })
    .onConflictDoNothing();
  const row = await getLiveLink(table, input.academyId, exec);
  if (!row) throw new Error("live link was not created");
  return row;
}
