# 112 — Several blocks on one stretch of weeks

**Status:** accepted · **Date:** 2026-08-29 · **Area:** `packages/db` (migration `0035`), `packages/domain`, `packages/validators`, `packages/api`, `apps/nextjs`, `apps/expo`. One new column, one new procedure, a card that draws columns. **Amends:** [104](104-curriculum-blocks-as-a-timeline.md) §1 (one placement is one theme) and [110](110-the-theme-on-the-class.md) (a class reads one theme). **Relates to:** [105](105-a-block-library-and-a-drop-target-timeline.md), [111](111-many-curriculums-one-library.md).

## Context

A week of training is not one theme. A gym teaches Standing and Pinning over the
same fortnight and works both in every class. Since ADR 104 one row of
`curriculum_block` has been both "this stretch of weeks" and "this theme", so
saying that meant two blocks one after the other, which is not what happens on
the mat.

The owner also asked to be able to delete a track from the chip row. That part
already existed as a procedure, but it refused whenever a class pointed at the
track, which is the state a gym is actually in when it wants the track gone.

## 1. The sequence unit is the slot, not the row

`curriculum_block` gains `slot_id NOT NULL`, backfilled to each row's own id.
Rows sharing a `slot_id` are one stretch and carry identical dates. That is the
whole data change: no new table, so the `curriculum_block_isolation` policy and
the four `matops_app` grants cover it unchanged. A unique index on
`(slot_id, template_id)` stops the same block landing twice on one stretch.

A child table (`curriculum_slot` plus a join row) was the tidier drawing and was
rejected: it is a second table, a second policy, a second set of grants and a
backfill that has to invent ids, to hold what one column holds.

Grouping by `starts_on` instead of a column was also rejected. It needs no
migration at all, but a slot's key would then change on every ripple, and the
screen animates placements by id: the cards would remount mid-move.

## 2. `packages/domain` gains a constant and no rule

The same result as ADR 111, for the same reason. Every sequence function works
over `Placement = {id, startsOn, endsOn, weeks}`, and a slot **is** that shape.
The router groups rows into slots before the rules see them, so `rippleFrom`,
`insertPlacement`, `removePlacement`, `movePlacement`, `placementForDate` and
`editableFloor` are byte-identical. The one edit is `MAX_SLOT_BLOCKS = 10`.

`Placement.id` is now a slot id rather than a row id. Because `slot_id` is
backfilled to the row's own id, every id that already existed keeps working.

## 3. The blocks on a stretch share its length

One stretch, one run of weeks. Standing and Pinning start and end together, and
the length control, the arrows and the remove button belong to the stretch.

Per-block lengths inside a stretch were rejected: the moment two blocks in one
slot can end on different days, the slot is no longer a point in a sequence, and
the ripple, the settled line and the drop index all lose their meaning. A gym
that wants Pinning for one week of a two-week Standing puts Pinning on its own
stretch. The cost is real and is the price of keeping ADR 104's model.

## 4. Columns, not stacked rows

The rail is wide and a stretch is short, so the blocks on it are drawn side by
side: a CSS grid of `repeat(auto-fit, minmax(9rem, 1fr))`. It reads as "these run
at the same time", it wraps by itself when ten blocks will not fit across, and it
needs no separate layout for a phone. Stacked rows were the first draft and were
rejected by the owner for wasting the width.

## 5. Two drop targets on one rail

Dropping on the line between two stretches inserts a new one, as before.
Dropping on the body of a stretch adds a block to it. The two are separated by
geometry: a 12px band at each edge of a card stays "between", so the insert line
is always reachable. A stretch that is full, or that already teaches the block
being dragged, refuses to be a target and the drop falls back to an insert.

Adding to a stretch ripples nothing, so it previews as a ghost column in the
target card rather than as the timeline opening up.

## 6. Removing one block is not removing the stretch

`unplace` keeps its name and its meaning, "take this off the plan", and now takes
a slot id: it removes every block on the stretch and ripples. A new
`removeTheme` takes one placement row and drops just that block, changing no
dates, and refuses the last one on a stretch. Making `unplace` guess from the
count was rejected: two different user actions reading the same id is how a
mis-click deletes a fortnight.

The per-block remove button only appears when a stretch teaches more than one, so
a one-block stretch has exactly one obvious control.

## 7. Deleting a track detaches its classes

The refusal in ADR 111 §6 is replaced. Deleting a track now nulls
`class_template.curriculum_track_id` for every class that followed it and reports
the count. Nothing is orphaned, because an unassigned class already reads the
default track. The default track still refuses to be deleted, because it is what
those classes fall back to.

The control moves out of the rename dialog onto the chip row, beside the pencil.

## Consequences

- `curriculum.board` returns `plan[].themes[]` instead of `plan[].theme`, and
  `forClass` / `forDate` return `themes[]`. The web class card and the Expo class
  screen list them.
- An academy that never adds a second block to a stretch sees no change: every
  slot holds one row, exactly as before.
- Ordering the blocks inside a stretch is not built. They read in the order they
  were added. Dragging a block from one stretch to another is not built either:
  take it off and drop it again.
- The `weeks`, `starts_on` and `ends_on` columns are now duplicated across the
  rows of one slot. Writes fan out by `slot_id`, so they cannot drift, and the
  duplication is what keeps `placementForDate` a single indexed read.
