# 111 — Many curriculums, one library

**Status:** accepted · **Date:** 2026-08-29 · **Area:** `packages/db` (migration `0034`), `packages/auth`, `packages/validators`, `packages/api`, `apps/nextjs`. One new table, two new columns, three new procedures, a chip row. **Amends:** [104](104-curriculum-blocks-as-a-timeline.md) §1 (one sequence per academy) and [110](110-the-theme-on-the-class.md) (how a class finds its block). **Relates to:** [105](105-a-block-library-and-a-drop-target-timeline.md), [107](107-block-categories.md).

## Context

ADR 104 made the plan one sequence per academy, and 105 split the block into a
shared library plus a placement. Both were right for a gym that teaches one
thing. A gym that runs Fundamentals on Monday and No-gi on Tuesday has two plans
and no way to say so: `forClass` resolves a theme from the class **date** alone,
so both classes read the same line.

The owner named the fix: the blocks are the building material and stay shared,
but a gym should be able to build several curriculums out of them.

## 1. A track is a table, not a column

ADR 107 put block categories in a `text` column and rejected a table, because
nothing pointed at a category but the block. It also named the upgrade path: a
foreign key once something references it, or once it needs an order.

A track is that case. `class_template` points at it, so a `text` track would mean
the same string stored in two tables and a rename that has to match on it. So
`curriculum_track(id, academy_id, name, is_default)`, with the standard grant,
RLS flag and isolation policy, and a partial unique index keeping one default per
academy.

`curriculum_block` gains `track_id NOT NULL`. The library,
`curriculum_block_template`, is untouched: one theme can run in Fundamentals in
March and in Advanced in June, from the same card.

## 2. The ripple is per track, so `packages/domain` gains nothing

Every sequence rule in `curriculum.ts` already works over a plain sorted list.
Filtering that list by track is the whole feature: `rippleFrom`, `movePlacement`,
`editableFloor` and `placementForDate` are unchanged, and settled / running /
draft is now decided within a track. Extending a block in Fundamentals cannot
move a block in No-gi.

The one domain edit is a constant for the name length. No new rule was written,
because there is no new rule.

## 3. A class picks its track through its template

`class_template.curriculum_track_id`, nullable, set once in the template form.
Every class the template generates inherits it, and a one-off class or a template
nobody assigned falls back to the academy's default track.

Three options were weighed.

- **(A) On the template.** One select per weekly slot, set once.
- **(B) Reuse the `discipline` tag.** No new column, but `bjj` cannot be both
  Fundamentals and Advanced, which is half the ask.
- **(C) The template plus a per-class override.** A second column, a second write
  path and an edit control, for a case nobody has asked for.

**(A).** The track is read through the template on every request and is never
copied onto a class row, so re-pointing a template needs no backfill and must not
touch a single class. `templateContentChanged` in `packages/domain` deliberately
leaves the field out, and says why: adding it there would cancel and re-generate
classes for a change that alters no class.

This also carries ADR 110's own reasoning forward. J.2 in the roadmap ruled out a
`class.curriculum_block_id` because a block spans weeks and is a lookup, not a
column. The track is the opposite shape: it is a stable property of the slot, not
of the date, so it belongs on the template and nowhere else.

## 4. A default track, seeded at academy creation

Migration `0034` gives every existing **organization** a track named "All
classes", marked default, and points every existing placement at its academy's
one. A gym with a library and an empty timeline still needs somewhere to drop the
first block, so the backfill runs off `organization`, not off the placements.

New academies get theirs in Better Auth's `afterCreateOrganization` hook, beside
the member-activation write that is already there. That keeps every read a read:
no procedure lazily creates the row, which matters because the board is
server-prefetched.

An existing gym opens the tab and sees exactly what it saw before, under one
chip. Nothing changes until it adds a second track.

## 5. One track at a time, on chips

The screen keeps the single full-width timeline and gains a chip row above it.
Side-by-side columns against one shared week rail were weighed and dropped: they
would mean rebuilding the grid for N columns, cross-column drag, and a horizontal
scroll on a phone, roughly doubling the UI work of the wave to show something an
owner reads one track at a time anyway.

The library is shared, so a card that is placed in a track you are not looking at
says which: `used` and `lastEndsOn` are counted across **every** track. Without
that, a block placed only in No-gi reads as unused while the owner stands in
Fundamentals, and the delete guard lets it go.

## 6. What a track refuses

The default track cannot be deleted, because every unassigned class reads it; it
can be renamed. A track no longer wanted is deleted with its placements, and the
message says the blocks stay in the library. A track that class templates still
point at refuses, naming how many.

## Consequences

- One new table, two new columns, migration `0034`, no data loss and no visible
  change for a one-track gym.
- `curriculum.board` takes an optional `trackId` and returns the track list;
  `place` takes a `trackId`; `resize`, `move` and `unplace` read it off the
  placement they already load, so their inputs are unchanged.
- `forClass` keeps its exact client contract, so `class-theme.tsx` and the Expo
  class screen needed no edit.
- The board also stopped running `Promise.all` on `ctx.db`, which is a single pg
  client inside a tenant transaction (the fix ADR-free commit `f76e2c3` made in
  the referral router).
- Still out: copying a track, reordering the chips, a track that repeats on a
  cycle, a colour per track, and per-track student visibility — ADR 110's
  checkbox stays academy-wide.
