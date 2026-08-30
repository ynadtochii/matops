# 110 — The theme on the class, and the switch that shows it to students

**Status:** accepted · **Date:** 2026-08-29 · **Area:** `packages/db` (migration `0033`), `packages/validators`, `packages/api`, `apps/nextjs`, `apps/expo`. One column, one procedure, three render sites. **Implements** [`curriculum-plan.md`](../curriculum-plan.md) §7.1 (C.1b) and C.9. **Follows** [104](104-curriculum-blocks-as-a-timeline.md), [108](108-the-week-starts-on-monday.md), [109](109-the-running-block-is-editable.md).

## Context

Five slices built a curriculum planner and **nothing read it back**.
`curriculum.forDate` shipped tested in v5.2 with zero callers. That is the exact
failure the plan doc opens §7 with: *"A curriculum page in a nav menu is a dead
curriculum."* An owner filled a screen in and never saw it again.

The owner then asked for the student half too, with a switch: *"make options for
students to see as toggle, so owner can set it off and students will not see, but
instructors will."*

## 1. A block spans weeks, so this is a lookup, not a column

Every class in a week falls under the same block. Two things follow, and they
are what keep this slice small.

**No schema change on a class.** No `class.curriculum_block_id`, no backfill, no
write path to keep in step when a block is resized or reordered. The theme is
derived from the class's date every time it is read, which is also the only way
it can stay correct after ADR 109 let a running block move.

**It goes on the class detail, not the week list.** A week list would print the
same theme down fifteen rows. The class detail is where a coach already stands
to take the register, so the plan costs zero navigation.

## 2. One procedure, and null is the only refusal

`curriculum.forClass` takes a **class id, not a date**. The server owns both the
class's instant and the academy's zone; `dayKey()` in `packages/domain` takes no
zone, so a client cannot work out which day a 22:00 class falls on in the gym's
zone, and being one day out at a block boundary names the wrong week.

It is `enrolledProcedure` with the gate inside, not three tiers with three
messages:

- staff: theme **and** notes;
- an active member of an academy with the switch on: theme, `notes: null`;
- everyone else, and any class no block covers: `null`.

**Null, never a throw.** A pending member opening a class should get a screen
without a theme on it, not a `FORBIDDEN` that renders as a broken panel. So
every one of the three call sites is `if (data) render the line`, and the
visibility rule exists in exactly one place.

Reuses `loadPlan`, `dayIn`, `academyTimeZone`, `placementForDate` and `isStaff`,
all already built. `forDate` is left alone.

## 3. The flag rides a seam that already exists

`organization` already carries per-academy settings every role reads
(`time_zone`, `address`, `map_url`), handed to both clients by `academy.current`
as the `useAcademy()` context (ADR [74](74-web-shell-seams.md)). One boolean joins
them, so **no screen makes an extra request** to know whether to offer the
switch, and `academy.updateSettings` already has the right tier
(`ownerIdentityProcedure`, the tier for writes touching `organization`).

**Default off**, per the plan doc's C.9. Nothing a coach wrote while only staff
could read it becomes student-visible on deploy day. The owner opts in, which
also makes turning it on the moment they read their own plan as a student would.

**Students get the theme, never the notes.** Block notes are the lesson plan
(plan doc §8) and this is the same call §8 already made about the coach's field:
a student reading next week's technique list changes how coaches write it, and
the notes are the raw material C.6's coverage report needs. The theme alone is
the retention hook. One boolean, not two, because "show the theme but not the
notes" is the only split anyone has asked for.

## 4. The switch lives with the job, not in Settings

ADR [63](63-settings-split-by-job.md)'s rule: *"Everything that belongs to a job
lives with that job."* Staff on Coaches, bank details on Payments. So the switch
is on **Schedule → Curriculum**, under the intro line, owner-only
(`useAcademy().role`), on the screen where the thing it governs is written. It is
the app's checkbox, as `booking-gate.tsx` uses; `packages/ui` has no `Switch` and
this did not justify one.

## 5. What is not here

**C.2's taught line.** Nothing records what was actually taught, so the class
shows what is **planned**, never "what we covered". The plan doc's C.9 is titled
for the taught line; this ships its gate against the theme instead, and the gate
is the part that has to exist first either way.

## Consequences

- Migration `0033`: `organization.curriculum_for_students boolean not null
  default false`. No RLS: `organization` is read by academy id through the tenant
  tx, as `academyTimeZone` already does. Replayed on a throwaway PGlite, then
  **applied to Neon** (2026-08-29, 34 rows in `drizzle.__drizzle_migrations`;
  the one live academy defaults to off).
- Three render sites, one of them covering three screens: `ClassTheme` in
  `class-roster.tsx` reaches the Schedule modal, the Dashboard modal and
  Attendance at once, exactly as plan doc §7.1 predicted; plus the web
  `/class/[id]` route and the Expo class screen.
- No coach mode on the Expo app, per plan doc §7.3. The mobile change is one
  `Field` on the student class screen.
- **Not verified in a browser.** Typecheck and lint green across `db`,
  `validators`, `domain`, `api`, `nextjs` and `expo`; four router cases added
  over PGlite (instructor sees notes, student sees nothing while off, student
  sees theme-not-notes while on, uncovered class is null). The vitest suites were
  not run, per the session rule.
