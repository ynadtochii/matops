CREATE TYPE "public"."lead_source" AS ENUM('link', 'web', 'wall_qr', 'staff', 'api');--> statement-breakpoint
CREATE TYPE "public"."lead_stage" AS ENUM('new', 'contacted', 'invited', 'joined', 'ghosted');--> statement-breakpoint
ALTER TABLE "drop_in" ADD COLUMN "stage" "lead_stage" DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "drop_in" ADD COLUMN "source" "lead_source" DEFAULT 'wall_qr' NOT NULL;--> statement-breakpoint
ALTER TABLE "drop_in" ADD COLUMN "contacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drop_in" ADD COLUMN "converted_user_id" text;