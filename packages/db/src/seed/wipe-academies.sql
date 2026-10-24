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

-- Children first: every BJJ table references `entity`, and the payment, rank
-- and note rows reference `entity_membership`, so the order below is the one
-- the foreign keys allow (ADR 124).
DELETE FROM "class_participation";
DELETE FROM "drop_in_visit";
DELETE FROM "drop_in";
DELETE FROM "rank_promotion";
DELETE FROM "member_note";
DELETE FROM "waiver_acceptance";
DELETE FROM "academy_waiver";
DELETE FROM "member_rank";
DELETE FROM "notification";
DELETE FROM "notification_notice";
DELETE FROM "class";
DELETE FROM "class_template";
DELETE FROM "academy_invite";
DELETE FROM "drop_in_link";
DELETE FROM "desk_link";
-- Rows only. The objects stay in the R2 bucket as orphans; fine on dev.
DELETE FROM "stored_file";
DELETE FROM "tenant_probe";
DELETE FROM "invitation";
DELETE FROM "entity_membership";
DELETE FROM "member";
DELETE FROM "push_token";

-- Every session carries an active organization id that is about to disappear,
-- so drop them all: everyone signs in again against the rebuilt academy.
DELETE FROM "session";
DELETE FROM "account" WHERE user_id LIKE 'seed_%';
DELETE FROM "user" WHERE id LIKE 'seed_%';

DELETE FROM "academy_profile";
DELETE FROM "entity";
DELETE FROM "organization";

COMMIT;
