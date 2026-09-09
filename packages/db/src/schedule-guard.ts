import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";

import type { SessionSpan } from "@matops/domain";
import { isGeneralSpace, sessionEnd } from "@matops/domain";

import type { DbExec } from "./client";
import type { TenantTx } from "./tenant";
import { entity } from "./entity-schema";
import { classInstance } from "./scheduling";

type Executor = DbExec | TenantTx;

/**
 * One bookable room per general branch (ADR 126, option (b) of step 2.5).
 *
 * Postgres cannot express "no two of THESE rows overlap" here: an exclusion
 * constraint needs `btree_gist`, which the PGlite test harness does not ship,
 * its predicate cannot reach another table to ask which branches are general
 * spaces, and `timestamptz + interval` is not immutable so there is no end time
 * to range over. So the rule is enforced in the transaction instead.
 *
 * KNOWN CEILING: this holds only while every writer goes through these helpers.
 * A constraint would hold against anything, including a hand-run `INSERT`. If
 * the schema ever gains a written `ends_at` and a per-row flag, replace this
 * with the real constraint.
 */

/** Is this branch a general space, and so limited to one session at a time? */
export async function isGeneralBranch(
  exec: Executor,
  academyId: string,
): Promise<boolean> {
  const rows = await exec
    .select({ type: entity.type })
    .from(entity)
    .where(eq(entity.id, academyId))
    .limit(1);
  return isGeneralSpace(rows[0]?.type ?? "");
}

/**
 * Hold this branch's schedule for the rest of the transaction.
 *
 * Two requests adding a session at the same minute would each read a clear
 * slot and each write, because a plain read is not a reservation. The lock
 * makes them queue, so the second one reads the first one's row and refuses.
 * `pg_advisory_xact_lock` releases on commit or rollback with no clean-up.
 */
export async function lockBranchSchedule(
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

/**
 * The live sessions of this branch that any of `spans` runs into.
 *
 * Reads only the window the proposed sessions actually touch, so a year of
 * schedule is never pulled in to place one class. Cancelled and deleted rows
 * are not in the way: the room is free again.
 */
export async function overlappingSessions(
  exec: Executor,
  academyId: string,
  spans: SessionSpan[],
): Promise<SessionSpan[]> {
  if (spans.length === 0) return [];
  const from = new Date(Math.min(...spans.map((s) => s.startsAt.getTime())));
  const to = new Date(Math.max(...spans.map((s) => sessionEnd(s).getTime())));
  // A session starting before the window can still run into it, so reach back
  // by the longest session the schema allows (600 minutes).
  const reachBack = new Date(from.getTime() - 600 * 60_000);

  const rows = await exec
    .select({
      id: classInstance.id,
      startsAt: classInstance.startsAt,
      durationMinutes: classInstance.durationMinutes,
      title: classInstance.title,
    })
    .from(classInstance)
    .where(
      and(
        eq(classInstance.academyId, academyId),
        eq(classInstance.status, "scheduled"),
        isNull(classInstance.deletedAt),
        gte(classInstance.startsAt, reachBack),
        lt(classInstance.startsAt, to),
      ),
    );
  return rows;
}
