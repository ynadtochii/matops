CREATE TABLE "access_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_plan_entity" (
	"organization_id" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"entity_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"assigning_entity_id" text,
	"start_month" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"assigned_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_assignment_status_supported" CHECK (status in ('active','suspended','cancelled')),
	CONSTRAINT "access_assignment_start_is_a_month" CHECK (date_trunc('month', start_month) = start_month)
);
--> statement-breakpoint
CREATE TABLE "membership_policy" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "access_plan_org_id" ON "access_plan" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "access_plan_by_org" ON "access_plan" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_plan_entity_pk" ON "access_plan_entity" USING btree ("plan_id","entity_id");--> statement-breakpoint
CREATE INDEX "access_plan_entity_by_entity" ON "access_plan_entity" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_assignment_one_per_plan_user" ON "access_assignment" USING btree ("plan_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_assignment_org_id" ON "access_assignment" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "access_assignment_by_user" ON "access_assignment" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "access_assignment_by_org_status" ON "access_assignment" USING btree ("organization_id","status");--> statement-breakpoint
ALTER TABLE "access_plan" ADD CONSTRAINT "access_plan_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_plan_entity" ADD CONSTRAINT "access_plan_entity_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_plan_entity" ADD CONSTRAINT "access_plan_entity_plan_same_org" FOREIGN KEY ("organization_id","plan_id") REFERENCES "public"."access_plan"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_plan_entity" ADD CONSTRAINT "access_plan_entity_entity_same_org" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entity"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_assignment" ADD CONSTRAINT "access_assignment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_assignment" ADD CONSTRAINT "access_assignment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_assignment" ADD CONSTRAINT "access_assignment_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_assignment" ADD CONSTRAINT "access_assignment_plan_same_org" FOREIGN KEY ("organization_id","plan_id") REFERENCES "public"."access_plan"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_assignment" ADD CONSTRAINT "access_assignment_entity_same_org" FOREIGN KEY ("organization_id","assigning_entity_id") REFERENCES "public"."entity"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_policy" ADD CONSTRAINT "membership_policy_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Isolation (ADR 126). All four belong to the ORGANIZATION, so they match on
-- `app.organization_id` exactly as `entity` and `entity_membership` do. None of
-- them carries an `academy_id`: one membership covering a mat and a gym is one
-- row, and an entity-scoped policy could not see it from either side.
ALTER TABLE "access_plan" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "access_plan_isolation" ON "access_plan"
  USING ("organization_id" = current_setting('app.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
ALTER TABLE "access_plan_entity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "access_plan_entity_isolation" ON "access_plan_entity"
  USING ("organization_id" = current_setting('app.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
ALTER TABLE "access_assignment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "access_assignment_isolation" ON "access_assignment"
  USING ("organization_id" = current_setting('app.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
ALTER TABLE "membership_policy" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "membership_policy_isolation" ON "membership_policy"
  USING ("organization_id" = current_setting('app.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "access_plan" TO matops_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "access_plan_entity" TO matops_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "access_assignment" TO matops_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "membership_policy" TO matops_app;
