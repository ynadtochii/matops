-- Add the first no-gi curriculum library to one active academy.
--
-- Scope: curriculum_block_template rows for the academy selected by its
-- six-digit entity.public_code. This script does not create tracks, timeline
-- placements, dates, or class assignments. It never deletes or updates rows.
--
-- Safe to run twice: an existing theme in the same academy is left unchanged.
-- Theme matching ignores case and surrounding spaces.
--
-- Run from the repository root:
--   pnpm -F @matops/db with-env sh -c 'psql "$POSTGRES_URL" -v academy_code=123456 -f scripts/2026-09-03-add-nogi-curriculum-library.sql'
--
-- NOT YET RUN.

\set ON_ERROR_STOP on

\if :{?academy_code}
\else
  \echo 'Pass the academy code with -v academy_code=123456'
  \quit 1
\endif

BEGIN;

CREATE TEMP TABLE target_academy ON COMMIT DROP AS
SELECT id AS academy_id, name, public_code
  FROM "entity"
 WHERE public_code = :'academy_code'
   AND type = 'bjj_academy'
   AND status = 'active'
   AND deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM target_academy) THEN
    RAISE EXCEPTION 'No active BJJ academy found with that public code';
  END IF;
END $$;

SELECT academy_id, name, public_code FROM target_academy;

CREATE TEMP TABLE nogi_block_source (
  theme text PRIMARY KEY,
  category text NOT NULL,
  notes text NOT NULL
) ON COMMIT DROP;

INSERT INTO nogi_block_source (theme, category, notes)
VALUES
  (
    'Stance, movement, and boundary',
    'Standing',
    'Keep a usable base while managing distance, direction, and the edge of the training area. Build safe falling and returns to standing into the same problem.'
  ),
  (
    'First contact and grip fighting',
    'Standing',
    'Enter contact with purpose. Work through wrist, elbow, collar-tie, underhook, overhook, body-lock, and head-and-arm connections without pausing after a grip breaks.'
  ),
  (
    'Off-balancing and takedown entries',
    'Standing',
    'Use pressure, pulls, snaps, level changes, and angles to disturb posture before attaching to the legs or body.'
  ),
  (
    'Takedown finishes and counters',
    'Standing',
    'Finish single legs, double legs, body locks, rear body locks, and snap-downs against resistance. Defenders work sprawls, whizzers, disengagement, front headlocks, and reattacks.'
  ),
  (
    'Takedown to top control',
    'Standing',
    'Keep connection after the opponent touches the floor. Continue directly into a pass, pin, back exposure, or controlled return to standing.'
  ),
  (
    'Guard engagement and connection',
    'Guard',
    'Build useful no-gi contact from seated or supine guard while the top player chooses a safe entry. Include guard pulls that land with immediate connection.'
  ),
  (
    'Guard retention: orientation and distance',
    'Guard',
    'Keep the hips facing the passer and manage distance with the feet, knees, hands, and head. Recover before the passer controls the hips.'
  ),
  (
    'Guard retention: lines and frames',
    'Guard',
    'Protect and recover the foot, knee, hip, and chest lines. Use frames, wedges, hooks, and defensive shells while the passer works through them.'
  ),
  (
    'Late guard recovery',
    'Guard',
    'Continue solving after the passer crosses the knee line or begins chest contact. Choose guard recovery, standing, wrestling up, or a safe leg entry.'
  ),
  (
    'Guard offense: off-balancing and angles',
    'Guard',
    'Disturb the top player''s base before sweeping, taking the back, entering the legs, or standing. Keep connection while changing angle.'
  ),
  (
    'Guard offense: sweeps, wrestle-ups, and back takes',
    'Guard',
    'Chain attacks from the opponent''s defensive reaction. Finish sweeps and wrestle-ups with stable top control instead of stopping at the reversal.'
  ),
  (
    'Passing around the legs',
    'Guard',
    'Engage seated and supine guards, control the leg line, change direction, and settle chest or hip control before the guard player recovers.'
  ),
  (
    'Passing through and under the legs',
    'Guard',
    'Cross the knee line through inside, pressure, half-guard, knee-shield, and under-leg problems. Combine pressure with direction changes when the first route closes.'
  ),
  (
    'Side control and north-south',
    'Pins',
    'Top holds or advances by controlling the chest, hips, head, or limbs for the current problem. Bottom builds frames, creates an angle, and recovers guard, reverses, or stands.'
  ),
  (
    'Mount control and escape',
    'Pins',
    'Top maintains base, removes frames, and isolates limbs while advancing. Bottom protects alignment, connects elbows to knees, and works toward guard, reversal, or standing.'
  ),
  (
    'Back control and escape',
    'Pins',
    'Maintain chest-to-back connection while changing upper-body and leg controls. Defenders handle the neck threat first, clear controls, turn safely, and recover position.'
  ),
  (
    'Turtle and rear body lock',
    'Pins',
    'Top prevents the return to base while climbing toward back control or a pin. Bottom chooses guard recovery, reversal, stand-up, or safe disengagement.'
  ),
  (
    'Front headlock control and escape',
    'Pins',
    'Control posture and rotation without relying on an immediate strangle. The defender protects the neck, rebuilds posture, turns to face, or clears the connection.'
  ),
  (
    'Advancing pins and isolating limbs',
    'Pins',
    'Move among side control, north-south, mount, back, turtle, and front headlock while keeping pressure. Isolate a limb without giving back the position.'
  ),
  (
    'Submission safety and defensive order',
    'Submissions',
    'Recognize exposure early, protect the threatened neck or joint, clear secondary controls, and move toward escape. Tap before injury and release immediately on the tap.'
  ),
  (
    'Back strangles',
    'Submissions',
    'Control the upper body and defensive hands before closing the strangle. Defenders protect the neck, clear the choking arm, remove supporting controls, and turn safely.'
  ),
  (
    'Front-headlock and head-and-arm strangles',
    'Submissions',
    'Connect the head to an arm, control rotation, and close escape routes before applying pressure. Defenders rebuild alignment and remove the controlling connections in order.'
  ),
  (
    'Triangle control and finishing',
    'Submissions',
    'Build a stable head-and-arm configuration from guard or top, control posture and angle, then finish safely. Defenders protect alignment and recover space before the lock closes.'
  ),
  (
    'Upper-body joint locks',
    'Submissions',
    'Access and isolate the shoulder or elbow while keeping positional control. Include armbars, kimura-family controls, defensive grip separation, transitions, and safe escapes.'
  ),
  (
    'Leg entanglement position and safety',
    'Submissions',
    'Enter after off-balancing, control inside position and the knee line, and recognize safe directions of movement. Include stable exits before adding finishing pressure.'
  ),
  (
    'Leg attacks and defense',
    'Submissions',
    'Develop straight ankle locks first. Add kneebars, toe holds, and heel hooks only when room rules allow them, with matching defensive recognition and controlled releases.'
  ),
  (
    'Guard pull to connection',
    'Transitions',
    'Move from standing to guard with immediate grips, hooks, posture control, or off-balancing. The standing player keeps base and begins a safe passing engagement.'
  ),
  (
    'Sweep or wrestle-up to top control',
    'Transitions',
    'Continue after the reversal. The new top player settles a pass or pin while the other player rebuilds guard, base, or standing position.'
  ),
  (
    'Pass to pin',
    'Transitions',
    'Connect leg clearance to chest, hip, head, or limb control before recovery begins. The bottom player uses the same moving moment to retain or escape.'
  ),
  (
    'Pin to submission and recovery',
    'Transitions',
    'Open a submission while preserving the pin, then retain position or change attacks when the finish fails. The defender uses the opening to recover position.'
  ),
  (
    'Scrambles and continuous grappling',
    'Transitions',
    'Use head height, hip height, inside position, connection, and base to resolve unstable exchanges. Link standing, guard, pins, escapes, and submissions without a reset.'
  );

CREATE TEMP TABLE inserted_nogi_block ON COMMIT DROP AS
WITH inserted AS (
  INSERT INTO "curriculum_block_template" (
    academy_id,
    theme,
    notes,
    category
  )
  SELECT target.academy_id, source.theme, source.notes, source.category
    FROM target_academy target
    CROSS JOIN nogi_block_source source
   WHERE NOT EXISTS (
     SELECT 1
       FROM "curriculum_block_template" existing
      WHERE existing.academy_id = target.academy_id
        AND lower(trim(existing.theme)) = lower(trim(source.theme))
   )
  RETURNING id, category
)
SELECT id, category FROM inserted;

SELECT count(*) AS inserted_blocks FROM inserted_nogi_block;

SELECT category, count(*) AS library_blocks
  FROM "curriculum_block_template"
 WHERE academy_id IN (SELECT academy_id FROM target_academy)
 GROUP BY category
 ORDER BY category NULLS LAST;

COMMIT;
