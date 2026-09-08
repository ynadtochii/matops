WITH shift AS (
  SELECT academy_id,
         EXTRACT(ISODOW FROM MIN(starts_on))::int - 1 AS days
  FROM "curriculum_block"
  GROUP BY academy_id
  HAVING EXTRACT(ISODOW FROM MIN(starts_on))::int > 1
)
UPDATE "curriculum_block" b
SET starts_on = b.starts_on - s.days,
    ends_on = b.ends_on - s.days,
    updated_at = now()
FROM shift s
WHERE b.academy_id = s.academy_id;
