import { TRPCError } from "@trpc/server";

import type { TenantTx } from "@matops/db";
import { and, eq } from "@matops/db";
import { academyDiscipline } from "@matops/db/schema";

export async function requireCatalogDiscipline(
  db: TenantTx,
  academyId: string,
  name: string | null | undefined,
): Promise<void> {
  if (name == null) return;
  const [row] = await db
    .select({ id: academyDiscipline.id })
    .from(academyDiscipline)
    .where(
      and(
        eq(academyDiscipline.academyId, academyId),
        eq(academyDiscipline.name, name),
      ),
    )
    .limit(1);
  if (!row) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose a discipline from this academy's list.",
    });
  }
}
