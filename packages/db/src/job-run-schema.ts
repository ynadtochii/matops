import { index, pgTable } from "drizzle-orm/pg-core";

export const scheduledJobRun = pgTable(
  "scheduled_job_run",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    job: t.text().notNull(),
    status: t.text().notNull(),
    startedAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: t.timestamp({ withTimezone: true }),
    error: t.text(),
  }),
  (table) => [index("scheduled_job_run_latest").on(table.job, table.startedAt)],
);
