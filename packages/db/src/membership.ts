import { and, eq } from "drizzle-orm";

import { member } from "./auth-schema";
import { db } from "./client";

export interface Membership {
  /** Better Auth role on the member row: "owner" | "instructor" | "student". */
  role: string;
  /** "pending" until an owner approves, then "active" (docs/issues/20, 23). */
  status: string;
}

/**
 * Look up the caller's membership in one academy. Reads Better Auth's `member`
 * table with the base connection (that table has no RLS policy — RLS is only on
 * our domain tables, see docs/issues/12), scoped explicitly by user + academy.
 * Returns null if the user is not a member of that academy.
 */
export async function getMembership(
  userId: string,
  academyId: string,
): Promise<Membership | null> {
  const rows = await db
    .select({ role: member.role, status: member.status })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, academyId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { role: row.role, status: row.status ?? "pending" };
}
