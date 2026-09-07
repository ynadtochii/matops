\set ON_ERROR_STOP on

\if :{?apply}
\else
  \set apply false
\endif

BEGIN;

INSERT INTO person (organization_id, name, email, phone, account_user_id)
SELECT m.organization_id, u.name, u.email, u.phone, u.id
FROM member m
JOIN "user" u ON u.id = m.user_id
ON CONFLICT (organization_id, account_user_id) DO NOTHING;

UPDATE entity_membership em
SET person_id = p.id
FROM person p
WHERE em.person_id IS NULL
  AND em.user_id IS NOT NULL
  AND p.organization_id = em.organization_id
  AND p.account_user_id = em.user_id;

UPDATE access_assignment a
SET person_id = p.id
FROM person p
WHERE a.person_id IS NULL
  AND a.user_id IS NOT NULL
  AND p.organization_id = a.organization_id
  AND p.account_user_id = a.user_id;

UPDATE access_assignment_change c
SET person_id = p.id
FROM person p
WHERE c.person_id IS NULL
  AND c.user_id IS NOT NULL
  AND p.organization_id = c.organization_id
  AND p.account_user_id = c.user_id;

UPDATE membership_purchase mp
SET person_id = p.id
FROM person p
WHERE mp.person_id IS NULL
  AND mp.user_id IS NOT NULL
  AND p.organization_id = mp.organization_id
  AND p.account_user_id = mp.user_id;

UPDATE class_participation cp
SET person_organization_id = e.organization_id, person_id = p.id
FROM entity e
JOIN person p ON p.organization_id = e.organization_id
WHERE cp.person_id IS NULL
  AND cp.student_id IS NOT NULL
  AND e.id = cp.academy_id
  AND p.account_user_id = cp.student_id;

SELECT 'entity_membership' AS table_name, count(*) AS missing_person
FROM entity_membership
WHERE user_id IS NOT NULL AND person_id IS NULL
UNION ALL
SELECT 'access_assignment', count(*)
FROM access_assignment
WHERE user_id IS NOT NULL AND person_id IS NULL
UNION ALL
SELECT 'access_assignment_change', count(*)
FROM access_assignment_change
WHERE user_id IS NOT NULL AND person_id IS NULL
UNION ALL
SELECT 'membership_purchase', count(*)
FROM membership_purchase
WHERE user_id IS NOT NULL AND person_id IS NULL
UNION ALL
SELECT 'class_participation', count(*)
FROM class_participation
WHERE student_id IS NOT NULL AND person_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM entity_membership WHERE user_id IS NOT NULL AND person_id IS NULL
    UNION ALL
    SELECT 1 FROM access_assignment WHERE user_id IS NOT NULL AND person_id IS NULL
    UNION ALL
    SELECT 1 FROM access_assignment_change WHERE user_id IS NOT NULL AND person_id IS NULL
    UNION ALL
    SELECT 1 FROM membership_purchase WHERE user_id IS NOT NULL AND person_id IS NULL
    UNION ALL
    SELECT 1 FROM class_participation WHERE student_id IS NOT NULL AND person_id IS NULL
  ) THEN
    RAISE EXCEPTION 'person subject backfill left account-only rows';
  END IF;
END $$;

\if :apply
  COMMIT;
  \echo 'committed'
\else
  ROLLBACK;
  \echo 'dry run rolled back; pass -v apply=true to commit'
\endif
