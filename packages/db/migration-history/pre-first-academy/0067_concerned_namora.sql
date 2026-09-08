ALTER TABLE "access_plan" ADD COLUMN "student_selectable" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE "membership_purchase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_name" text NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"start_month" date NOT NULL,
	"entity_ids" text[] NOT NULL,
	"branch_names" text[] NOT NULL,
	"version" text NOT NULL,
	"reference" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"assignment_id" uuid,
	"claimed_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_purchase_status_supported" CHECK (status in ('pending','claimed','confirmed','rejected','cancelled','resolution')),
	CONSTRAINT "membership_purchase_price_sane" CHECK (price_minor >= 0 and char_length(currency) = 3),
	CONSTRAINT "membership_purchase_is_a_month" CHECK (date_trunc('month', start_month) = start_month)
);
--> statement-breakpoint
ALTER TABLE "membership_purchase" ADD CONSTRAINT "membership_purchase_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "membership_purchase" ADD CONSTRAINT "membership_purchase_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "membership_purchase" ADD CONSTRAINT "membership_purchase_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "membership_purchase" ADD CONSTRAINT "membership_purchase_plan_same_org" FOREIGN KEY ("organization_id","plan_id") REFERENCES "public"."access_plan"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "membership_purchase" ADD CONSTRAINT "membership_purchase_entity_same_org" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entity"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "membership_purchase" ADD CONSTRAINT "membership_purchase_assignment_same_org" FOREIGN KEY ("organization_id","assignment_id") REFERENCES "public"."access_assignment"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "membership_purchase_one_unresolved" ON "membership_purchase" USING btree ("organization_id","user_id") WHERE status in ('pending','claimed','rejected','resolution');
--> statement-breakpoint
CREATE UNIQUE INDEX "membership_purchase_reference" ON "membership_purchase" USING btree ("reference");
--> statement-breakpoint
CREATE INDEX "membership_purchase_by_org_status" ON "membership_purchase" USING btree ("organization_id","status");
--> statement-breakpoint
ALTER TABLE "membership_purchase" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "membership_purchase_isolation" ON "membership_purchase"
USING ("organization_id" = current_setting('app.organization_id', true))
WITH CHECK ("organization_id" = current_setting('app.organization_id', true));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "membership_purchase" TO matops_app;
