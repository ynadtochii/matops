-- Fill `organization.country` for academies that predate migration 0041 (ADR 119).
--
-- The column is the country every phone field opens on. It is nullable, and a
-- null falls back to the country the academy's IANA time zone implies
-- (`academyCountry` in packages/domain/src/phone.ts), so this fill is a
-- convenience, never a repair: an academy left null still gets the right
-- picker as long as its zone is one the map covers.
--
-- Set it explicitly when the guess is wrong or absent: a zone shared across a
-- border (Europe/Zurich is not only Switzerland), or a zone the map does not
-- carry.
--
--   psql "$POSTGRES_URL&sslrootcert=system" -f packages/db/scripts/2026-08-30-academy-country.sql
--
-- Safe to run twice: it only writes rows that are still null.
-- RUN on Neon 2026-08-30. It set Alma beta (Europe/Lisbon) to PT, which the
-- zone guess already produced; the row now says it rather than implying it.
-- A second run wrote nothing, which is the check that it is idempotent.
BEGIN;

UPDATE "organization" SET country = 'PT'
 WHERE country IS NULL AND time_zone IN ('Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores');

UPDATE "organization" SET country = 'UA'
 WHERE country IS NULL AND time_zone = 'Europe/Kyiv';

SELECT id, name, time_zone, country FROM "organization" WHERE deleted_at IS NULL;

COMMIT;
