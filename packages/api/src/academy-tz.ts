import type { TenantTx } from "@matops/db";
import { desc, eq, sql } from "@matops/db";
import { classTemplate, organization } from "@matops/db/schema";
import { resolveAcademyTimeZone } from "@matops/domain";

export { FALLBACK_TIME_ZONE as DEFAULT_TIME_ZONE } from "@matops/domain";

export interface TimeZoneCtx {
  db: TenantTx;
  academyId: string;
}

export async function academyTimeZone(ctx: TimeZoneCtx): Promise<string> {
  const [org] = await ctx.db
    .select({ timeZone: organization.timeZone })
    .from(organization)
    .where(eq(organization.id, ctx.academyId))
    .limit(1);
  if (org?.timeZone) return resolveAcademyTimeZone(org.timeZone);

  const [row] = await ctx.db
    .select({ timeZone: classTemplate.timeZone })
    .from(classTemplate)
    .groupBy(classTemplate.timeZone)
    .orderBy(desc(sql`count(*)`))
    .limit(1);
  return resolveAcademyTimeZone(null, row?.timeZone);
}
