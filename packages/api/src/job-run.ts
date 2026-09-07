import type { DbExec } from "@matops/db/client";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  NOTIFICATION_OUTBOX_MAX_ATTEMPTS,
} from "@matops/db";
import { entity, notificationOutbox, scheduledJobRun } from "@matops/db/schema";

export const SCHEDULED_JOBS = [
  "notification_delivery",
  "membership_sweep",
  "calendar_materialization",
] as const;

export type ScheduledJob = (typeof SCHEDULED_JOBS)[number];

const MAX_AGE_MS: Record<ScheduledJob, number> = {
  notification_delivery: 15 * 60_000,
  membership_sweep: 30 * 60 * 60_000,
  calendar_materialization: 30 * 60 * 60_000,
};

const LABELS: Record<ScheduledJob, string> = {
  notification_delivery: "Email delivery",
  membership_sweep: "Membership reminders",
  calendar_materialization: "Calendar extension",
};

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(
    0,
    1000,
  );
}

export async function runRecordedJob<T>(
  exec: DbExec,
  job: ScheduledJob,
  work: () => Promise<T>,
  options: {
    succeeded?: (result: T) => boolean;
    failureMessage?: (result: T) => string;
  } = {},
): Promise<T> {
  const [run] = await exec
    .insert(scheduledJobRun)
    .values({ job, status: "running" })
    .returning({ id: scheduledJobRun.id });
  if (!run) throw new Error("Could not record the scheduled job start");

  try {
    const result = await work();
    const succeeded = options.succeeded?.(result) ?? true;
    await exec
      .update(scheduledJobRun)
      .set({
        status: succeeded ? "succeeded" : "failed",
        finishedAt: new Date(),
        error: succeeded
          ? null
          : (options.failureMessage?.(result) ?? "Job did not finish"),
      })
      .where(eq(scheduledJobRun.id, run.id));
    return result;
  } catch (error) {
    await exec
      .update(scheduledJobRun)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: errorMessage(error),
      })
      .where(eq(scheduledJobRun.id, run.id));
    throw error;
  }
}

export async function readScheduledJobHealth(
  exec: DbExec,
  organizationId: string,
  now = new Date(),
) {
  const latestRuns = await exec
    .selectDistinctOn([scheduledJobRun.job])
    .from(scheduledJobRun)
    .where(inArray(scheduledJobRun.job, SCHEDULED_JOBS))
    .orderBy(scheduledJobRun.job, desc(scheduledJobRun.startedAt));
  const latestSuccesses = await exec
    .selectDistinctOn([scheduledJobRun.job])
    .from(scheduledJobRun)
    .where(
      and(
        inArray(scheduledJobRun.job, SCHEDULED_JOBS),
        eq(scheduledJobRun.status, "succeeded"),
      ),
    )
    .orderBy(scheduledJobRun.job, desc(scheduledJobRun.startedAt));
  const [exhausted] = await exec
    .select({ count: count() })
    .from(notificationOutbox)
    .innerJoin(entity, eq(entity.id, notificationOutbox.academyId))
    .where(
      and(
        eq(entity.organizationId, organizationId),
        eq(notificationOutbox.status, "failed"),
        gte(notificationOutbox.attempts, NOTIFICATION_OUTBOX_MAX_ATTEMPTS),
      ),
    );

  return {
    jobs: SCHEDULED_JOBS.map((job) => {
      const latest = latestRuns.find((run) => run.job === job);
      const latestSuccess = latestSuccesses.find((run) => run.job === job);
      return {
        job,
        label: LABELS[job],
        status: latest?.status ?? "never_run",
        lastStartedAt: latest?.startedAt ?? null,
        lastSucceededAt: latestSuccess?.finishedAt ?? null,
        overdue:
          !latestSuccess?.finishedAt ||
          now.getTime() - latestSuccess.finishedAt.getTime() > MAX_AGE_MS[job],
      };
    }),
    exhaustedEmails: exhausted?.count ?? 0,
  };
}
