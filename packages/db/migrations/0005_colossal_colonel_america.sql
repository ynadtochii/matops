CREATE TYPE "public"."discipline" AS ENUM('bjj', 'nogi', 'judo', 'mma', 'other');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TABLE "class_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"instructor_id" text NOT NULL,
	"title" text NOT NULL,
	"discipline" "discipline",
	"days_of_week" integer[] NOT NULL,
	"starts_at_minutes" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"time_zone" text NOT NULL,
	"capacity" integer NOT NULL,
	"status" "template_status" DEFAULT 'active' NOT NULL,
	"deleted_at" timestamp with time zone,
	"generated_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ct_by_academy" ON "class_template" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "ct_by_academy_status" ON "class_template" USING btree ("academy_id","status");