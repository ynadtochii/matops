# 109 — The running block is editable

**Status:** accepted · **Date:** 2026-08-29 · **Area:** `packages/domain`, `packages/api`, `apps/nextjs`. No migration. **Supersedes** the running-block half of [104](104-curriculum-blocks-as-a-timeline.md) §2 and of [`curriculum-timeline-ux.md`](../curriculum-timeline-ux.md) §2 and §8 Q3.

## Context

ADR 104 froze two things: a block that **ended**, and half of the block that
covers **today**. The running block could be extended and nothing else. No
shorten, no reorder, no remove. The reasoning was that part of it has already
happened, so shortening it would re-date the past.

The owner's report, on seeing it: *"make the same controls over current week as
for rest. i can edit it, delete and shrink."*

## 1. The rule was protecting the wrong thing

104 §2 is right about one thing and wrong about the other.

**Right:** a block that has **ended** is a record. Classes were taught under it,
the register says so, and C.6's coverage report will read it. It must not move.
That stays, and it is now the only frozen state.

**Wrong:** the running block is not a record. It is the thing the gym is
arguing about on a Sunday night. "We are not doing three weeks of this after
all, make it one and start the next thing" is the same correction as "we need
another week", and 104 shipped one of them and refused the other. The doc's own
§4 calls the extend button the point of the feature; the shorten is the same
button in the other direction.

The dates a shorten pushes into the past are the plan's dates, not the
register's. A class that was taught is still on the schedule with its own row.
Nothing the ripple writes can un-teach it.

## 2. One floor, not two

The domain already had both index rules. `firstEditableIndex` is the first block
that has not ended; `firstDraftIndex` is that, plus one when it is running. The
server was using the draft floor for every guard.

`editableFloor(placements, today)` is `firstEditableIndex` clamped to
`placements.length` when everything has run, which is the number the guard
actually wants. Every server guard now uses it, so **settled is the only
refusal**:

- `resize` refuses settled, and no longer refuses a shorten.
- `move` and `unplace` refuse settled, and no longer refuse running.
- `place` refuses a drop before the running block, not before the first draft,
  so a block can be dropped in ahead of what is running now.

`firstDraftIndex` stays, unused by the router, because it is the honest name for
a different question and its tests document the difference.

## 3. The screen loses its special case

`board` returns `firstEditableIndex` in place of `firstDraftIndex`, and the
placed card branches on `settled` alone. The running block gets the grip, the
`− n +` stepper, both arrows, edit and remove: the same row as a draft, in the
same order, which is what was asked for. The resize handle's floor is 1 for
everything, and its cursor is `ns-resize` again.

**The dedicated "Still on this, 1 more week" button is gone.** It was added a
day earlier because the running block's only control was a bare `+` beside a
dead `−`, and a labelled button was the honest way to draw one operation. With
the full row back, the label would be a second control doing what `+` does, on
the one card that already has the most in it. The block still reads as the
running one: the brand border, the shadow and the dot are all unchanged.

## Consequences

- No migration. No schema change. `MAX_BLOCK_WEEKS` and the 1-week floor are
  unchanged.
- **Undo carries the risk.** Shortening a long running block re-dates its tail
  backwards, and can settle a block that was a draft a moment ago. Every one of
  these mutations already raises a toast naming what moved with an **Undo** that
  restores the previous dates in one write, which is what makes loosening the
  rule safe rather than reckless (104 §"the two rules that make a ripple safe").
- Removing the running block hands its start date to its successor, which
  becomes the running one. Contiguity and the Monday alignment of ADR
  [108](108-the-week-starts-on-monday.md) both survive every operation.
- **Not verified in a browser.** Typecheck and lint green on `domain`, `api` and
  `nextjs`; the loosened rules exercised with `node --experimental-strip-types`
  (shrink, remove and reorder over a running block, each checked for state,
  contiguity and Monday alignment, plus a settled block still under the floor).
