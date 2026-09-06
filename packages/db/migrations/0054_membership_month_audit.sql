CREATE TABLE "membership_month_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"assignment_id" uuid NOT NULL,
	"month" date NOT NULL,
	"was_paid" boolean,
	"paid" boolean NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "membership_month_audit_by_assignment" ON "membership_month_audit" USING btree ("assignment_id","month");--> statement-breakpoint
ALTER TABLE "membership_month_audit" ADD CONSTRAINT "membership_month_audit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_month_audit" ADD CONSTRAINT "membership_month_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Deliberately NO foreign key to `access_assignment`. The audit outlives the
-- membership it is about: erasing somebody's assignment must not erase the
-- record of who marked which month paid, and a key would force the choice.
ALTER TABLE "membership_month_audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "membership_month_audit_isolation" ON "membership_month_audit"
  USING ("organization_id" = current_setting('app.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "membership_month_audit" TO matops_app;
