import type { TenantTx } from "@matops/db";
import { and, asc, eq, isNull, like, sql } from "@matops/db";
import { entityMembership, person } from "@matops/db/schema";
import { receptionSearchText } from "@matops/domain";

/**
 * One named person on a branch's roster, in the shape the shared booking and
 * check-in writes ask for (ADR 139).
 *
 * Reception and the staff desk both act on somebody who is not the caller, so
 * both resolve the target the same way: from the branch's own live roster,
 * inside the tenant transaction. Neither may take a person id on trust.
 */

/** The name with accents folded and case dropped, for search and comparison. */
export const searchableName = sql<string>`btrim(lower(regexp_replace(normalize(${person.name}, NFD), '[\u0300-\u036f]', '', 'g')))`;

export function eligibleBranchPerson(
  academyId: string,
  organizationId: string,
) {
  return and(
    eq(entityMembership.entityId, academyId),
    eq(entityMembership.organizationId, organizationId),
    eq(person.organizationId, organizationId),
    eq(entityMembership.status, "active"),
    isNull(person.archivedAt),
  );
}

export interface BranchPerson {
  personId: string;
  name: string;
  accountUserId: string | null;
  memberId: string;
  role: string;
  status: string;
  joinedAt: Date;
}

export async function findBranchPerson(
  db: TenantTx,
  scope: { academyId: string; organizationId: string },
  personId: string,
): Promise<BranchPerson | null> {
  const [found] = await db
    .select({
      personId: person.id,
      name: person.name,
      accountUserId: person.accountUserId,
      memberId: entityMembership.id,
      role: entityMembership.role,
      status: entityMembership.status,
      joinedAt:
        sql<Date>`coalesce(${entityMembership.joinedAt}, ${entityMembership.createdAt})`.mapWith(
          entityMembership.createdAt,
        ),
    })
    .from(person)
    .innerJoin(entityMembership, eq(entityMembership.personId, person.id))
    .where(
      and(
        eligibleBranchPerson(scope.academyId, scope.organizationId),
        eq(person.id, personId),
      ),
    )
    .limit(1);
  return found ?? null;
}

export async function searchBranchPeople(
  db: TenantTx,
  scope: { academyId: string; organizationId: string },
  query: string,
  limit: number,
): Promise<Pick<BranchPerson, "personId" | "name" | "role">[]> {
  const pattern = `%${receptionSearchText(query).replace(/[\\%_]/g, "\\$&")}%`;
  return db
    .select({
      personId: person.id,
      name: person.name,
      role: entityMembership.role,
    })
    .from(person)
    .innerJoin(entityMembership, eq(entityMembership.personId, person.id))
    .where(
      and(
        eligibleBranchPerson(scope.academyId, scope.organizationId),
        like(searchableName, pattern),
      ),
    )
    .orderBy(asc(person.name), asc(person.id))
    .limit(limit);
}

/** How many people on this branch answer to that exact name. */
export async function countBranchNamesakes(
  db: TenantTx,
  scope: { academyId: string; organizationId: string },
  name: string,
): Promise<number> {
  const rows = await db
    .select({ id: person.id })
    .from(person)
    .innerJoin(entityMembership, eq(entityMembership.personId, person.id))
    .where(
      and(
        eligibleBranchPerson(scope.academyId, scope.organizationId),
        eq(searchableName, receptionSearchText(name)),
      ),
    )
    .limit(2);
  return rows.length;
}
