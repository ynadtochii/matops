CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "notif_by_academy_user" ON "notification" USING btree ("academy_id","user_id","created_at");--> statement-breakpoint

-- Tenant seam (docs/issues/12, 76). The table carries `academy_id`, so it gets
-- the standard isolation policy: the request role only ever sees the academy the
-- transaction is set to. The cron sweeps and the notify helper insert on the BASE
-- connection (table owner, RLS not enforced) exactly like the reminder claims.
-- No DELETE grant: v1 has no path that removes a notification.
GRANT SELECT, INSERT, UPDATE ON "notification" TO matops_app;--> statement-breakpoint
ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notification_isolation" ON "notification"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));
