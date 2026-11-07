-- ADR 162: every active academy owner owns the gym.
-- Run once per database: psql "$POSTGRES_URL&sslrootcert=system" -f <this file>

BEGIN;

UPDATE "member" m
SET role = 'owner'
WHERE m.role <> 'owner'
  AND EXISTS (
    SELECT 1
    FROM entity_membership em
    WHERE em.user_id = m.user_id
      AND em.organization_id = m.organization_id
      AND em.role = 'owner'
      AND em.status = 'active'
  )
RETURNING m.id, m.organization_id, m.user_id, m.role;

COMMIT;
