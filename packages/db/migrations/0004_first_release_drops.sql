ALTER TABLE "curriculum_block" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "curriculum_block_template" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "curriculum_track" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reception_link" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "member_referral" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "member_referral_audit" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "curriculum_block" CASCADE;--> statement-breakpoint
DROP TABLE "curriculum_block_template" CASCADE;--> statement-breakpoint
DROP TABLE "curriculum_track" CASCADE;--> statement-breakpoint
DROP TABLE "reception_link" CASCADE;--> statement-breakpoint
DROP TABLE "member_referral" CASCADE;--> statement-breakpoint
DROP TABLE "member_referral_audit" CASCADE;--> statement-breakpoint
DROP INDEX "dv_uniq_cancel_token";--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "general_branches_enabled";--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "curriculum_enabled";--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "referrals_enabled";--> statement-breakpoint
ALTER TABLE "academy_profile" DROP COLUMN "curriculum_for_students";--> statement-breakpoint
ALTER TABLE "academy_profile" DROP COLUMN "public_booking_enabled";--> statement-breakpoint
ALTER TABLE "class" DROP COLUMN "public_bookable";--> statement-breakpoint
ALTER TABLE "class_template" DROP COLUMN "curriculum_track_id";--> statement-breakpoint
ALTER TABLE "class_template" DROP COLUMN "public_bookable";--> statement-breakpoint
ALTER TABLE "drop_in_visit" DROP COLUMN "cancel_token";--> statement-breakpoint
ALTER TABLE "drop_in_visit" DROP COLUMN "cancel_token_expires_at";--> statement-breakpoint
ALTER TABLE "drop_in_visit" DROP COLUMN "booked_class_starts_at";--> statement-breakpoint
DROP TYPE "public"."referral_action";