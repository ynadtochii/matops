CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"account_user_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_guardian" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"student_person_id" uuid NOT NULL,
	"guardian_user_id" text NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entity_membership" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "access_assignment" ADD COLUMN "person_id" uuid;--> statement-breakpoint
ALTER TABLE "access_assignment_change" ADD COLUMN "person_id" uuid;--> statement-breakpoint
ALTER TABLE "membership_purchase" ADD COLUMN "person_id" uuid;--> statement-breakpoint
ALTER TABLE "entity_membership" ADD COLUMN "person_id" uuid;--> statement-breakpoint
ALTER TABLE "class_participation" ADD COLUMN "person_organization_id" text;--> statement-breakpoint
ALTER TABLE "class_participation" ADD COLUMN "person_id" uuid;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_account_user_id_user_id_fk" FOREIGN KEY ("account_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_account_same_org" FOREIGN KEY ("organization_id","account_user_id") REFERENCES "public"."member"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_guardian" ADD CONSTRAINT "person_guardian_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_guardian" ADD CONSTRAINT "person_guardian_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "person_org_id" ON "person" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "person_guardian" ADD CONSTRAINT "person_guardian_student_same_org" FOREIGN KEY ("organization_id","student_person_id") REFERENCES "public"."person"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_guardian" ADD CONSTRAINT "person_guardian_account_same_org" FOREIGN KEY ("organization_id","guardian_user_id") REFERENCES "public"."member"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "person_one_per_account" ON "person" USING btree ("organization_id","account_user_id");--> statement-breakpoint
CREATE INDEX "person_by_org_name" ON "person" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "person_guardian_one_relation" ON "person_guardian" USING btree ("organization_id","student_person_id","guardian_user_id");--> statement-breakpoint
CREATE INDEX "person_guardian_by_account" ON "person_guardian" USING btree ("organization_id","guardian_user_id");--> statement-breakpoint
ALTER TABLE "access_assignment" ADD CONSTRAINT "access_assignment_person_same_org" FOREIGN KEY ("organization_id","person_id") REFERENCES "public"."person"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_assignment_change" ADD CONSTRAINT "access_assignment_change_person_same_org" FOREIGN KEY ("organization_id","person_id") REFERENCES "public"."person"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_purchase" ADD CONSTRAINT "membership_purchase_person_same_org" FOREIGN KEY ("organization_id","person_id") REFERENCES "public"."person"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_membership" ADD CONSTRAINT "entity_membership_person_same_org" FOREIGN KEY ("organization_id","person_id") REFERENCES "public"."person"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_participation" ADD CONSTRAINT "class_participation_person_same_org" FOREIGN KEY ("person_organization_id","person_id") REFERENCES "public"."person"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_assignment_one_per_plan_person_start" ON "access_assignment" USING btree ("plan_id","person_id","start_month") WHERE person_id is not null and status <> 'cancelled';--> statement-breakpoint
CREATE INDEX "access_assignment_by_person" ON "access_assignment" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "access_assignment_by_person_period" ON "access_assignment" USING btree ("person_id","start_month");--> statement-breakpoint
CREATE INDEX "access_assignment_change_by_person" ON "access_assignment_change" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_purchase_one_unresolved_person" ON "membership_purchase" USING btree ("organization_id","person_id") WHERE person_id is not null and status in ('pending','claimed','rejected','resolution');--> statement-breakpoint
CREATE INDEX "membership_purchase_by_person" ON "membership_purchase" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_membership_one_per_person" ON "entity_membership" USING btree ("entity_id","person_id");--> statement-breakpoint
CREATE INDEX "entity_membership_by_person" ON "entity_membership" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cp_uniq_class_person" ON "class_participation" USING btree ("class_id","person_id") WHERE person_id is not null;--> statement-breakpoint
CREATE INDEX "cp_by_academy_person" ON "class_participation" USING btree ("academy_id","person_id");--> statement-breakpoint
ALTER TABLE "class_participation" ADD CONSTRAINT "class_participation_person_complete" CHECK ((person_organization_id is null) = (person_id is null));--> statement-breakpoint
ALTER TABLE "person" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "person_isolation" ON "person"
  USING ("organization_id" = current_setting('app.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
ALTER TABLE "person_guardian" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "person_guardian_isolation" ON "person_guardian"
  USING ("organization_id" = current_setting('app.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "person" TO matops_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "person_guardian" TO matops_app;
