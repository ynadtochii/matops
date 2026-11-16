import type { TenantTx } from "@matops/db";
import { eq, academyTimeZone as resolveZone } from "@matops/db";
import { entity } from "@matops/db/schema";

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
  return {
    timeZone: await resolveZone(ctx.academyId, org?.timeZone ?? null, ctx.db),
    ...rest,
  };
}

export async function academyTimeZone(ctx: TimeZoneCtx): Promise<string> {
  return (await academyContext(ctx)).timeZone;
}
