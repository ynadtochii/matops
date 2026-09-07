ALTER TABLE "class" ADD COLUMN "attendance_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "class" ADD COLUMN "attendance_reviewed_by" text;--> statement-breakpoint
ALTER TABLE "class" ADD COLUMN "attendance_review_fingerprint" text;