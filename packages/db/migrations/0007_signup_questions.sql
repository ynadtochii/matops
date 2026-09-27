CREATE TABLE "academy_waiver" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"body" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waiver_acceptance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"member_id" text NOT NULL,
	"waiver_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "signup_health_question" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "waiver_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "entity_membership" ADD COLUMN "email_updates_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "aw_academy_id" ON "academy_waiver" USING btree ("academy_id","id");--> statement-breakpoint
ALTER TABLE "academy_waiver" ADD CONSTRAINT "academy_waiver_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_acceptance" ADD CONSTRAINT "waiver_acceptance_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_acceptance" ADD CONSTRAINT "waiver_acceptance_membership" FOREIGN KEY ("academy_id","member_id") REFERENCES "public"."entity_membership"("entity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_acceptance" ADD CONSTRAINT "waiver_acceptance_waiver" FOREIGN KEY ("academy_id","waiver_id") REFERENCES "public"."academy_waiver"("academy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aw_by_academy" ON "academy_waiver" USING btree ("academy_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_uniq_member_waiver" ON "waiver_acceptance" USING btree ("member_id","waiver_id");--> statement-breakpoint
GRANT SELECT, INSERT ON "academy_waiver" TO matops_app;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "waiver_acceptance" TO matops_app;--> statement-breakpoint
ALTER TABLE "academy_waiver" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "waiver_acceptance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "academy_waiver_isolation" ON "academy_waiver" USING ("academy_id" = current_setting('app.academy_id', true)) WITH CHECK ("academy_id" = current_setting('app.academy_id', true));--> statement-breakpoint
CREATE POLICY "waiver_acceptance_isolation" ON "waiver_acceptance" USING ("academy_id" = current_setting('app.academy_id', true)) WITH CHECK ("academy_id" = current_setting('app.academy_id', true));