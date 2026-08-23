# 79 — The owner rebuilds the schedule, six months at a time

**Status:** accepted · **Date:** 2026-08-23 · **Area:** `packages/domain`, `packages/db`, `packages/api`, `apps/nextjs`, `.github/workflows` · **Supersedes:** the horizon half of [78](78-notification-and-horizon-seams.md), and closes out ADR [46](46-no-scheduler-v1.md)'s Option B lineage (`healHorizon`, ADR [76](76-pilot-blockers.md)). No migration.

## Context

Concrete `class` rows are generated from `class_template` out to a rolling
horizon. Who pushes that horizon forward has now been answered three different
ways in three waves: lazy-on-save only (ADR 46), plus healing on every schedule
read (ADR 76), plus a daily GitHub Actions sweep (ADR 78). All three are the same
instinct, that the horizon should fill itself without anybody asking.

Three problems with that, from reading it against how a pilot gym actually works.

- **The owner has no control over their own calendar.** There is no button. When
  the schedule looks wrong there is nothing to press, and the thing that fills it
  is invisible. For an unpriced pilot where nobody from matops is in the room,
  that is the wrong shape: the person standing in the gym should be able to fix
  the gym.
- **Stale classes never leave.** Pausing a template stops new rows and leaves
  every row it already made. Deleting one soft-deletes the template and cancels
  its future classes, but a template whose **days or time changed** leaves its old
  instants behind as real, bookable classes. Nothing in the product removes a
  generated class, so a gym that reorganises its week ends up with two schedules
  on the calendar at once.
- **Students could book six weeks out.** Both clients only ever render a rolling
  seven-day week, so this was reachable only by a direct link to `/class/<id>` —
  a hole, not a feature. A booking that far ahead is worthless anyway, because the
  gym's plans change first.

## Decision

**Nothing schedules the horizon. The owner does, by hand, and it is a rebuild
rather than a top-up.**

### Six months, filled on save

`MATERIALIZATION_HORIZON_DAYS` goes 42 → **180**. Every caller already threads it
as a default, so lazy-on-save and the button share one number. Saving a template
fills six months at once, which is why the button is not needed for normal use: a
gym that edits its templates never runs dry, and one that does not still has
half a year of calendar.

### One button: Rebuild schedule

Owner-only, at the foot of Schedule → Templates. It throws the **forward**
schedule away and regenerates it from the active templates alone.

The rule is a set difference and it is pure, so it is the part with tests:

```ts
staleClassIds(existing, wanted): string[]   // packages/domain/src/materialize.ts
```

Every existing row whose `(templateId, startsAt)` pair no active template still
produces. `rebuildSchedule` in `packages/db/src/materialize.ts` does the IO on the
caller's tenant transaction, so RLS scopes every statement to the active academy
and a failure part-way rolls the deletes back with it.

**What it must not touch, and why:**

- **Past classes and all attendance.** `class_participation` carries booking and
  attendance on the same row, so deleting a past class erases the history behind
  training stats, visit counts, drift and rank. The plan query filters to
  `starts_at > now`.
- **One-off classes** (`template_id IS NULL`). Hand-entered work for a seminar.
  Nothing would recreate it, so nothing removes it.
- **A class the owner cancelled** at a still-wanted instant. Regeneration uses
  `onConflictDoNothing`, not `reviveCancelled`, so a deliberate cancellation
  survives its own schedule being rebuilt.

**What it does take:** bookings on the removed classes, and per-instance edits.
An owner who retimed one Tuesday gets the template's time back. That is what
"rebuild" means, and the confirm dialog says so from a live count
(`template.rebuildPreview`), the same way the announce button names its reach.

Students are **not** told their booking went. That was a deliberate call and it is
the weakest part of this note: the machinery is one call away
(`deliver()` in `packages/api/src/notify.ts` takes a list of user ids), so revisit
it the first time a pilot owner rebuilds a live week.

Three FKs have no `ON DELETE`, so the delete is explicit: participations, then
`drop_in.class_id → NULL` (keep the lead, drop the link), then the class. A
migration adding `CASCADE` was the alternative and is worse: it would let any
future class delete silently take bookings, and this is the only hard delete of a
class in the product.

The cursor reset before regeneration is load-bearing. `materializeTemplate` starts
at `max(now, generated_until)`, so a template already generated to the horizon
would create nothing and the hole the delete just made would stay open.

### Booking stops at seven days

`BOOKING_WINDOW_DAYS = 7` and a fourth `NotBookableReason`, `"too-far-ahead"`, in
`packages/domain/src/booking.ts`. Measured from `now` rather than from midnight,
which makes the guard strictly more permissive than the seven-day list both
clients render, so nothing visible ever becomes un-bookable. No client change:
this closes the deep link, which is where the gap was.

### The sweep stays, unscheduled

`.github/workflows/cron.yml` drops the materialize call ADR 78 added; the dues
step is untouched. `/api/cron/materialize`, `runMaterializationSweep` and
`packages/db/test/materialize-sweep.test.ts` all stay. The route is a live,
authenticated, cross-academy seam that now has the tests it never had, and
deleting working tested code because nothing calls it this month is how the next
scheduler gets written from scratch.

## Consequences

- The horizon can now be wrong, and the owner is the one who fixes it. That is
  the trade: a button someone has to know about, in exchange for a calendar
  nobody can silently corrupt and a stale class that can actually be removed.
- A rebuild is destructive and irreversible for future bookings. It is owner-only
  and behind a confirm dialog that names the count, one step below the typed-phrase
  gate on deleting the academy.
- ADR 78's horizon section and ADR 76's `healHorizon` section describe code that
  no longer exists. Both stand as written; this note is the supersede.
