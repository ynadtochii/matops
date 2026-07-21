# 30 — Template edit propagation (regenerate vs update-in-place)

Type: build-decision (Phase 2)
Status: resolved
Refines: [08](08-mvp-domain-model.md), [16](16-materialization-job-scaling.md), [19](19-class-completed-transition.md)

## Question

Spec §4 says editing a template "applies to **future, non-cancelled instances
only**; past and cancelled classes are untouched." The template stores a
recurring definition; concrete `class` rows are already materialized ahead
([16](16-materialization-job-scaling.md)). When an owner edits a template, how do
the already-generated future classes change — and what happens to a class whose
day/time no longer matches the new definition?

## Answer

**Split the edit by what it affects. Content-only edits update future instances
in place; timing edits regenerate them.**

The tRPC `template.update` resolver (slice 2.3), inside the RLS transaction:

1. Loads the template row **before** the update (to compare).
2. Applies the update.
3. Uses the pure `templateTimingChanged(before, after)` predicate
   (`@matops/domain`) — true iff `daysOfWeek`, `startsAtMinutes`, or `timeZone`
   changed (day order-independent). Then:
   - **Timing changed →** the set/instant of occurrences moved, so it **deletes**
     future scheduled instances of this template (`starts_at > now()`,
     `status = 'scheduled'`, not soft-deleted) and **re-materializes** from now
     with the new definition (cursor reset via `generated_until = null`).
   - **Content only** (title / discipline / instructor / capacity / duration) **→**
     it **updates those columns in place** on the same future scheduled
     instances, preserving the rows.

**Past and cancelled instances are never touched** (the `starts_at > now()` +
`status = 'scheduled'` filter), satisfying §4.

Deleting a template (`template.delete`) is the same shape: soft-delete the
template **and cancel** its future scheduled instances (status-only, so any
booking/attendance history is preserved — §4); past and already-cancelled
classes stay.

### Why this split

- **Preserve bookings where we can.** From Phase 3 a future class carries
  bookings/attendance (`class_participation`). A capacity/instructor/title change
  must **not** orphan them, so content edits keep the row. Only a timing change —
  which genuinely moves the class — regenerates, and there the booking rule
  (notify + rebook) is a Phase-3/4 concern layered on top.
- **Correctness over cleverness for timing.** Trying to *move* existing rows to
  the new weekdays/times is ambiguous (which old class maps to which new slot when
  the day count changes?). Delete + re-materialize reuses the one tested
  occurrence engine ([16](16-materialization-job-scaling.md)) and the idempotent
  `UNIQUE(template_id, starts_at)` guard, so the result is always exactly the new
  definition.
- **Immediate, like create.** Both branches run in-request on the RLS-scoped
  `ctx.db`, so the schedule reflects the edit at once (spec O2), not on the next
  cron tick.

### Consequences / carried forward

- **Phase 2 has no bookings**, so timing-edit regeneration is lossless today. When
  bookings ship (Phase 3), a timing edit on a class with bookings must **notify
  booked students** ([17](17-class-cancellation-notification.md)) and re-place or
  release their spot — a rule that composes on top of this one, it does not
  replace it. Flagged there.
- Resuming a paused template also re-materializes immediately (fills the horizon
  forward from `now`); pausing stops generation but leaves existing classes.
- No new schema. Pure decision logic is `templateTimingChanged` (unit-tested);
  the DB effects are covered by a live Neon verification (content edit keeps count
  + updates titles; timing edit regenerates to the new weekdays).

**Refines** [08](08-mvp-domain-model.md) / [16](16-materialization-job-scaling.md):
template edits propagate to future non-cancelled instances via a content-vs-timing
split (update-in-place vs delete-and-regenerate).
