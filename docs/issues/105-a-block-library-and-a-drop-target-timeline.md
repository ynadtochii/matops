# 105 — A block is a thing you own, not a thing you scheduled

**Status:** accepted · **Date:** 2026-08-28 · **Area:** `packages/domain`, `packages/db` (migrations `0029`, `0030`), `packages/validators`, `packages/api`, `apps/nextjs`. One new table, one changed table, one rewritten screen. **Supersedes:** [104](104-curriculum-blocks-as-a-timeline.md) §3 (buttons before drag) and its one-table model. **Relates to:** [16](16-materialization-job-scaling.md), [30](30-template-edit-propagation.md), [53](53-schedule-week-grid.md).

## Context

ADR 104 shipped a curriculum block as one row that was both the theme and its
place in the year. Writing "closed guard" twice, in September and again in
February, meant typing it twice, and the two had nothing to do with each other.

The owner asked for the shape the gym actually has: **a library of blocks you
own, and a plan you drop them onto.** A block is a theme the gym teaches. The
plan is where and for how long it runs this time. The same block goes on the
plan as often as the gym wants.

That is the `class_template` to `class` relationship this codebase already has,
applied to the curriculum.

## 1. Two tables, and the placement owns only the dates

- **`curriculum_block_template`** is the library: `theme`, `notes`,
  `default_weeks`. No dates. This is what the side panel lists, and what the UI
  calls a **block**.
- **`curriculum_block`** is a placement: `template_id`, `starts_on`, `ends_on`,
  `weeks`. It carries no text of its own.

The domain package follows: the type the sequence rules operate on is
`Placement`, and `rippleFrom` / `movePlacement` / `insertPlacement` /
`removePlacement` all work on the dated thing, never on the library.

`weeks` sits on both, and it is not a duplicate. `default_weeks` is how long the
gym usually runs that theme, which is what a drop starts from.
`curriculum_block.weeks` is how long it runs **this time**, so closed guard can
take two weeks now and three in February without editing the library.

## 2. Reference, not a copy

A placement reads its theme through `template_id`. There is no snapshot, so
renaming a block in the library renames it everywhere it sits on the plan,
including blocks that already ran.

That looks like it contradicts ADR 104 §2, which froze the past. It does not.
104 froze **dates**, because moving a date changes which classes fall inside a
block and would contradict the register. A **label** is not a record of what
happened; correcting "Passing" to "Passing, knee slice" makes every reference to
it more accurate, past ones included. The record of what was actually taught is
C.2's taught line, which is still unbuilt and is the thing that will hold that
truth.

The consequence: **a block that is on the plan cannot be deleted.** The server
refuses and says how many times it is used, because deleting it would leave
placements pointing at nothing.

## 3. Drag and drop, which 104 deferred

ADR 104 §3 argued buttons first and drag later, over the same mutations. The
owner asked for the drag, so this is that later pass. The mutations did not
change shape, exactly as 104 predicted; only `move` did, from a `delta` of plus
or minus one to an absolute `toIndex`, which is what a drop produces.

**No dependency was added.** The native HTML5 drag API does this: `draggable` on
a library card and on a draft placement, and one `dragover` handler on the
timeline. The alternative was a drag library at roughly 40kB for a screen one
person opens twice a month, which ADR 90's bundle argument rules out.

**One handler decides where the drop lands.** The timeline already knows every
card's top and height, because it positions them from their dates. So
`dragover` reads the pointer's Y against that layout, picks the first card whose
midpoint it is above, and clamps the result to `firstDraftIndex`. One violet
line marks the landing place. Dropping onto the settled or running part of the
plan is not possible, and the server refuses it too.

**The buttons stay, and they are not a fallback.** HTML5 drag events do not fire
on touch, so on a phone the drag does not exist at all. The steppers, the up and
down arrows, and **Add to plan** on every library card are the whole feature for
touch and for the keyboard. The drag is the fast path on a laptop, nothing more.

## 4. Everything on the plan is now undoable

104 made resize and reorder undoable and left delete behind a confirm dialog.
With a library, taking a block off the plan no longer destroys anything: the
block still exists, so the undo is putting it back at the index it came from.
The confirm dialog is gone from that action, replaced by a toast with **Undo**,
which is a lighter thing to press twenty times while planning a term.

The confirm dialog stays on **deleting a block from the library**, which is the
only destructive action left.

Every ripple still names what it moved and where the plan now ends, and the
browser still applies the same domain function to its cache before the request
leaves, so a drop, a move and a resize all animate at once rather than after a
round trip.

## 5. Two migrations, because the tooling has no terminal

`drizzle-kit generate` asks, interactively, whether a column that disappeared
and one that appeared are a rename. It refuses to run at all without a TTY,
which this environment does not have.

So the change is split into two prompt-free steps:

- **`0029`** creates `curriculum_block_template`, adds a **nullable**
  `template_id`, and **backfills**: one template per distinct `(academy_id,
  theme)`, then every existing block pointed at its own. Two placements of the
  same theme collapse into one shared library entry, which is the behaviour the
  library is for.
- **`0030`** drops `theme` and `notes` from `curriculum_block` and sets
  `template_id NOT NULL`.

No data was lost. The one real block in the live database, written by hand
through the v5.2 screen, is now a library block plus a placement pointing at it,
with its notes intact.

## Consequences

- `curriculum.list` is gone; **`curriculum.board`** returns the library, the
  plan and `today` in one round trip, with a use count per block. The screen
  needs both halves at once, and ADR 98 already made the case for one call.
- `curriculum.create` split into **`createBlock`** (library) and **`place`**
  (plan); `delete` split into **`deleteBlock`** and **`unplace`**.
- Migrations `0029` and `0030` are **applied to Neon** (2026-08-28, 31 rows in
  `drizzle.__drizzle_migrations`), both tables RLS-enabled with their isolation
  policies live.
- **Not verified in a browser**, the fifth session with no tab to attach to. The
  drag in particular has been reasoned about and typechecked, not watched. The
  pure rules were exercised directly with `node --experimental-strip-types`, and
  the backfill was proved on a throwaway PGlite with three rows across two
  academies before it was run for real.
