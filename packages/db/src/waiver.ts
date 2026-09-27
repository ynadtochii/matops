import { desc, eq } from "drizzle-orm";

import type { DbReader, DbWriter } from "./tenant";
import { academyWaiver } from "./waiver-schema";

interface WaiverVersion {
  id: string;
  body: string;
  createdAt: Date;
}

export async function currentWaiver(
  academyId: string,
  exec: DbReader,
): Promise<WaiverVersion | null> {
  const rows = await exec
    .select({
      id: academyWaiver.id,
      body: academyWaiver.body,
      createdAt: academyWaiver.createdAt,
    })
    .from(academyWaiver)
    .where(eq(academyWaiver.academyId, academyId))
    .orderBy(desc(academyWaiver.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveWaiverVersion(
  input: { academyId: string; body: string; createdBy: string },
  exec: DbWriter,
): Promise<void> {
  const latest = await currentWaiver(input.academyId, exec);
  if (latest?.body !== input.body) {
    await exec.insert(academyWaiver).values(input);
  }
}
