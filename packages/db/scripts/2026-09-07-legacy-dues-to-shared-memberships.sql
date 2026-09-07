\set ON_ERROR_STOP on

\if :{?apply}
\else
  \set apply false
\endif

BEGIN;

CREATE TEMP TABLE legacy_plan_map ON COMMIT DROP AS
SELECT p.id AS legacy_plan_id,
       md5('legacy-plan:' || p.id::text)::uuid AS shared_plan_id,
       e.organization_id,
       p.academy_id,
       p.name,
       p.price_minor,
       p.currency,
       p.deleted_at,
       p.created_at
  FROM membership_plan p
  JOIN entity e ON e.id = p.academy_id;

CREATE TEMP TABLE legacy_assignment_map ON COMMIT DROP AS
WITH assignment_key AS (
  SELECT d.academy_id, d.member_id, d.plan_id
    FROM member_dues d
  UNION
  SELECT c.academy_id, c.member_id, c.plan_id
    FROM payment_claim c
)
SELECT d.id AS legacy_dues_id,
       md5(
         'legacy-assignment:' || k.academy_id || ':' || k.member_id || ':' ||
         k.plan_id::text
       )::uuid AS shared_assignment_id,
       k.plan_id AS legacy_plan_id,
       pm.shared_plan_id,
       pm.organization_id,
       k.academy_id,
       k.member_id,
       em.person_id,
       em.user_id,
       coalesce(
         (SELECT min((c.period || '-01')::date)
            FROM payment_claim c
           WHERE c.academy_id = k.academy_id
             AND c.member_id = k.member_id
             AND c.plan_id = k.plan_id),
         date_trunc('month', d.created_at)::date
       ) AS start_month,
       d.next_due_at,
       coalesce(
         d.created_at,
         (SELECT min(c.created_at)
            FROM payment_claim c
           WHERE c.academy_id = k.academy_id
             AND c.member_id = k.member_id
             AND c.plan_id = k.plan_id)
       ) AS created_at
  FROM assignment_key k
  LEFT JOIN member_dues d
    ON d.academy_id = k.academy_id
   AND d.member_id = k.member_id
   AND d.plan_id = k.plan_id
  JOIN legacy_plan_map pm ON pm.legacy_plan_id = k.plan_id
  JOIN entity_membership em
    ON em.entity_id = k.academy_id AND em.id = k.member_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT d.academy_id, d.member_id, d.plan_id
      FROM member_dues d
    EXCEPT
    SELECT m.academy_id, m.member_id, m.legacy_plan_id
      FROM legacy_assignment_map m
  ) THEN
    RAISE EXCEPTION 'Legacy dues contain rows that cannot map to a shared assignment';
  END IF;

  IF EXISTS (
    SELECT c.academy_id, c.member_id, c.plan_id
      FROM payment_claim c
    EXCEPT
    SELECT m.academy_id, m.member_id, m.legacy_plan_id
      FROM legacy_assignment_map m
  ) THEN
    RAISE EXCEPTION 'Legacy claims contain rows that cannot map to a shared assignment';
  END IF;
END $$;

INSERT INTO access_plan
  (id, organization_id, name, price_minor, currency, archived_at, created_at, updated_at)
SELECT shared_plan_id,
       organization_id,
       name,
       price_minor,
       currency,
       deleted_at,
       created_at,
       created_at
  FROM legacy_plan_map
ON CONFLICT (id) DO NOTHING;

INSERT INTO access_plan_price
  (organization_id, plan_id, effective_month, price_minor, currency, created_at)
SELECT organization_id,
       shared_plan_id,
       date_trunc('month', created_at)::date,
       price_minor,
       currency,
       created_at
  FROM legacy_plan_map
ON CONFLICT (plan_id, effective_month) DO NOTHING;

INSERT INTO access_plan_entity (organization_id, plan_id, entity_id, created_at)
SELECT organization_id, shared_plan_id, academy_id, created_at
  FROM legacy_plan_map
ON CONFLICT (plan_id, entity_id) DO NOTHING;

INSERT INTO access_assignment
  (id, organization_id, user_id, person_id, plan_id, assigning_entity_id,
   start_month, status, created_at, updated_at)
SELECT shared_assignment_id,
       organization_id,
       user_id,
       person_id,
       shared_plan_id,
       academy_id,
       start_month,
       CASE WHEN legacy_dues_id IS NULL THEN 'cancelled' ELSE 'active' END,
       created_at,
       created_at
  FROM legacy_assignment_map
ON CONFLICT (id) DO NOTHING;

INSERT INTO membership_month
  (organization_id, assignment_id, month, paid, recorded_at, created_at, updated_at)
SELECT m.organization_id,
       m.shared_assignment_id,
       (c.period || '-01')::date,
       true,
       c.confirmed_at,
       c.created_at,
       c.updated_at
  FROM payment_claim c
  JOIN legacy_assignment_map m
    ON m.academy_id = c.academy_id
   AND m.member_id = c.member_id
   AND m.legacy_plan_id = c.plan_id
 WHERE c.status = 'confirmed'
ON CONFLICT (assignment_id, month) DO UPDATE
  SET paid = true,
      recorded_at = coalesce(membership_month.recorded_at, EXCLUDED.recorded_at),
      updated_at = greatest(membership_month.updated_at, EXCLUDED.updated_at);

INSERT INTO membership_month
  (organization_id, assignment_id, month, paid, recorded_at, created_at, updated_at)
SELECT organization_id,
       shared_assignment_id,
       (date_trunc('month', next_due_at) - interval '1 month')::date,
       true,
       next_due_at,
       created_at,
       created_at
  FROM legacy_assignment_map
 WHERE next_due_at > created_at
ON CONFLICT (assignment_id, month) DO UPDATE
  SET paid = true,
      recorded_at = coalesce(membership_month.recorded_at, EXCLUDED.recorded_at);

INSERT INTO membership_month
  (organization_id, assignment_id, month, paid, claimed_at, created_at, updated_at)
SELECT m.organization_id,
       m.shared_assignment_id,
       (c.period || '-01')::date,
       false,
       c.claimed_at,
       c.created_at,
       c.updated_at
  FROM payment_claim c
  JOIN legacy_assignment_map m
    ON m.academy_id = c.academy_id
   AND m.member_id = c.member_id
   AND m.legacy_plan_id = c.plan_id
 WHERE c.status = 'pending'
ON CONFLICT (assignment_id, month) DO UPDATE
  SET claimed_at = coalesce(membership_month.claimed_at, EXCLUDED.claimed_at),
      updated_at = greatest(membership_month.updated_at, EXCLUDED.updated_at);

INSERT INTO membership_month_audit
  (organization_id, assignment_id, month, was_paid, paid, actor_id, created_at)
SELECT m.organization_id,
       m.shared_assignment_id,
       (c.period || '-01')::date,
       null,
       true,
       c.confirmed_by,
       coalesce(c.confirmed_at, c.updated_at)
  FROM payment_claim c
  JOIN legacy_assignment_map m
    ON m.academy_id = c.academy_id
   AND m.member_id = c.member_id
   AND m.legacy_plan_id = c.plan_id
 WHERE c.status = 'confirmed'
   AND NOT EXISTS (
     SELECT 1
       FROM membership_month_audit a
      WHERE a.assignment_id = m.shared_assignment_id
        AND a.month = (c.period || '-01')::date
        AND a.paid = true
   );

INSERT INTO membership_purchase
  (id, organization_id, user_id, person_id, entity_id, plan_id, plan_name,
   price_minor, currency, start_month, entity_ids, branch_names, version,
   reference, status, reason, assignment_id, claimed_at, confirmed_at,
   reviewed_by, reviewed_at, created_at)
SELECT md5('legacy-claim:' || c.id::text)::uuid,
       m.organization_id,
       m.user_id,
       m.person_id,
       c.academy_id,
       m.shared_plan_id,
       pm.name,
       c.amount_minor,
       c.currency,
       (c.period || '-01')::date,
       ARRAY[c.academy_id],
       ARRAY[e.name],
       'legacy-dues-v1:' || c.status::text,
       'legacy-claim:' || c.id::text,
       CASE
         WHEN c.status = 'confirmed' THEN 'confirmed'
         WHEN c.status = 'pending' THEN 'claimed'
         ELSE 'rejected'
       END,
       CASE
         WHEN c.status = 'pending' THEN 'Converted from an open legacy claim'
         WHEN c.status = 'rejected' THEN 'Converted from a rejected legacy claim'
         ELSE 'Converted from a confirmed legacy claim'
       END,
       m.shared_assignment_id,
       c.claimed_at,
       c.confirmed_at,
       c.confirmed_by,
       c.confirmed_at,
       c.created_at
  FROM payment_claim c
  JOIN legacy_assignment_map m
    ON m.academy_id = c.academy_id
   AND m.member_id = c.member_id
   AND m.legacy_plan_id = c.plan_id
  JOIN legacy_plan_map pm ON pm.legacy_plan_id = c.plan_id
  JOIN entity e ON e.id = c.academy_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO membership_policy
  (organization_id, grace_days, bank_details, created_at, updated_at)
SELECT DISTINCT ON (e.organization_id)
       e.organization_id,
       ps.grace_days,
       ps.bank_details,
       ps.created_at,
       ps.updated_at
  FROM payment_settings ps
  JOIN entity e ON e.id = ps.academy_id
 ORDER BY e.organization_id, e.is_default DESC, ps.created_at
ON CONFLICT (organization_id) DO UPDATE
  SET grace_days = EXCLUDED.grace_days,
      bank_details = CASE
        WHEN membership_policy.bank_details = '' THEN EXCLUDED.bank_details
        ELSE membership_policy.bank_details
      END,
      updated_at = greatest(membership_policy.updated_at, EXCLUDED.updated_at);

UPDATE entity e
   SET membership_enforced_at = ps.enforced_at,
       updated_at = greatest(e.updated_at, ps.updated_at)
  FROM payment_settings ps
 WHERE ps.academy_id = e.id
   AND e.membership_enforced_at IS NULL
   AND ps.enforced_at IS NOT NULL;

SELECT (SELECT count(*) FROM membership_plan) AS legacy_plans,
       (SELECT count(*) FROM member_dues) AS legacy_dues,
       (SELECT count(*) FROM payment_claim) AS legacy_claims,
       (SELECT count(*)
          FROM access_plan p
          JOIN legacy_plan_map m ON m.shared_plan_id = p.id) AS shared_plans,
       (SELECT count(*)
          FROM access_assignment a
          JOIN legacy_assignment_map m ON m.shared_assignment_id = a.id)
         AS shared_assignments,
       (SELECT count(*)
          FROM membership_month mm
          JOIN legacy_assignment_map m ON m.shared_assignment_id = mm.assignment_id)
         AS shared_months,
       (SELECT count(*)
          FROM payment_claim c
          JOIN membership_purchase p
            ON p.reference = 'legacy-claim:' || c.id::text) AS preserved_claims;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM payment_claim c
      LEFT JOIN membership_purchase p
        ON p.reference = 'legacy-claim:' || c.id::text
     WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Not every legacy claim was preserved';
  END IF;
END $$;

\if :apply
  DELETE FROM payment_claim;
  DELETE FROM member_dues;
  DELETE FROM membership_plan;
  DELETE FROM payment_settings;
  COMMIT;
  \echo 'Legacy dues converted and cleared.'
\else
  ROLLBACK;
  \echo 'Dry run complete. Pass -v apply=true to convert and clear legacy dues.'
\endif
