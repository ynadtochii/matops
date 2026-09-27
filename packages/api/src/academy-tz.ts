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
  signupHealthQuestion: boolean;
  waiverRequired: boolean;
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
      signupHealthQuestion: entity.signupHealthQuestion,
      waiverRequired: entity.waiverRequired,
    })
    .from(entity)
    .where(eq(entity.id, ctx.academyId))
    .limit(1);
  const rest = {
    country: org?.country ?? null,
    bookingWindowDays: org?.bookingWindowDays ?? 7,
    scheduleRevision: org?.scheduleRevision ?? 0,
    signupHealthQuestion: org?.signupHealthQuestion ?? false,
    waiverRequired: org?.waiverRequired ?? false,
  };
  if (org?.timeZone) {
    return { timeZone: resolveAcademyTimeZone(org.timeZone), ...rest };
  }

  const [row] = await ctx.db
    .select({ timeZone: classTemplate.timeZone })
    .from(classTemplate)
    .groupBy(classTemplate.timeZone)
    .orderBy(desc(sql`count(*)`))
    .limit(1);
  return { timeZone: resolveAcademyTimeZone(null, row?.timeZone), ...rest };
}

export async function academyTimeZone(ctx: TimeZoneCtx): Promise<string> {
  return (await academyContext(ctx)).timeZone;
}
