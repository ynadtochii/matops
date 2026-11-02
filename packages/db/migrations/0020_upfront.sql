CREATE TABLE "membership_purchase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"assignment_id" uuid NOT NULL,
	"first_month" date NOT NULL,
	"months" integer NOT NULL,
	"total_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"discount_from_months" integer,
	"discount_percent" integer,
	"discount_month_minor" integer,
	"recorded_by" text,
	"discarded_at" timestamp with time zone,
	"discarded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_purchase_is_a_month" CHECK (date_trunc('month', first_month) = first_month),
	CONSTRAINT "membership_purchase_months_range" CHECK (months between 1 and 12),
	CONSTRAINT "membership_purchase_total_sane" CHECK (total_minor >= 0 and char_length(currency) = 3)
);
--> statement-breakpoint
ALTER TABLE "access_plan" ADD COLUMN "discount_from_months" integer;--> statement-breakpoint
ALTER TABLE "access_plan" ADD COLUMN "discount_percent" integer;--> statement-breakpoint
ALTER TABLE "access_plan" ADD COLUMN "discount_month_minor" integer;--> statement-breakpoint
ALTER TABLE "membership_month" ADD COLUMN "purchase_id" uuid;--> statement-breakpoint
ALTER TABLE "membership_purchase" ADD CONSTRAINT "membership_purchase_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_purchase" ADD CONSTRAINT "membership_purchase_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_purchase" ADD CONSTRAINT "membership_purchase_discarded_by_user_id_fk" FOREIGN KEY ("discarded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_purchase" ADD CONSTRAINT "membership_purchase_assignment_same_org" FOREIGN KEY ("organization_id","assignment_id") REFERENCES "public"."access_assignment"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_purchase_org_id" ON "membership_purchase" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "membership_purchase_by_assignment" ON "membership_purchase" USING btree ("assignment_id");--> statement-breakpoint
ALTER TABLE "membership_month" ADD CONSTRAINT "membership_month_purchase_same_org" FOREIGN KEY ("organization_id","purchase_id") REFERENCES "public"."membership_purchase"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_month_by_purchase" ON "membership_month" USING btree ("purchase_id");--> statement-breakpoint
ALTER TABLE "access_plan" ADD CONSTRAINT "access_plan_discount_shape" CHECK ((discount_from_months is null and discount_percent is null and discount_month_minor is null) or (discount_from_months between 2 and 12 and (discount_percent is null) <> (discount_month_minor is null) and (discount_percent is null or discount_percent between 1 and 90) and (discount_month_minor is null or discount_month_minor > 0)));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "membership_purchase" TO matops_app;--> statement-breakpoint
ALTER TABLE "membership_purchase" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "membership_purchase_isolation" ON "membership_purchase" USING ("organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("organization_id" = current_setting('app.organization_id', true));
