import {
  and,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  min,
  sql,
} from "drizzle-orm";

import {
  computeOccurrences,
  DAY_MS,
  MATERIALIZATION_HORIZON_DAYS,
  staleClassIds,
} from "@matops/domain";

import type { DbExec } from "./client";
import type { TenantTx } from "./tenant";
import {
  classInstance,
  classParticipation,
  classTemplate,
  dropInVisit,
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

/** A drizzle handle — the base `db` OR a per-request tenant transaction. */
type Executor = DbExec | TenantTx;

type Template = typeof classTemplate.$inferSelect;

interface MaterializeOptions {
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
      description: template.description,
      discipline: template.discipline,
      startsAt,
      durationMinutes: template.durationMinutes,
      capacity: template.capacity,
      capacityPolicy: template.capacityPolicy,
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
              description: template.description,
              discipline: template.discipline,
              durationMinutes: template.durationMinutes,
              capacity: template.capacity,
              capacityPolicy: template.capacityPolicy,
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

interface RebuildResult {
  deleted: number;
  bookingsRemoved: number;
  cancelled: number;
  created: number;
  generatedThrough: Date | null;
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
): Promise<{
  affected: {
    id: string;
    title: string;
    startsAt: Date;
    action: "cancel";
    activeParticipants: number;
    otherParticipations: number;
    activeVisitors: number;
    otherVisits: number;
  }[];
  generatedThrough: Date | null;
}> {
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
      title: classInstance.title,
      templateId: classInstance.templateId,
      startsAt: classInstance.startsAt,
    })
    .from(classInstance)
    .where(
      and(
        gt(classInstance.startsAt, now),
        lt(classInstance.startsAt, to),
        isNotNull(classInstance.templateId),
        isNull(classInstance.deletedAt),
        eq(classInstance.status, "scheduled"),
      ),
    );

  const ids = staleClassIds(existing, wanted);
  const [cursor] = await exec
    .select({ value: min(classTemplate.generatedUntil) })
    .from(classTemplate)
    .where(
      and(eq(classTemplate.status, "active"), isNull(classTemplate.deletedAt)),
    );
  if (ids.length === 0) {
    return { affected: [], generatedThrough: cursor?.value ?? null };
  }

  const participations = await exec
    .select({
      classId: classParticipation.classId,
      active: sql<number>`count(*) filter (where ${classParticipation.bookingStatus} = 'booked')::int`,
      other: sql<number>`count(*) filter (where ${classParticipation.bookingStatus} <> 'booked')::int`,
    })
    .from(classParticipation)
    .where(inArray(classParticipation.classId, ids))
    .groupBy(classParticipation.classId);
  const visits = await exec
    .select({
      classId: dropInVisit.classId,
      active: sql<number>`count(*) filter (where ${dropInVisit.bookingStatus} = 'booked')::int`,
      other: sql<number>`count(*) filter (where ${dropInVisit.bookingStatus} <> 'booked')::int`,
    })
    .from(dropInVisit)
    .where(inArray(dropInVisit.classId, ids))
    .groupBy(dropInVisit.classId);
  const participationByClass = new Map(
    participations.map((row) => [row.classId, row]),
  );
  const visitsByClass = new Map(visits.map((row) => [row.classId, row]));
  const stale = new Set(ids);
  return {
    affected: existing
      .filter((row) => stale.has(row.id))
      .map((row) => ({
        id: row.id,
        title: row.title,
        startsAt: row.startsAt,
        action: "cancel" as const,
        activeParticipants: participationByClass.get(row.id)?.active ?? 0,
        otherParticipations: participationByClass.get(row.id)?.other ?? 0,
        activeVisitors: visitsByClass.get(row.id)?.active ?? 0,
        otherVisits: visitsByClass.get(row.id)?.other ?? 0,
      })),
    generatedThrough: cursor?.value ?? null,
  };
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
  const plan = await planRebuild(exec, { now, horizonDays });
  const blocked = plan.affected.filter(
    (item) => item.activeParticipants + item.activeVisitors > 0,
  );
  if (blocked.length > 0) {
    throw new Error(
      `${blocked.length} stale ${blocked.length === 1 ? "class has" : "classes have"} active bookings`,
    );
  }
  const ids = plan.affected.map((item) => item.id);
  if (ids.length > 0) {
    await exec
      .update(classInstance)
      .set({ status: "cancelled" })
      .where(inArray(classInstance.id, ids));
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

  const refreshed = await planRebuild(exec, { now, horizonDays });
  return {
    deleted: 0,
    bookingsRemoved: 0,
    cancelled: ids.length,
    created,
    generatedThrough: refreshed.generatedThrough,
  };
}
