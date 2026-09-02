ALTER TABLE "organization" DROP CONSTRAINT "organization_public_code_unique";--> statement-breakpoint
ALTER TABLE "organization" DROP CONSTRAINT "organization_public_api_key_unique";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "invited_role";--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "public_code";--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "time_zone";--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "country";--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "address";--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "map_url";--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "curriculum_for_students";--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "public_booking_enabled";--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "public_api_key";--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "public_api_origins";