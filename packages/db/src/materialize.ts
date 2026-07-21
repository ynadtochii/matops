import { and, asc, eq, isNull, lt } from "drizzle-orm";

import {
  computeOccurrences,
  MATERIALIZATION_HORIZON_DAYS,
} from "@matops/domain";

import { db } from "./client";
import { classInstance, classTemplate } from "./scheduling";

/**
 * Class materialization (docs/issues/16). Turns recurring templates into concrete
 * `class` rows. PURE occurrence math lives in `@matops/domain`; this module does
 * the IO (insert + advance the cursor).
 *
 * Two callers, one function:
 *  - LAZY (in-request, slice 2.1/2.2): the template router runs it on the
 *    RLS-scoped `ctx.db` right after a create/edit, so classes appear at once.
 *  - CRON (daily, this module's sweep): runs cross-academy on the base `db`
 *    connection (the trusted service role, outside the tenant seam), extending
 *    every active template's horizon.
 *
 * Idempotent: `UNIQUE(template_id, starts_at)` + `onConflictDoNothing` make
 * re-runs safe; `generated_until` is the resume cursor.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A drizzle handle — the base `db` OR a per-request tenant transaction. */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

type Template = typeof classTemplate.$inferSelect;

export interface MaterializeOptions {
  /** "Now" — injected so callers/tests control the clock (default: real now). */
  now?: Date;
  horizonDays?: number;
}

/**
 * Fill a single template's concrete classes from its cursor up to the horizon.
 * Never backfills the past: generation starts at max(now, generated_until).
 * Returns the number of new class rows inserted.
 */
export async function materializeTemplate(
  exec: Executor,
  template: Template,
  {
    now = new Date(),
    horizonDays = MATERIALIZATION_HORIZON_DAYS,
  }: MaterializeOptions = {},
): Promise<number> {
  if (template.status !== "active" || template.deletedAt) return 0;

  const to = new Date(now.getTime() + horizonDays * DAY_MS);
  const cursor = template.generatedUntil;
  const from = cursor && cursor > now ? cursor : now;
  if (to <= from) return 0;

  const occurrences = computeOccurrences(
    {
      daysOfWeek: template.daysOfWeek,
      startsAtMinutes: template.startsAtMinutes,
      timeZone: template.timeZone,
    },
    from,
    to,
  );

  let inserted = 0;
  if (occurrences.length > 0) {
    const rows = await exec
      .insert(classInstance)
      .values(
        occurrences.map((startsAt) => ({
          academyId: template.academyId,
          templateId: template.id,
          instructorId: template.instructorId,
          title: template.title,
          discipline: template.discipline,
          startsAt,
          durationMinutes: template.durationMinutes,
          capacity: template.capacity,
        })),
      )
      // A concurrent run or a prior tick may already hold this instant; only the
      // rows actually inserted come back, so this is the true created count.
      .onConflictDoNothing()
      .returning({ id: classInstance.id });
    inserted = rows.length;
  }

  await exec
    .update(classTemplate)
    .set({ generatedUntil: to })
    .where(eq(classTemplate.id, template.id));

  return inserted;
}

export interface SweepOptions {
  /** Max templates to touch this run (bounds work under the serverless limit). */
  limit?: number;
  /** Soft wall-clock budget; stop starting new templates past it (resumable). */
  softBudgetMs?: number;
  now?: Date;
  horizonDays?: number;
}

export interface SweepResult {
  processed: number;
  created: number;
  /** True if the limit/budget stopped us — more work remains for the next tick. */
  hasMore: boolean;
}

/**
 * The daily cron body (docs/issues/16). Processes active templates STALE-FIRST
 * (oldest `generated_until` — NULLs first via the pre-filter), bounded by a row
 * `limit` and a soft time budget so a run always finishes fast; leftovers resume
 * next tick. Runs on the base `db` (service role) across all academies.
 */
export async function runMaterializationSweep({
  limit = 200,
  softBudgetMs = 55_000,
  now = new Date(),
  horizonDays = MATERIALIZATION_HORIZON_DAYS,
}: SweepOptions = {}): Promise<SweepResult> {
  const startedAt = Date.now();
  // Target horizon end for THIS run. A template is "stale" when its cursor does
  // not yet reach here — so every active template is nudged ~+1 day each day.
  const horizonEnd = new Date(now.getTime() + horizonDays * DAY_MS);

  // Stale = cursor behind the horizon end. Oldest cursor first so the most-behind
  // templates catch up first under the row limit.
  const stale = await db
    .select()
    .from(classTemplate)
    .where(
      and(
        eq(classTemplate.status, "active"),
        isNull(classTemplate.deletedAt),
        lt(classTemplate.generatedUntil, horizonEnd),
      ),
    )
    .orderBy(asc(classTemplate.generatedUntil))
    .limit(limit + 1);

  // Templates with a NULL cursor are excluded by `lt(NULL)`; fetch those too.
  const fresh = await db
    .select()
    .from(classTemplate)
    .where(
      and(
        eq(classTemplate.status, "active"),
        isNull(classTemplate.deletedAt),
        isNull(classTemplate.generatedUntil),
      ),
    )
    .limit(limit + 1);

  const queue = [...fresh, ...stale].slice(0, limit + 1);
  const hasMore = queue.length > limit;
  const batch = queue.slice(0, limit);

  let created = 0;
  let processed = 0;
  for (const template of batch) {
    if (Date.now() - startedAt > softBudgetMs) {
      return { processed, created, hasMore: true };
    }
    created += await materializeTemplate(db, template, { now, horizonDays });
    processed += 1;
  }

  return { processed, created, hasMore };
}
