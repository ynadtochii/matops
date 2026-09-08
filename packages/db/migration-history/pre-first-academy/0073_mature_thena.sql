CREATE TABLE "scheduled_job_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "scheduled_job_run_latest" ON "scheduled_job_run" USING btree ("job","started_at");
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "scheduled_job_run" FROM matops_app;
