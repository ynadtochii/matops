import type { DbExec } from "@matops/db";
import { listEntitiesOf, withScope } from "@matops/db";

/**
 * Every live branch of one organization, name-ordered by the loader.
 *
 * Its own organization-scoped read, so the caller can then open one entity
 * scope per branch: that is the shape every organization read takes (ADR 124),
 * and there is no mode where one query sees two branches at once.
 */
export async function readOrganizationEntities(
  organizationId: string,
  baseDb: DbExec,
): Promise<{ id: string; name: string; membershipEnforcedAt: Date | null }[]> {
  return withScope(
    { organizationId },
    async (tx) => {
      const rows = await listEntitiesOf(organizationId, tx);
      return rows.map((e) => ({
        id: e.id,
        name: e.name,
        membershipEnforcedAt: e.membershipEnforcedAt,
      }));
    },
    baseDb,
  );
}
