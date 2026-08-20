-- One-off reset before the beta test: drop EVERY academy and all of its data,
-- so `pnpm -F @matops/db seed up <email>` can rebuild a single clean "Alma beta".
--
-- Real `user` rows survive (you still sign in), but fake `seed_` users and every
-- membership go. Run it once, then run the seed.
--
--   psql "$POSTGRES_URL&sslrootcert=system" -f packages/db/src/seed/wipe-academies.sql
--
-- This is destructive and cannot be undone.
BEGIN;

DELETE FROM "class_participation";
DELETE FROM "member_referral_audit";
DELETE FROM "member_referral";
DELETE FROM "drop_in";
DELETE FROM "payment_claim";
DELETE FROM "member_dues";
DELETE FROM "rank_promotion";
DELETE FROM "member_note";
DELETE FROM "member_rank";
DELETE FROM "payment_settings";
DELETE FROM "class";
DELETE FROM "membership_plan";
DELETE FROM "class_template";
DELETE FROM "academy_invite";
DELETE FROM "tenant_probe";
DELETE FROM "invitation";
DELETE FROM "member";
DELETE FROM "push_token";

-- Every session carries an active organization id that is about to disappear,
-- so drop them all: everyone signs in again against the rebuilt academy.
DELETE FROM "session";
DELETE FROM "account" WHERE user_id LIKE 'seed_%';
DELETE FROM "user" WHERE id LIKE 'seed_%';

DELETE FROM "organization";

COMMIT;
