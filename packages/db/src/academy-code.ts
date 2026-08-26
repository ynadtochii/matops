import { randomInt } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import type { DbExec } from "./client";
import type { DbReader } from "./tenant";
import { organization } from "./auth-schema";

/**
 * Academy-code helpers (docs/issues/32). The code is the plain 6-digit number an
 * owner shares so a student can find + join the gym in the mobile app.
 *
 * All run on the BASE connection: the organization table carries no academy RLS
 * policy (like the Better Auth tables), and the mobile search resolves a code
 * with no active academy — the same shape as `resolveInviteToken`.
 */

// A 6-digit code, so the numeric range is [100000, 999999] (no leading zero).
const CODE_MIN = 100000;
const CODE_MAX = 999999;

/**
 * Allocate a unique 6-digit code. Retries on the rare collision against existing
 * codes; the unique index is the final backstop if two creates race. Uses crypto
 * `randomInt` for an even, non-guessable distribution.
 */
export async function generateAcademyCode(exec: DbExec): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = String(randomInt(CODE_MIN, CODE_MAX + 1));
    const clash = await exec
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.publicCode, code))
      .limit(1);
    if (!clash[0]) return code;
  }
  throw new Error("could not allocate a unique academy code after 50 tries");
}

/**
 * Resolve a shared code → the academy id + name, or null. Backs the mobile
 * `academy.findByCode` search; the caller then confirms and joins.
 */
export async function findAcademyByCode(
  code: string,
  exec: DbReader,
): Promise<{ academyId: string; name: string; address: string | null } | null> {
  const rows = await exec
    .select({
      academyId: organization.id,
      name: organization.name,
      address: organization.address,
    })
    .from(organization)
    .where(
      and(eq(organization.publicCode, code), isNull(organization.deletedAt)),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** The shared code for one academy (owner display on the web), or null. */
export async function getAcademyCode(
  academyId: string,
  exec: DbReader,
): Promise<string | null> {
  const rows = await exec
    .select({ code: organization.publicCode })
    .from(organization)
    .where(and(eq(organization.id, academyId), isNull(organization.deletedAt)))
    .limit(1);
  return rows[0]?.code ?? null;
}
