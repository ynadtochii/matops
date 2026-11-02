-- Copies each gym's old bank details (membership_policy.bank_details) into a
-- "Bank transfer" row of payment_method (ADR 158, migration 0016).
--
-- Touches: inserts one payment_method row per organization whose bank details
-- are not blank and which has no payment_method row yet.
-- Safe to run twice: the second run finds a row for every such gym and adds none.
-- Run on: any database that has bank details, after 0016 is applied. Dev had
-- none on 2026-10-28. Production has one real academy: check its
-- membership_policy.bank_details after 0016 deploys, and run this if set.
--
--   psql "$POSTGRES_URL&sslrootcert=system" -f packages/db/scripts/2026-10-28-bank-details-to-payment-method.sql

BEGIN;

INSERT INTO payment_method (organization_id, kind, label, details, enabled, position)
SELECT p.organization_id, 'bank', 'Bank transfer', btrim(p.bank_details), true, 0
FROM membership_policy p
WHERE btrim(p.bank_details) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM payment_method m WHERE m.organization_id = p.organization_id
  );

COMMIT;
