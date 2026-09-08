CREATE TABLE "curriculum_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"weeks" integer NOT NULL,
	"theme" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "curriculum_block_by_academy_start" ON "curriculum_block" USING btree ("academy_id","starts_on");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "curriculum_block" TO matops_app;--> statement-breakpoint
ALTER TABLE "curriculum_block" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "curriculum_block_isolation" ON "curriculum_block"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));
