-- Share the beginner-friendly classes on the public booking page, for the one
-- academy with code 990001 (Alma beta).
--
-- A stranger asking about a trial should land on a class they can walk into.
-- "Beginner" and "All levels" are those; "Inter-Advanced" is not, and stays
-- private. Open mat is already shared and is left as it is -- this script only
-- ever sets the flag on, so nothing it does not name can be turned off by it.
--
-- Two writes, because the flag lives in two places: on the template, so classes
-- generated from now on inherit it, and on the future classes already sitting
-- on the 180-day horizon. Past classes are never touched.
--
-- Scoped by academy code rather than by title alone, so adding a second academy
-- with a class called "Beginner" cannot be caught by a re-run.
--
-- Safe to run twice: it writes only rows that are not already shared.
--
-- Run against Neon 2026-08-31: 8 templates matched, 6 flipped (Gi and NoGi
-- All levels, Gi Beginner), 311 future classes. Both Inter-Advanced templates
-- left private. The check reported zero still-private rows on every shared one.

BEGIN;

CREATE TEMP TABLE shared_templates ON COMMIT DROP AS
SELECT t.id
  FROM "class_template" t
  JOIN "organization" o ON o.id = t.academy_id
 WHERE o.public_code = '990001'
   AND t.deleted_at IS NULL
   AND (t.title ILIKE '%beginner%' OR t.title ILIKE '%all levels%');

UPDATE "class_template"
   SET public_bookable = true
 WHERE id IN (SELECT id FROM shared_templates)
   AND public_bookable IS DISTINCT FROM true;

UPDATE "class" c
   SET public_bookable = true
 WHERE c.template_id IN (SELECT id FROM shared_templates)
   AND c.starts_at > now()
   AND c.status = 'scheduled'
   AND c.deleted_at IS NULL
   AND c.public_bookable IS DISTINCT FROM true;

SELECT t.title,
       t.public_bookable AS template_shared,
       count(c.id) FILTER (
         WHERE c.starts_at > now()
           AND c.status = 'scheduled'
           AND c.deleted_at IS NULL
       ) AS future_classes,
       count(c.id) FILTER (
         WHERE c.starts_at > now()
           AND c.status = 'scheduled'
           AND c.deleted_at IS NULL
           AND NOT c.public_bookable
       ) AS still_private
  FROM "class_template" t
  JOIN "organization" o ON o.id = t.academy_id
  LEFT JOIN "class" c ON c.template_id = t.id
 WHERE o.public_code = '990001'
   AND t.deleted_at IS NULL
 GROUP BY 1, 2
 ORDER BY 2 DESC, 1;

COMMIT;
