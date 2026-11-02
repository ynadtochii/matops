CREATE TABLE "access_plan_method_off" (
	"organization_id" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"payment_method_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_plan_method_off_pk" PRIMARY KEY("plan_id","payment_method_id")
);
--> statement-breakpoint
ALTER TABLE "access_plan_method_off" ADD CONSTRAINT "access_plan_method_off_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_plan_method_off" ADD CONSTRAINT "access_plan_method_off_plan_id_access_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."access_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_plan_method_off" ADD CONSTRAINT "access_plan_method_off_payment_method_id_payment_method_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_method"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_plan_method_off_by_method" ON "access_plan_method_off" USING btree ("payment_method_id");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "access_plan_method_off" TO matops_app;--> statement-breakpoint
ALTER TABLE "access_plan_method_off" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "access_plan_method_off_isolation" ON "access_plan_method_off" USING ("organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("organization_id" = current_setting('app.organization_id', true));
