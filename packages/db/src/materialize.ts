import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from "drizzle-orm";

import {
  computeOccurrences,
  MATERIALIZATION_HORIZON_DAYS,
  staleClassIds,
} from "@matops/domain";

import { db } from "./client";
import {
  classInstance,
  classParticipation,
  classTemplate,
  dropIn,
} from "./scheduling";

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
  /**
   * Bring a CANCELLED instance at a generated instant back to `scheduled` and
   * refresh its content. Only the template TIMING edit passes this: it cancels
   * the future instances first (it must not delete them, since bookings and
   * drop-ins reference `class.id`), then re-materializes; the occurrences the
   * new timing still covers have to come back with their bookings intact.
   */
  reviveCancelled?: boolean;
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
    reviveCancelled = false,
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
    const values = occurrences.map((startsAt) => ({
      academyId: template.academyId,
      templateId: template.id,
      instructorId: template.instructorId,
      title: template.title,
      discipline: template.discipline,
      startsAt,
      durationMinutes: template.durationMinutes,
      capacity: template.capacity,
    }));
    const insert = exec.insert(classInstance).values(values);
    // A concurrent run or a prior tick may already hold this instant; only the
    // rows actually inserted (or revived) come back, so this is the true count.
    const rows = await (
      reviveCancelled
        ? insert.onConflictDoUpdate({
            target: [classInstance.templateId, classInstance.startsAt],
            setWhere: eq(classInstance.status, "cancelled"),
            set: {
              status: "scheduled",
              instructorId: template.instructorId,
              title: template.title,
              discipline: template.discipline,
              durationMinutes: template.durationMinutes,
              capacity: template.capacity,
            },
          })
        : insert.onConflictDoNothing()
    ).returning({ id: classInstance.id });
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
  /** The drizzle handle to sweep on. Defaults to the base `db`; tests inject. */
  exec?: Executor;
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
  exec = db,
}: SweepOptions = {}): Promise<SweepResult> {
  const startedAt = Date.now();
  // Target horizon end for THIS run. A template is "stale" when its cursor does
  // not yet reach here — so every active template is nudged ~+1 day each day.
  const horizonEnd = new Date(now.getTime() + horizonDays * DAY_MS);

  // Stale = cursor behind the horizon end. Oldest cursor first so the most-behind
  // templates catch up first under the row limit.
  const stale = await exec
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
  const fresh = await exec
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
    created += await materializeTemplate(exec, template, {
      now,
      horizonDays,
    });
    processed += 1;
  }

  return { processed, created, hasMore };
}

export interface RebuildResult {
  /** Future classes removed because no active template still produces them. */
  deleted: number;
  /** Bookings that went with them. Zero when nobody had booked. */
  bookingsRemoved: number;
  /** Classes generated to refill the horizon. */
  created: number;
}

/** The active, non-deleted templates of the academy the caller is scoped to. */
async function activeTemplates(exec: Executor): Promise<Template[]> {
  return exec
    .select()
    .from(classTemplate)
    .where(
      and(eq(classTemplate.status, "active"), isNull(classTemplate.deletedAt)),
    );
}

/**
 * The future classes a rebuild would remove, and how many bookings go with them.
 * Reads only, so the owner's confirm dialog can name the damage before they
 * commit to it (ADR 79).
 */
export async function planRebuild(
  exec: Executor,
  { now = new Date(), horizonDays = MATERIALIZATION_HORIZON_DAYS } = {},
): Promise<{ ids: string[]; bookings: number }> {
  const to = new Date(now.getTime() + horizonDays * DAY_MS);
  const templates = await activeTemplates(exec);

  const wanted = templates.flatMap((t) =>
    computeOccurrences(
      {
        daysOfWeek: t.daysOfWeek,
        startsAtMinutes: t.startsAtMinutes,
        timeZone: t.timeZone,
      },
      now,
      to,
    ).map((startsAt) => ({ templateId: t.id, startsAt })),
  );

  // FUTURE only, and only rows a template generated. A past class carries its
  // attendance on the same participation row as its booking, so removing one
  // erases history; a one-off has no template to recreate it.
  const existing = await exec
    .select({
      id: classInstance.id,
      templateId: classInstance.templateId,
      startsAt: classInstance.startsAt,
    })
    .from(classInstance)
    .where(
      and(
        gt(classInstance.startsAt, now),
        isNotNull(classInstance.templateId),
        isNull(classInstance.deletedAt),
      ),
    );

  const ids = staleClassIds(existing, wanted);
  if (ids.length === 0) return { ids, bookings: 0 };

  const [booked] = await exec
    .select({ n: sql<number>`count(*)::int` })
    .from(classParticipation)
    .where(inArray(classParticipation.classId, ids));

  return { ids, bookings: booked?.n ?? 0 };
}

/**
 * Rebuild the academy's forward schedule (ADR 79). Removes every future class no
 * active template still produces, then regenerates all of them from today to the
 * horizon. The owner triggers this by hand; nothing schedules it.
 *
 * Runs on the CALLER's executor, which is the per-request tenant transaction, so
 * RLS scopes every statement to the active academy and there is no `academy_id`
 * filter to forget. It is also why the whole thing is atomic: a failure part-way
 * rolls the deletes back with it.
 *
 * A class the owner deliberately CANCELLED at a still-wanted instant stays
 * cancelled: the regeneration uses `onConflictDoNothing`, not `reviveCancelled`.
 */
export async function rebuildSchedule(
  exec: Executor,
  { now = new Date(), horizonDays = MATERIALIZATION_HORIZON_DAYS } = {},
): Promise<RebuildResult> {
  const { ids, bookings } = await planRebuild(exec, { now, horizonDays });

  if (ids.length > 0) {
    // ponytail: one statement per table, no chunking. Six months of a normal
    // gym is low thousands of ids; chunk at ~10k if a franchise ever appears.
    await exec
      .delete(classParticipation)
      .where(inArray(classParticipation.classId, ids));
    // A walk-in lead attached to a class it can outlive: keep the lead, drop
    // the link. The column is already nullable ("null = general lead").
    await exec
      .update(dropIn)
      .set({ classId: null })
      .where(inArray(dropIn.classId, ids));
    await exec.delete(classInstance).where(inArray(classInstance.id, ids));
  }

  const templates = await activeTemplates(exec);
  let created = 0;
  for (const template of templates) {
    created += await materializeTemplate(
      exec,
      // Cursor blanked in the passed row, not in the DB: `materializeTemplate`
      // reads it off the object and writes the new one back. Without this a
      // template already at the horizon creates nothing and the hole the delete
      // just made stays open.
      { ...template, generatedUntil: null },
      { now, horizonDays },
    );
  }

  return { deleted: ids.length, bookingsRemoved: bookings, created };
}
