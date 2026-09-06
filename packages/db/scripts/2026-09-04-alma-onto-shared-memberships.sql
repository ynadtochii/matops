-- Move ONE BJJ branch off the legacy branch dues (ADR 40) and onto the shared
-- memberships (ADR 126). Written for Alma beta on dev; the ids at the top are
-- the only thing that ties it to that gym.
--
-- ADR 126 §6 says migrating an existing BJJ branch is not authorized by the
-- note itself, and the rollout section says any assignment backfill is "a
-- separate reviewed script under packages/db/scripts with a dry run". This is
-- that script. Read it before you run it.
--
-- What it does, in this order and in one transaction:
--
--   1. Prints the branch as it stands: legacy plans, dues rows, claims, the
--      roster, and any shared memberships already assigned.
--   2. Deletes the branch's legacy payment records: every `payment_claim`,
--      every `member_dues` row, every `membership_plan`. They are what the
--      Payments screen used to show and what the old gate used to read.
--   3. Gives every ACTIVE STUDENT of the branch the named shared plan, one
--      assignment each, starting this month. Somebody who already holds that
--      plan is skipped, so a second run adds nothing.
--   4. Stamps `entity.membership_enforced_at`, which is the switch: from that
--      moment the shared membership decides who may book here and the legacy
--      gate is never consulted again.
--
-- What it deliberately does NOT do:
--
--   * It does not infer a PAID month from a legacy due date. A paid month is a
--     record that money arrived, and a due date three weeks away is not that.
--     Everyone assigned here starts in their join month, which gives them
--     seven days from today to pay, and the owner ticks each month paid on the
--     member's Membership tab. The report in step 1 lists who was paid up
--     under the old dues so that ticking is a short job, not a guess.
--   * It does not touch `payment_requisites`. The bank details are still shown
--     and the money still arrives by transfer.
--   * It does not touch `payment_settings`. Once `membership_enforced_at` is
--     set, nothing reads it; clearing it would be a second thing to undo.
--   * It does not touch any other branch of the gym, or any other gym.
--
-- ROLLING BACK is not symmetric, and this is the trap ADR 126's rollback
-- section names. Clearing `membership_enforced_at` hands the branch back to
-- the legacy gate, whose plans and dues this script has just deleted, so the
-- branch would admit EVERYBODY. If you need to undo this, restore the legacy
-- rows first, or suspend the assignments instead.
--
-- Safe to run twice: the deletes are idempotent by nature, the insert skips a
-- plan somebody already holds, and the activation stamp is only written when
-- it is still null.
--
-- DRY RUN BY DEFAULT. It runs the whole thing, prints what changed, then rolls
-- back:
--
--   psql "$POSTGRES_URL" -f packages/db/scripts/2026-09-04-alma-onto-shared-memberships.sql
--
-- To keep it, pass apply:
--
--   psql "$POSTGRES_URL" -v apply=true -f packages/db/scripts/2026-09-04-alma-onto-shared-memberships.sql
--
-- Not run against anything yet.

\set ON_ERROR_STOP on

\if :{?apply}
\else
  \set apply false
\endif

-- The gym, the branch to move, and the plan its students get. The plan must
-- already exist and must already cover this branch: making one is the owner's
-- decision on the Memberships screen, not a script's.
\set org 'seed_org_alma'
\set branch 'seed_org_alma'
\set plan_name 'BJJ unlim'

BEGIN;

\echo '== before =='

SELECT e.name AS branch,
       e.type,
       e.membership_enforced_at,
       (SELECT count(*) FROM membership_plan p
         WHERE p.academy_id = e.id)                    AS legacy_plans,
       (SELECT count(*) FROM member_dues d
         WHERE d.academy_id = e.id)                    AS legacy_dues,
       (SELECT count(*) FROM payment_claim c
         WHERE c.academy_id = e.id)                    AS legacy_claims,
       (SELECT count(*) FROM entity_membership m
         WHERE m.entity_id = e.id
           AND m.role = 'student'
           AND m.status = 'active')                    AS active_students
  FROM entity e
 WHERE e.id = :'branch'
   AND e.organization_id = :'org';

SELECT p.id, p.name, p.archived_at,
       (SELECT count(*) FROM access_plan_entity pe
         WHERE pe.plan_id = p.id)                      AS covers_branches,
       (SELECT count(*) FROM access_assignment a
         WHERE a.plan_id = p.id AND a.status = 'active') AS active_holders
  FROM access_plan p
 WHERE p.organization_id = :'org'
   AND p.name = :'plan_name';

\echo '-- paid up under the OLD dues, so their month is worth ticking by hand'

SELECT u.email,
       u.name,
       d.next_due_at
  FROM member_dues d
  JOIN entity_membership m
    ON m.entity_id = d.academy_id AND m.id = d.member_id
  JOIN "user" u ON u.id = m.user_id
 WHERE d.academy_id = :'branch'
   AND d.next_due_at > now()
 ORDER BY d.next_due_at;

\echo '== 2. delete the legacy payment records =='

DELETE FROM payment_claim WHERE academy_id = :'branch';
DELETE FROM member_dues WHERE academy_id = :'branch';
DELETE FROM membership_plan WHERE academy_id = :'branch';

\echo '== 3. assign the shared plan to every active student =='

-- The month is the organization's own, the same fallback chain the request-time
-- reader uses: the owner's chosen zone, else the default branch's, else UTC.
-- A start month of THIS month means each assignment is in its join month, so
-- everybody gets seven days from today rather than a deadline that has passed.
WITH calendar AS (
  SELECT date_trunc(
           'month',
           (now() AT TIME ZONE coalesce(
             (SELECT pol.calendar_time_zone FROM membership_policy pol
               WHERE pol.organization_id = :'org'),
             (SELECT e.time_zone FROM entity e
               WHERE e.organization_id = :'org' AND e.is_default AND e.time_zone IS NOT NULL),
             'UTC'))
         )::date AS month
),
plan AS (
  SELECT p.id
    FROM access_plan p
    JOIN access_plan_entity pe
      ON pe.plan_id = p.id AND pe.entity_id = :'branch'
   WHERE p.organization_id = :'org'
     AND p.name = :'plan_name'
     AND p.archived_at IS NULL
),
owner_of AS (
  SELECT m.user_id
    FROM member m
   WHERE m.organization_id = :'org' AND m.role = 'owner'
   LIMIT 1
)
INSERT INTO access_assignment
  (organization_id, user_id, plan_id, assigning_entity_id, start_month, status, assigned_by)
SELECT :'org',
       em.user_id,
       plan.id,
       :'branch',
       calendar.month,
       'active',
       owner_of.user_id
  FROM entity_membership em
 CROSS JOIN plan
 CROSS JOIN calendar
  LEFT JOIN owner_of ON true
 WHERE em.entity_id = :'branch'
   AND em.role = 'student'
   AND em.status = 'active'
ON CONFLICT (plan_id, user_id) DO NOTHING;

\echo '== 4. the branch switches gate =='

UPDATE entity
   SET membership_enforced_at = now(),
       updated_at = now()
 WHERE id = :'branch'
   AND organization_id = :'org'
   AND membership_enforced_at IS NULL;

\echo '== after =='

SELECT e.name AS branch,
       e.membership_enforced_at,
       (SELECT count(*) FROM membership_plan p
         WHERE p.academy_id = e.id)                    AS legacy_plans,
       (SELECT count(*) FROM member_dues d
         WHERE d.academy_id = e.id)                    AS legacy_dues,
       (SELECT count(*) FROM payment_claim c
         WHERE c.academy_id = e.id)                    AS legacy_claims,
       (SELECT count(*) FROM access_assignment a
         WHERE a.organization_id = e.organization_id
           AND a.status = 'active')                    AS active_memberships
  FROM entity e
 WHERE e.id = :'branch';

\echo '-- every active student should hold one, and this should be empty'

SELECT u.email, u.name
  FROM entity_membership em
  JOIN "user" u ON u.id = em.user_id
 WHERE em.entity_id = :'branch'
   AND em.role = 'student'
   AND em.status = 'active'
   AND NOT EXISTS (
     SELECT 1 FROM access_assignment a
      JOIN access_plan_entity pe ON pe.plan_id = a.plan_id
      WHERE a.user_id = em.user_id
        AND a.organization_id = :'org'
        AND a.status = 'active'
        AND pe.entity_id = :'branch'
   );

\if :apply
  COMMIT;
  \echo '== committed =='
\else
  ROLLBACK;
  \echo '== dry run, rolled back. Pass -v apply=true to keep it. =='
\endif
