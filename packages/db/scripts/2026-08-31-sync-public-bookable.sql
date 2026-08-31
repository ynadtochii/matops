-- Sync `class.public_bookable` to the template that owns it, for the future
-- classes stranded by the missing field in `templateContentChanged`.
--
-- The flag is copied onto each class when it is generated, and a template edit
-- copies it onto the future classes again -- but only when the edit ran the
-- in-place update, and the change detector in packages/domain/src/class-edit.ts
-- did not look at this field. So an owner who ticked "Share this class
-- publicly" on an existing template saved the tick, saw it stay ticked, and
-- every class already on the 180-day horizon stayed private. The booking page
-- showed nothing.
--
-- The code is fixed, so this runs once, on databases that were live before the
-- fix. Ticking a template afterwards propagates on save.
--
-- FUTURE, non-cancelled, template-owned classes only. A one-off class carries
-- its own flag, set on the class form and never copied from anywhere, so it is
-- left alone.
--
-- Safe to run twice: it writes only rows that disagree with their template.
--
-- Run against Neon 2026-08-31: 77 rows, across three templates that were all
-- ticked on the template and private on the class. The re-check reported zero.

BEGIN;

UPDATE "class" c
   SET public_bookable = t.public_bookable
  FROM "class_template" t
 WHERE c.template_id = t.id
   AND c.academy_id = t.academy_id
   AND c.starts_at > now()
   AND c.status = 'scheduled'
   AND c.deleted_at IS NULL
   AND t.deleted_at IS NULL
   AND c.public_bookable IS DISTINCT FROM t.public_bookable;

-- Should report zero rows on a second run.
SELECT count(*) AS still_out_of_sync
  FROM "class" c
  JOIN "class_template" t
    ON t.id = c.template_id AND t.academy_id = c.academy_id
 WHERE c.starts_at > now()
   AND c.status = 'scheduled'
   AND c.deleted_at IS NULL
   AND t.deleted_at IS NULL
   AND c.public_bookable IS DISTINCT FROM t.public_bookable;

COMMIT;
