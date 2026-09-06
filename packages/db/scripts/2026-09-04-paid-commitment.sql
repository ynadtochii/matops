-- A gym has agreed to pay. Run this by hand, once, for that gym (ADR 128).
--
-- The commercial fields are set out of band because collection is out of band:
-- there is no card, no invoice and no checkout in this codebase. This is the
-- one write that records the agreement, and it also records the milestone, so
-- the funnel has an end that means money rather than clicks.
--
-- Replace the four values, then run:
--   psql "$POSTGRES_URL&sslrootcert=system" -f packages/db/scripts/2026-09-04-paid-commitment.sql
--
--   :org      the organization id
--   :offer    'academy' or 'facility'
--   :price    the agreed monthly amount in minor units, e.g. 4900
--   :currency the ISO-4217 code, e.g. 'EUR'

BEGIN;

UPDATE "organization"
SET "offer" = 'academy',
    "agreed_price_minor" = 4900,
    "agreed_price_currency" = 'EUR',
    "pilot_ends_on" = NULL,
    "account_status" = 'active'
WHERE "id" = 'REPLACE_WITH_ORGANIZATION_ID';

INSERT INTO "product_event" ("organization_id", "kind", "name", "actor_role")
VALUES ('REPLACE_WITH_ORGANIZATION_ID', 'milestone', 'paid_commitment', 'system')
ON CONFLICT DO NOTHING;

COMMIT;
