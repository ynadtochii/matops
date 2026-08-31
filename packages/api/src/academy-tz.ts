import type { TenantTx } from "@matops/db";
import { desc, eq, sql } from "@matops/db";
import { classTemplate, organization } from "@matops/db/schema";
import { resolveAcademyTimeZone } from "@matops/domain";

export { FALLBACK_TIME_ZONE as DEFAULT_TIME_ZONE } from "@matops/domain";

export interface TimeZoneCtx {
  db: TenantTx;
  academyId: string;
}

/** Everything a request needs off the academy row, in one read. */
export interface AcademyContext {
  timeZone: string;
  country: string | null;
  curriculumForStudents: boolean;
}

export async function academyContext(
  ctx: TimeZoneCtx,
): Promise<AcademyContext> {
  const [org] = await ctx.db
    .select({
      timeZone: organization.timeZone,
      country: organization.country,
      curriculumForStudents: organization.curriculumForStudents,
    })
    .from(organization)
    .where(eq(organization.id, ctx.academyId))
    .limit(1);
  const curriculumForStudents = org?.curriculumForStudents ?? false;
  const country = org?.country ?? null;
  if (org?.timeZone) {
    return {
      timeZone: resolveAcademyTimeZone(org.timeZone),
      country,
      curriculumForStudents,
    };
  }

  const [row] = await ctx.db
    .select({ timeZone: classTemplate.timeZone })
    .from(classTemplate)
    .groupBy(classTemplate.timeZone)
    .orderBy(desc(sql`count(*)`))
    .limit(1);
  return {
    timeZone: resolveAcademyTimeZone(null, row?.timeZone),
    country,
    curriculumForStudents,
  };
}

export async function academyTimeZone(ctx: TimeZoneCtx): Promise<string> {
  return (await academyContext(ctx)).timeZone;
}
