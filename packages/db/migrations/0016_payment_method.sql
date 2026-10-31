CREATE TABLE "payment_method" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_method_kind_supported" CHECK (kind in ('bank','mbway','cash','other'))
);
--> statement-breakpoint
ALTER TABLE "payment_method" ADD CONSTRAINT "payment_method_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_method_by_position" ON "payment_method" USING btree ("organization_id","position");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "payment_method" TO matops_app;--> statement-breakpoint
ALTER TABLE "payment_method" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "payment_method_isolation" ON "payment_method" USING ("organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("organization_id" = current_setting('app.organization_id', true));
