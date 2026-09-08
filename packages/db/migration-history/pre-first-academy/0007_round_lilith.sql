CREATE TYPE "public"."class_status" AS ENUM('scheduled', 'cancelled');--> statement-breakpoint
CREATE TABLE "class" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"template_id" uuid,
	"instructor_id" text NOT NULL,
	"title" text NOT NULL,
	"discipline" "discipline",
	"starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"capacity" integer NOT NULL,
	"booking_count" integer DEFAULT 0 NOT NULL,
	"status" "class_status" DEFAULT 'scheduled' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class" ADD CONSTRAINT "class_template_id_class_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."class_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cl_by_academy_start" ON "class" USING btree ("academy_id","starts_at");--> statement-breakpoint
CREATE INDEX "cl_by_academy_status_start" ON "class" USING btree ("academy_id","status","starts_at");--> statement-breakpoint
CREATE INDEX "cl_by_template" ON "class" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cl_uniq_template_start" ON "class" USING btree ("template_id","starts_at");