ALTER TABLE "organization" ADD COLUMN "time_zone" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "deleted_at" timestamp with time zone;