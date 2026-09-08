import type { TenantTx } from "@matops/db";
import { desc, eq, sql } from "@matops/db";
import { academyProfile, classTemplate, entity } from "@matops/db/schema";
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
  bookingWindowDays: number;
  scheduleRevision: number;
  curriculumForStudents: boolean;
}

export async function academyContext(
  ctx: TimeZoneCtx,
): Promise<AcademyContext> {
  const [org] = await ctx.db
    .select({
      timeZone: entity.timeZone,
      country: entity.country,
      bookingWindowDays: entity.bookingWindowDays,
      scheduleRevision: entity.scheduleRevision,
      curriculumForStudents: sql<boolean>`coalesce(${academyProfile.curriculumForStudents}, false)`,
    })
    .from(entity)
    .leftJoin(academyProfile, eq(academyProfile.entityId, entity.id))
    .where(eq(entity.id, ctx.academyId))
    .limit(1);
  const curriculumForStudents = org?.curriculumForStudents ?? false;
  const country = org?.country ?? null;
  const bookingWindowDays = org?.bookingWindowDays ?? 7;
  const scheduleRevision = org?.scheduleRevision ?? 0;
  if (org?.timeZone) {
    return {
      timeZone: resolveAcademyTimeZone(org.timeZone),
      country,
      bookingWindowDays,
      scheduleRevision,
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
    bookingWindowDays,
    scheduleRevision,
    curriculumForStudents,
  };
}

export async function academyTimeZone(ctx: TimeZoneCtx): Promise<string> {
  return (await academyContext(ctx)).timeZone;
}
