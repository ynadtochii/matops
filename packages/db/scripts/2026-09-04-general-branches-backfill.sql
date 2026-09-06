-- Turn the general-branch flag on for the gyms that predate migration 0060
-- (ADR 128).
--
-- `0060` changes the DEFAULT, which only reaches rows written after it. Every
-- organization created before keeps the false ADR 126 §7 gave it, so without
-- this fill an existing gym still cannot open a general space while a gym made
-- a minute later can. That difference is an accident of creation date and
-- nothing else, which is exactly what a one-off fill is for.
--
--   psql "$POSTGRES_URL&sslrootcert=system" -f packages/db/scripts/2026-09-04-general-branches-backfill.sql
--
-- Safe to run twice: it only writes rows that are still false. Deleted gyms are
-- left alone, because a shut gym opens nothing.
--
-- Supersedes 2026-09-04-alma-general-branches.sql, which did the same thing for
-- the one pilot organization while the flag was still off for everybody else.
--
-- NOT RUN YET.
BEGIN;

UPDATE "organization"
   SET general_branches_enabled = true
 WHERE general_branches_enabled = false
   AND deleted_at IS NULL;

SELECT id, name, general_branches_enabled
  FROM "organization"
 WHERE deleted_at IS NULL
 ORDER BY created_at;

COMMIT;
