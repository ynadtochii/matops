import { TRPCError } from "@trpc/server";

import type { DbExec } from "@matops/db/client";
import { getMemberById } from "@matops/db";

/**
 * The one academy-membership guard (docs/issues/60). Five routers each kept a
 * private copy of "load the member, 404 if it is not mine"; the `member` table
 * carries no RLS policy, so this check is the ONLY thing scoping a member id to
 * the caller's academy. One copy means one place to get it right.
 */

/** A `member` row as the guard hands it back. */
export type MemberRecord = NonNullable<
  Awaited<ReturnType<typeof getMemberById>>
>;

/** The slice of a tenant context this guard needs. */
export interface MemberScope {
  academyId: string;
  baseDb: DbExec;
}

/**
 * Load a member by id and assert it belongs to the caller's academy. Throws
 * NOT_FOUND (never FORBIDDEN) for a foreign id, so a caller cannot probe which
 * member ids exist in other academies.
 */
export async function requireMember(
  ctx: MemberScope,
  memberId: string,
): Promise<MemberRecord> {
  const m = await getMemberById(memberId, ctx.baseDb);
  if (m?.academyId !== ctx.academyId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
  }
  return m;
}
