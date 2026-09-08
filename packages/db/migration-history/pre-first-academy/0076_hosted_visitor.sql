ALTER TABLE "academy_profile" DROP CONSTRAINT "academy_profile_publicApiKey_unique";--> statement-breakpoint
ALTER TABLE "academy_profile" DROP COLUMN "public_api_key";--> statement-breakpoint
ALTER TABLE "academy_profile" DROP COLUMN "public_api_origins";--> statement-breakpoint
UPDATE "class" AS c
SET "booking_count" = c."booking_count" + visitor_bookings."count"
FROM (
  SELECT "class_id", count(*)::int AS "count"
  FROM "drop_in_visit"
  WHERE "booking_status" = 'booked'
  GROUP BY "class_id"
) AS visitor_bookings
WHERE c."id" = visitor_bookings."class_id";
