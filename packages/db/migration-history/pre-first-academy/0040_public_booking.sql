ALTER TABLE "organization" ADD COLUMN "public_booking_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "public_api_key" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "public_api_origins" text[];--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_public_api_key_unique" UNIQUE("public_api_key");