-- Copy each gym's bank account from its default branch onto the organization
-- (ADR 127, plan step 2.2).
--
-- A script and not a migration: this is right once, on one database, while a
-- migration runs everywhere forever. Run it by hand:
--
--   psql "$POSTGRES_URL&sslrootcert=system" \
--     -f packages/db/scripts/2026-09-04-bank-details-to-organization.sql
--
-- Safe to run twice. The WHERE on the conflict clause means a second run writes
-- nothing, and an account already set on the organization is never overwritten.
--
-- `is_default` is the authority on which branch is the main one, not the id
-- equality ADR 124 also gives us: the flag is what the provisioner maintains.

\echo '--- dry run: what would be copied'

SELECT o.id AS organization_id,
       o.name,
       e.id  AS default_entity,
       ps.bank_details
FROM organization o
JOIN entity e
  ON e.organization_id = o.id AND e.is_default AND e.deleted_at IS NULL
JOIN payment_settings ps ON ps.academy_id = e.id
LEFT JOIN membership_policy mp ON mp.organization_id = o.id
WHERE ps.bank_details <> ''
  AND coalesce(mp.bank_details, '') = '';

\echo '--- applying'

INSERT INTO membership_policy (organization_id, bank_details)
SELECT o.id, ps.bank_details
FROM organization o
JOIN entity e
  ON e.organization_id = o.id AND e.is_default AND e.deleted_at IS NULL
JOIN payment_settings ps ON ps.academy_id = e.id
WHERE ps.bank_details <> ''
ON CONFLICT (organization_id) DO UPDATE
  SET bank_details = EXCLUDED.bank_details
  WHERE membership_policy.bank_details = '';

\echo '--- after: every organization with an account'

SELECT organization_id, grace_days, calendar_time_zone, bank_details
FROM membership_policy
ORDER BY organization_id;
