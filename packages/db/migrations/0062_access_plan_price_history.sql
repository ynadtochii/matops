-- What a plan cost from a given month on (ADR 128, spec FP6).
--
-- `access_plan.price_minor` is what a plan costs TODAY. This table is what it
-- cost then. Without it, raising a price in March rewrites what February's
-- members were asked for, and a member reading their own history would see an
-- amount nobody ever charged them.
--
-- One row per plan per effective month; the month a membership belongs to
-- resolves to the latest row at or before it. Correcting a mistake means
-- writing that month again rather than editing the past, the same shape
-- `membership_month_audit` already uses for the paid flag.
--
-- Organization-scoped like every other access table (ADR 126): a plan can cover
-- a mat and a gym at once, so an entity-scoped policy could not see it from
-- either side.
CREATE TABLE "access_plan_price" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"effective_month" date NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"recorded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_plan_price_is_a_month" CHECK (date_trunc('month', effective_month) = effective_month),
	CONSTRAINT "access_plan_price_sane" CHECK (price_minor >= 0 AND char_length(currency) = 3)
);
--> statement-breakpoint
ALTER TABLE "access_plan_price" ADD CONSTRAINT "access_plan_price_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "access_plan_price" ADD CONSTRAINT "access_plan_price_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "access_plan_price" ADD CONSTRAINT "access_plan_price_plan_same_org" FOREIGN KEY ("organization_id","plan_id") REFERENCES "public"."access_plan"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "access_plan_price_one_per_month" ON "access_plan_price" USING btree ("plan_id","effective_month");
--> statement-breakpoint
CREATE INDEX "access_plan_price_by_org" ON "access_plan_price" USING btree ("organization_id");
--> statement-breakpoint
ALTER TABLE "access_plan_price" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "access_plan_price_isolation" ON "access_plan_price"
  USING ("organization_id" = current_setting('app.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('app.organization_id', true));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "access_plan_price" TO matops_app;
