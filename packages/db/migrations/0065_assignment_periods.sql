-- A plan change starts on the 1st (ADR 129).
--
-- Changing somebody's plan used to mean ending one membership and starting
-- another today, which charges twice for one month. It now waits for the month
-- boundary, so `access_assignment` has to carry a period rather than a start.
--
-- `end_month` is EXCLUSIVE: it is the first month the assignment no longer
-- applies. Existing rows stay open-ended, which is why the column is nullable
-- and nothing is backfilled.
ALTER TABLE "access_assignment" ADD COLUMN "end_month" date;
--> statement-breakpoint
ALTER TABLE "access_assignment" ADD CONSTRAINT "access_assignment_end_is_a_month" CHECK (end_month IS NULL OR date_trunc('month', end_month) = end_month);
--> statement-breakpoint
ALTER TABLE "access_assignment" ADD CONSTRAINT "access_assignment_period_ordered" CHECK (end_month IS NULL OR end_month > start_month);
--> statement-breakpoint
-- The lifetime rule "one assignment per plan per person" is gone: somebody who
-- leaves a plan in March and comes back in September holds two periods of it,
-- and rewriting the March row would erase what they were charged. What is left
-- is that two periods cannot START in the same month. Overlap between two live
-- periods is refused by the writer, which holds a lock on the person's rows.
DROP INDEX "access_assignment_one_per_plan_user";
--> statement-breakpoint
CREATE UNIQUE INDEX "access_assignment_one_per_plan_user_start" ON "access_assignment" USING btree ("plan_id","user_id","start_month") WHERE status <> 'cancelled';
--> statement-breakpoint
CREATE INDEX "access_assignment_by_user_period" ON "access_assignment" USING btree ("user_id","start_month");
--> statement-breakpoint
-- The decision itself, so a pending change can be shown and cancelled.
--
-- Pending and applied are NOT stored: they are read off the calendar against
-- `effective_month`, so a cron job that never runs cannot leave a change half
-- made. `previous_source_end_month` is what the source's end month was before
-- this change wrote one, which is the only thing a cancellation has to restore.
CREATE TABLE "access_assignment_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"source_assignment_id" uuid NOT NULL,
	"target_assignment_id" uuid NOT NULL,
	"effective_month" date NOT NULL,
	"previous_source_end_month" date,
	"scheduled_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_by" text,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "access_assignment_change_is_a_month" CHECK (date_trunc('month', effective_month) = effective_month),
	CONSTRAINT "access_assignment_change_two_rows" CHECK (source_assignment_id <> target_assignment_id)
);
--> statement-breakpoint
ALTER TABLE "access_assignment_change" ADD CONSTRAINT "access_assignment_change_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "access_assignment_change" ADD CONSTRAINT "access_assignment_change_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "access_assignment_change" ADD CONSTRAINT "access_assignment_change_scheduled_by_user_id_fk" FOREIGN KEY ("scheduled_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "access_assignment_change" ADD CONSTRAINT "access_assignment_change_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "access_assignment_change" ADD CONSTRAINT "access_assignment_change_source_same_org" FOREIGN KEY ("organization_id","source_assignment_id") REFERENCES "public"."access_assignment"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "access_assignment_change" ADD CONSTRAINT "access_assignment_change_target_same_org" FOREIGN KEY ("organization_id","target_assignment_id") REFERENCES "public"."access_assignment"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- One live change per source, so a double submit is one scheduled change.
CREATE UNIQUE INDEX "access_assignment_change_one_live_per_source" ON "access_assignment_change" USING btree ("source_assignment_id") WHERE cancelled_at IS NULL;
--> statement-breakpoint
CREATE INDEX "access_assignment_change_by_org_month" ON "access_assignment_change" USING btree ("organization_id","effective_month");
--> statement-breakpoint
CREATE INDEX "access_assignment_change_by_user" ON "access_assignment_change" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "access_assignment_change" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "access_assignment_change_isolation" ON "access_assignment_change"
  USING ("organization_id" = current_setting('app.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('app.organization_id', true));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "access_assignment_change" TO matops_app;
