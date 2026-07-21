import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";

import { organization } from "./auth-schema";
import { db } from "./client";

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
export async function generateAcademyCode(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = String(randomInt(CODE_MIN, CODE_MAX + 1));
    const clash = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.publicCode, code))
      .limit(1);
    if (!clash[0]) return code;
  }
  throw new Error("could not allocate a unique academy code after 50 tries");
}

/**
 * Allocate a code and persist it on a freshly created academy. Called from the
 * auth `afterCreateOrganization` hook, so a new gym has a shareable code at once.
 */
export async function assignAcademyCode(academyId: string): Promise<string> {
  const code = await generateAcademyCode();
  await db
    .update(organization)
    .set({ publicCode: code })
    .where(eq(organization.id, academyId));
  return code;
}

/**
 * Resolve a shared code → the academy id + name, or null. Backs the mobile
 * `academy.findByCode` search; the caller then confirms and joins.
 */
export async function findAcademyByCode(
  code: string,
): Promise<{ academyId: string; name: string } | null> {
  const rows = await db
    .select({ academyId: organization.id, name: organization.name })
    .from(organization)
    .where(eq(organization.publicCode, code))
    .limit(1);
  return rows[0] ?? null;
}

/** The shared code for one academy (owner display on the web), or null. */
export async function getAcademyCode(
  academyId: string,
): Promise<string | null> {
  const rows = await db
    .select({ code: organization.publicCode })
    .from(organization)
    .where(eq(organization.id, academyId))
    .limit(1);
  return rows[0]?.code ?? null;
}
