import { eq, sql } from "drizzle-orm";

import type { DbExec } from "./client";
import type { TenantTx } from "./tenant";
import { entity } from "./entity-schema";

type Executor = DbExec | TenantTx;

/**
 * Hold this branch's schedule for the rest of the transaction.
 *
 * Two requests adding a session at the same minute would each read a clear
 * slot and each write, because a plain read is not a reservation. The lock
 * makes them queue, so the second one reads the first one's row and refuses.
 * `pg_advisory_xact_lock` releases on commit or rollback with no clean-up.
 */
async function lockBranchSchedule(
  exec: Executor,
  academyId: string,
): Promise<void> {
  await exec.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${academyId}))`);
}

export async function lockAndReadScheduleRevision(
  exec: Executor,
  academyId: string,
): Promise<number> {
  await lockBranchSchedule(exec, academyId);
  const [row] = await exec
    .select({ revision: entity.scheduleRevision })
    .from(entity)
    .where(eq(entity.id, academyId));
  if (!row) throw new Error("Branch schedule was not found");
  return row.revision;
}

export async function bumpScheduleRevision(
  exec: Executor,
  academyId: string,
): Promise<number> {
  const [row] = await exec
    .update(entity)
    .set({ scheduleRevision: sql`${entity.scheduleRevision} + 1` })
    .where(eq(entity.id, academyId))
    .returning({ revision: entity.scheduleRevision });
  if (!row) throw new Error("Branch schedule was not found");
  return row.revision;
}
