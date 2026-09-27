import type { TenantTx } from "@matops/db";
import { desc, eq, sql } from "@matops/db";
import { classTemplate, entity } from "@matops/db/schema";
import { resolveAcademyTimeZone } from "@matops/domain";

export interface TimeZoneCtx {
  db: TenantTx;
  academyId: string;
}

/** Everything a request needs off the academy row, in one read. */
interface AcademyContext {
  timeZone: string;
  country: string | null;
  bookingWindowDays: number;
  scheduleRevision: number;
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
    })
    .from(entity)
    .where(eq(entity.id, ctx.academyId))
    .limit(1);
  const country = org?.country ?? null;
  const bookingWindowDays = org?.bookingWindowDays ?? 7;
  const scheduleRevision = org?.scheduleRevision ?? 0;
  if (org?.timeZone) {
    return {
      timeZone: resolveAcademyTimeZone(org.timeZone),
      country,
      bookingWindowDays,
      scheduleRevision,
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
  };
}

export async function academyTimeZone(ctx: TimeZoneCtx): Promise<string> {
  return (await academyContext(ctx)).timeZone;
}
