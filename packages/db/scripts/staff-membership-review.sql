BEGIN TRANSACTION READ ONLY;

WITH branch_access AS (
  SELECT e.organization_id, e.id AS entity_id, e.name AS branch_name,
    m.user_id,
    CASE WHEN em.role = 'owner' THEN 'owner'
      WHEN m.role IN ('owner', 'manager') THEN m.role
      ELSE em.role END AS role,
    CASE WHEN m.role IN ('owner', 'manager') THEN 'active'
      ELSE em.status END AS status,
    (m.role IN ('owner', 'manager') OR
      (em.role IN ('owner', 'manager', 'instructor') AND em.status = 'active')) AS staff_access
  FROM entity e
  JOIN organization o ON o.id = e.organization_id AND o.deleted_at IS NULL
  JOIN member m ON m.organization_id = e.organization_id
  LEFT JOIN entity_membership em ON em.entity_id = e.id AND em.user_id = m.user_id
  WHERE e.deleted_at IS NULL
), active_assignments AS (
  SELECT a.*, p.name AS plan_name
  FROM access_assignment a
  JOIN access_plan p ON p.id = a.plan_id
  LEFT JOIN membership_policy policy ON policy.organization_id = a.organization_id
  LEFT JOIN entity home ON home.organization_id = a.organization_id
    AND home.is_default = true AND home.deleted_at IS NULL
  WHERE a.status = 'active'
    AND a.start_month <= date_trunc('month', now() AT TIME ZONE
      coalesce(policy.calendar_time_zone, home.time_zone, 'UTC'))::date
    AND (a.end_month IS NULL OR a.end_month > date_trunc('month', now() AT TIME ZONE
      coalesce(policy.calendar_time_zone, home.time_zone, 'UTC'))::date)
)
SELECT a.organization_id, a.user_id, u.name, a.id AS assignment_id, a.plan_name,
  array_agg(b.branch_name ORDER BY b.branch_name) FILTER (WHERE b.staff_access) AS staff_branches,
  array_agg(b.branch_name ORDER BY b.branch_name) FILTER (WHERE NOT coalesce(b.staff_access, false)) AS other_branches,
  bool_and(coalesce(b.staff_access, false)) AS staff_only_plan,
  (SELECT count(*) FROM class_participation cp
    JOIN "class" ci ON ci.id = cp.class_id
    WHERE cp.student_id = a.user_id AND cp.booking_status = 'booked'
      AND ci.starts_at > now() AND ci.deleted_at IS NULL
      AND cp.academy_id IN (SELECT entity_id FROM access_plan_entity WHERE plan_id = a.plan_id)
  ) AS future_bookings
FROM active_assignments a
JOIN "user" u ON u.id = a.user_id
JOIN access_plan_entity coverage ON coverage.plan_id = a.plan_id
JOIN branch_access b ON b.entity_id = coverage.entity_id AND b.user_id = a.user_id
GROUP BY a.organization_id, a.user_id, u.name, a.id, a.plan_id, a.plan_name
HAVING bool_or(coalesce(b.staff_access, false))
ORDER BY a.organization_id, u.name, a.plan_name;

COMMIT;
