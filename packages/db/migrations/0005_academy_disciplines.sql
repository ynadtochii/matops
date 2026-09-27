CREATE TABLE "academy_discipline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class" ALTER COLUMN "discipline" TYPE text USING "discipline"::text;--> statement-breakpoint
ALTER TABLE "class_template" DROP COLUMN "discipline";--> statement-breakpoint
ALTER TABLE "class_template" ADD COLUMN "discipline" text;--> statement-breakpoint
ALTER TABLE "academy_discipline" ADD CONSTRAINT "academy_discipline_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_uniq_academy_name_ci" ON "academy_discipline" USING btree ("academy_id",lower("name"));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "academy_discipline" TO matops_app;--> statement-breakpoint
ALTER TABLE "academy_discipline" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "academy_discipline_isolation" ON "academy_discipline" USING ("academy_id" = current_setting('app.academy_id', true)) WITH CHECK ("academy_id" = current_setting('app.academy_id', true));--> statement-breakpoint
DROP TYPE "public"."discipline";