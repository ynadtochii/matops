ALTER TABLE "payment_settings" ADD COLUMN "grace_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_settings" ADD COLUMN "enforced_at" timestamp with time zone;