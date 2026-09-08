DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "membership_plan")
    OR EXISTS (SELECT 1 FROM "member_dues")
    OR EXISTS (SELECT 1 FROM "payment_claim")
    OR EXISTS (SELECT 1 FROM "payment_settings") THEN
    RAISE EXCEPTION 'Run packages/db/scripts/2026-09-07-legacy-dues-to-shared-memberships.sql with apply=true before migration 0074';
  END IF;
END $$;--> statement-breakpoint
DROP TABLE "payment_claim";--> statement-breakpoint
DROP TABLE "member_dues";--> statement-breakpoint
DROP TABLE "membership_plan";--> statement-breakpoint
DROP TABLE "payment_settings";--> statement-breakpoint
DROP TYPE "public"."payment_claim_status";--> statement-breakpoint
DROP TYPE "public"."payment_cycle";
