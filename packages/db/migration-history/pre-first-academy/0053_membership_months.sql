CREATE TABLE "membership_month" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"assignment_id" uuid NOT NULL,
	"month" date NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"recorded_by" text,
	"recorded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_month_is_a_month" CHECK (date_trunc('month', month) = month)
);
--> statement-breakpoint
ALTER TABLE "membership_policy" ADD COLUMN "grace_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_policy" ADD COLUMN "calendar_time_zone" text;--> statement-breakpoint
ALTER TABLE "membership_policy" ADD CONSTRAINT "membership_policy_grace_sane" CHECK (grace_days >= 0 AND grace_days <= 28);--> statement-breakpoint
CREATE UNIQUE INDEX "membership_month_one_per_month" ON "membership_month" USING btree ("assignment_id","month");--> statement-breakpoint
CREATE INDEX "membership_month_by_org_month" ON "membership_month" USING btree ("organization_id","month");--> statement-breakpoint
ALTER TABLE "membership_month" ADD CONSTRAINT "membership_month_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_month" ADD CONSTRAINT "membership_month_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_month" ADD CONSTRAINT "membership_month_assignment_same_org" FOREIGN KEY ("organization_id","assignment_id") REFERENCES "public"."access_assignment"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Isolation (ADR 126). A month record belongs to one shared membership, which
-- belongs to the organization, so it matches on `app.organization_id` like the
-- other four. There is ONE record per assignment per month, never one per
-- covered branch: a membership covering a mat and a gym is paid once.
ALTER TABLE "membership_month" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "membership_month_isolation" ON "membership_month"
  USING ("organization_id" = current_setting('app.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "membership_month" TO matops_app;
