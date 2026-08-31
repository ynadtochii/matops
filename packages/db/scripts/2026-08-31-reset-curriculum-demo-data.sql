-- Reset the curriculum of the demo academy (code 990001, "Alma beta") and refill
-- it with a plan that exercises every part of the feature.
--
-- What it removes, for that academy only: every curriculum_block (placement),
-- every curriculum_block_template (library block), every curriculum_track, and
-- the track pointer on every class_template. Nothing outside the academy with
-- public_code 990001 is read or written.
--
-- What it puts back:
--   * 3 tracks: Fundamentals (the default), No-gi, Competition.
--   * 22 library blocks across 6 categories, 3 of them left unplaced so the
--     library has spare blocks to drag.
--   * 14 stretches of weeks, contiguous and Monday-aligned inside each track,
--     spanning settled, running and draft: Fundamentals runs from 8 weeks back
--     to 8 weeks ahead, No-gi from 4 back to 5 ahead, Competition from this week
--     to 12 ahead.
--   * 3 stretches carry more than one block (2, 2 and 3 themes at once), so the
--     card draws columns.
--   * 3 placements carry a run note; the library blocks carry teaching notes.
--   * Class templates get a track: Gi Beginner and Gi All levels -> Fundamentals,
--     NoGi All levels -> No-gi, both Inter-Advanced -> Competition. Open mat is
--     left without one on purpose, so the fall-back to the default track is
--     covered too.
--
-- Every date is derived from date_trunc('week', current_date), which is the
-- Monday of the week the script runs in. So the plan is always relative to today
-- and there is nothing to re-date later.
--
-- Safe to run twice: it deletes the academy's curriculum whole and rebuilds it.
-- Row ids change on each run, so a browser tab open on the screen should be
-- reloaded after it.
--
-- Run against Neon 2026-08-31.

BEGIN;

CREATE TEMP TABLE target ON COMMIT DROP AS
SELECT id AS academy_id FROM "organization" WHERE public_code = '990001';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM target) THEN
    RAISE EXCEPTION 'no academy with public_code 990001';
  END IF;
END $$;

DELETE FROM "curriculum_block"
 WHERE academy_id IN (SELECT academy_id FROM target);

UPDATE "class_template"
   SET curriculum_track_id = NULL
 WHERE academy_id IN (SELECT academy_id FROM target)
   AND curriculum_track_id IS NOT NULL;

DELETE FROM "curriculum_block_template"
 WHERE academy_id IN (SELECT academy_id FROM target);

DELETE FROM "curriculum_track"
 WHERE academy_id IN (SELECT academy_id FROM target);

CREATE TEMP TABLE new_track ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, v.name, v.is_default
  FROM (VALUES
    ('Fundamentals', true),
    ('No-gi', false),
    ('Competition', false)
  ) AS v(name, is_default);

INSERT INTO "curriculum_track" (id, academy_id, name, is_default)
SELECT t.id, a.academy_id, t.name, t.is_default FROM new_track t, target a;

CREATE TEMP TABLE new_block ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, v.theme, v.category, v.default_weeks, v.notes
  FROM (VALUES
    ('Closed guard: attacks',              'guard',    2, 'Break the posture first. Armbar, triangle, hip bump from the same grip.'),
    ('Guard retention',                    'guard',    2, 'Frames, hip escape, recovering a leg. No submissions this block.'),
    ('Half guard: top and bottom',         'guard',    3, 'Knee shield, the underhook battle, coming up on the single.'),
    ('De la Riva and berimbolo',           'guard',    3, 'Gi only. Hooks, the sleeve grip, inverting to the back.'),
    ('Knee cut passing',                   'passing',  2, 'Underhook, shoulder pressure, cross face. Slow and heavy.'),
    ('Body lock passing',                  'passing',  2, 'No-gi staple. Head over the hips, walk them down.'),
    ('Guard passing under pressure',       'passing',  4, 'Competition pace: pass, hold three seconds, score.'),
    ('Torreando and leg drags',            'passing',  2, 'Pants or shin grips, move them, take the back off the drag.'),
    ('Side control: attacks',              'pin',      3, 'Kimura, arm triangle, stepping over to mount.'),
    ('Side control: escapes',              'escape',   3, 'Frame, shrimp, come to the knees. Never bench press.'),
    ('Mount: attacks',                     'pin',      2, 'Grapevine to hold, s-mount, collar chokes, armbar off the push.'),
    ('Mount: escapes',                     'escape',   2, 'Elbow to knee, bridge and roll, the two are one drill.'),
    ('Turtle: attack and defence',         'escape',   2, 'Seat belt on top, wrestle-up or granby underneath.'),
    ('Back attacks and finishes',          'finish',   4, 'Seat belt, hooks or body triangle, RNC and bow and arrow.'),
    ('Armbar from everywhere',             'finish',   2, 'Guard, mount, back. Same mechanics, different entry.'),
    ('Guillotine variations',              'finish',   3, 'High elbow, arm in, low elbow. Which one the head position gives you.'),
    ('Front headlock system',              'finish',   3, 'Snap down, chin strap, go behind. The whole chain.'),
    ('Arm-in chokes',                      'finish',   3, 'Anaconda, D''Arce, Peruvian necktie.'),
    ('Leg entanglements: ashi garami',     'finish',   2, 'Entries and the straight ankle lock. No heel hooks in class.'),
    ('Standing: grip fighting and takedowns','takedown',2,'Collar and sleeve, snap down, single leg. Land in the pass.'),
    ('Wrestling up from guard',            'takedown', 2, 'Shot from seated, hand fighting, the elevator sweep as the answer.'),
    ('Comp prep: takedown to pass',        'takedown', 4, 'One chain from the feet into a scoring pass. Rounds every session.')
  ) AS v(theme, category, default_weeks, notes);

INSERT INTO "curriculum_block_template" (id, academy_id, theme, category, default_weeks, notes)
SELECT b.id, a.academy_id, b.theme, b.category, b.default_weeks, b.notes
  FROM new_block b, target a;

CREATE TEMP TABLE new_slot ON COMMIT DROP AS
SELECT gen_random_uuid() AS slot_id,
       v.track_name,
       (date_trunc('week', current_date)::date + v.offset_weeks * 7) AS starts_on,
       (date_trunc('week', current_date)::date + v.offset_weeks * 7 + v.weeks * 7 - 1) AS ends_on,
       v.weeks,
       v.ord
  FROM (VALUES
    ('Fundamentals', 1, -8, 2),
    ('Fundamentals', 2, -6, 2),
    ('Fundamentals', 3, -4, 3),
    ('Fundamentals', 4, -1, 2),
    ('Fundamentals', 5,  1, 2),
    ('Fundamentals', 6,  3, 3),
    ('Fundamentals', 7,  6, 2),
    ('No-gi',        1, -4, 2),
    ('No-gi',        2, -2, 3),
    ('No-gi',        3,  1, 2),
    ('No-gi',        4,  3, 2),
    ('Competition',  1,  0, 4),
    ('Competition',  2,  4, 4),
    ('Competition',  3,  8, 4)
  ) AS v(track_name, ord, offset_weeks, weeks);

CREATE TEMP TABLE new_placement ON COMMIT DROP AS
SELECT * FROM (VALUES
  ('Fundamentals', 1, 'Closed guard: attacks',                 NULL),
  ('Fundamentals', 2, 'Guard retention',                       NULL),
  ('Fundamentals', 3, 'Side control: attacks',                 NULL),
  ('Fundamentals', 3, 'Side control: escapes',                 'Escapes on Tuesday, attacks on Thursday.'),
  ('Fundamentals', 4, 'Mount: attacks',                        NULL),
  ('Fundamentals', 4, 'Mount: escapes',                        NULL),
  ('Fundamentals', 5, 'Armbar from everywhere',                'Belt gradings on the Friday of week two.'),
  ('Fundamentals', 6, 'Half guard: top and bottom',            NULL),
  ('Fundamentals', 7, 'Standing: grip fighting and takedowns', NULL),
  ('No-gi',        1, 'Body lock passing',                     NULL),
  ('No-gi',        2, 'Front headlock system',                 NULL),
  ('No-gi',        2, 'Guillotine variations',                 NULL),
  ('No-gi',        2, 'Arm-in chokes',                         NULL),
  ('No-gi',        3, 'Leg entanglements: ashi garami',        'Straight ankle only. No heel hooks, white and blue in the room.'),
  ('No-gi',        4, 'Wrestling up from guard',               NULL),
  ('Competition',  1, 'Comp prep: takedown to pass',           NULL),
  ('Competition',  2, 'Guard passing under pressure',          NULL),
  ('Competition',  3, 'Back attacks and finishes',             NULL)
) AS v(track_name, ord, theme, note);

INSERT INTO "curriculum_block"
  (academy_id, track_id, slot_id, template_id, notes, starts_on, ends_on, weeks)
SELECT a.academy_id, t.id, s.slot_id, b.id, p.note, s.starts_on, s.ends_on, s.weeks
  FROM new_placement p
  JOIN new_slot s  ON s.track_name = p.track_name AND s.ord = p.ord
  JOIN new_track t ON t.name = p.track_name
  JOIN new_block b ON b.theme = p.theme
  CROSS JOIN target a;

UPDATE "class_template" ct
   SET curriculum_track_id = t.id,
       updated_at = now()
  FROM new_track t
 WHERE ct.academy_id IN (SELECT academy_id FROM target)
   AND ct.deleted_at IS NULL
   AND t.name = CASE
         WHEN ct.title ILIKE '%inter-advanced%' THEN 'Competition'
         WHEN ct.title ILIKE 'nogi%'            THEN 'No-gi'
         WHEN ct.title ILIKE 'gi%'              THEN 'Fundamentals'
       END;

SELECT t.name AS track,
       t.is_default,
       count(DISTINCT b.slot_id) AS stretches,
       count(b.id)               AS blocks,
       min(b.starts_on)          AS from_day,
       max(b.ends_on)            AS to_day,
       count(b.id) FILTER (WHERE b.starts_on <= current_date AND b.ends_on >= current_date) AS running_now
  FROM "curriculum_track" t
  LEFT JOIN "curriculum_block" b ON b.track_id = t.id
 WHERE t.academy_id IN (SELECT academy_id FROM target)
 GROUP BY 1, 2
 ORDER BY 2 DESC, 1;

SELECT count(*) AS library_blocks,
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM "curriculum_block" b WHERE b.template_id = tpl.id
       )) AS never_placed
  FROM "curriculum_block_template" tpl
 WHERE tpl.academy_id IN (SELECT academy_id FROM target);

SELECT ct.title, coalesce(t.name, '(default track)') AS track
  FROM "class_template" ct
  LEFT JOIN "curriculum_track" t ON t.id = ct.curriculum_track_id
 WHERE ct.academy_id IN (SELECT academy_id FROM target)
   AND ct.deleted_at IS NULL
 GROUP BY 1, 2
 ORDER BY 1;

COMMIT;
