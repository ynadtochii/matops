CREATE TABLE "curriculum_track" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "curriculum_track_by_academy" ON "curriculum_track" USING btree ("academy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_track_one_default" ON "curriculum_track" USING btree ("academy_id") WHERE is_default;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "curriculum_track" TO matops_app;--> statement-breakpoint
ALTER TABLE "curriculum_track" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "curriculum_track_isolation" ON "curriculum_track"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));--> statement-breakpoint

INSERT INTO "curriculum_track" ("academy_id", "name", "is_default")
  SELECT "id", 'All classes', true FROM "organization";--> statement-breakpoint

ALTER TABLE "curriculum_block" ADD COLUMN "track_id" uuid;--> statement-breakpoint
UPDATE "curriculum_block" b SET "track_id" = t."id"
  FROM "curriculum_track" t
  WHERE t."academy_id" = b."academy_id" AND t."is_default";--> statement-breakpoint
ALTER TABLE "curriculum_block" ALTER COLUMN "track_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "curriculum_block_by_track" ON "curriculum_block" USING btree ("academy_id","track_id","starts_on");--> statement-breakpoint

ALTER TABLE "class_template" ADD COLUMN "curriculum_track_id" uuid;
