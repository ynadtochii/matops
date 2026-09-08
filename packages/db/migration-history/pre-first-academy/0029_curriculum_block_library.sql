CREATE TABLE "curriculum_block_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"theme" text NOT NULL,
	"notes" text,
	"default_weeks" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "curriculum_block" ADD COLUMN "template_id" uuid;--> statement-breakpoint
CREATE INDEX "curriculum_template_by_academy" ON "curriculum_block_template" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "curriculum_block_by_template" ON "curriculum_block" USING btree ("academy_id","template_id");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "curriculum_block_template" TO matops_app;--> statement-breakpoint
ALTER TABLE "curriculum_block_template" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "curriculum_block_template_isolation" ON "curriculum_block_template"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));--> statement-breakpoint
INSERT INTO "curriculum_block_template" ("academy_id", "theme", "notes", "default_weeks")
SELECT DISTINCT ON ("academy_id", "theme") "academy_id", "theme", "notes", "weeks"
FROM "curriculum_block"
ORDER BY "academy_id", "theme", "created_at";--> statement-breakpoint
UPDATE "curriculum_block" b
SET "template_id" = t."id"
FROM "curriculum_block_template" t
WHERE t."academy_id" = b."academy_id" AND t."theme" = b."theme";
