-- Put the leading `+` back on lead phones stored before `normalizePhone` kept it.
--
-- `drop_in.phone` is both what the owner reads and dials back, and the dedupe
-- key behind `UNIQUE(academy_id, phone)`. It used to be digits only, so a
-- number typed as `+351912345678` was stored as `351912345678` and the country
-- code was indistinguishable from an area code. `normalizePhone` now keeps the
-- plus. Rows written before that keep the old shape, and a returning visitor
-- would miss the unique index and open a SECOND lead, which is exactly what
-- the index exists to stop. This fill closes that.
--
--   psql "$POSTGRES_URL&sslrootcert=system" -f packages/db/scripts/2026-08-31-lead-phone-plus.sql
--
-- It only touches a row it can read with no guessing: no plus already, and the
-- digits are the academy's own dial code followed by a full national number.
-- A row it cannot read that way is left alone. The cost of leaving one is a
-- duplicate lead the owner can merge by hand, and `matchLeadByPhone` compares
-- the last nine digits, so a lead becoming a member works either way.
--
-- Add a country's dial code below before running this against an academy the
-- list does not cover. NOT YET RUN.
BEGIN;

WITH dial(country, code) AS (VALUES ('PT', '351'), ('UA', '380'))
UPDATE "drop_in" d
   SET phone = '+' || d.phone
  FROM "organization" o, dial
 WHERE o.id = d.academy_id
   AND o.country = dial.country
   AND d.phone !~ '^\+'
   AND d.phone ~ ('^' || dial.code || '[0-9]{6,12}$');

SELECT d.academy_id, o.country, d.phone
  FROM "drop_in" d JOIN "organization" o ON o.id = d.academy_id
 ORDER BY d.created_at;

COMMIT;
