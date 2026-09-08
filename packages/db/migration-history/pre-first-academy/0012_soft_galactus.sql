CREATE TYPE "public"."attendance_status" AS ENUM('unmarked', 'present', 'absent');--> statement-breakpoint
ALTER TYPE "public"."booking_status" ADD VALUE 'none';--> statement-breakpoint
ALTER TABLE "class_participation" ADD COLUMN "attendance_status" "attendance_status" DEFAULT 'unmarked' NOT NULL;--> statement-breakpoint
ALTER TABLE "class_participation" ADD COLUMN "attended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "class_participation" ADD COLUMN "marked_by" text;