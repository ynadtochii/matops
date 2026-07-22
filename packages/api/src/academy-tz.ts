import type { TenantTx } from "@matops/db";
import { desc, sql } from "@matops/db";
import { classTemplate } from "@matops/db/schema";

/**
 * Fallback zone for an academy that has no templates to borrow one from — a
 * brand-new gym, or one running only one-off classes. Stats week/month
 * boundaries then fall to UTC, which is deterministic and harmless.
 */
export const DEFAULT_TIME_ZONE = "UTC";

/**
 * A representative IANA time zone for the active academy (v1.2 stats — ADR 39).
 *
 * The academy zone is not stored on `organization` or on a `class` row; it lives
 * only on `class_template.time_zone`, which every template copies from the
 * academy default (ADR 08/16). So we read it back from the templates and pick
 * the most-used one. `tx` is the RLS-scoped transaction, so this only ever sees
 * the caller's academy.
 */
export async function academyTimeZone(tx: TenantTx): Promise<string> {
  const [row] = await tx
    .select({ timeZone: classTemplate.timeZone })
    .from(classTemplate)
    .groupBy(classTemplate.timeZone)
    .orderBy(desc(sql`count(*)`))
    .limit(1);
  return row?.timeZone ?? DEFAULT_TIME_ZONE;
}
