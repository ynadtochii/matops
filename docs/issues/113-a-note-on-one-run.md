# 113 — A note on one run of a block

**Status:** accepted · **Date:** 2026-08-30 · **Area:** `packages/db` (migration `0036`), `packages/validators`, `packages/api`, `apps/nextjs`, `apps/expo`. One nullable column, one new procedure, one dialog. **Amends:** [105](105-a-block-library-and-a-drop-target-timeline.md) §D.2 (a placement holds no writing of its own). **Relates to:** [110](110-the-theme-on-the-class.md), [112](112-several-blocks-on-one-stretch.md).

## Context

The library block is the problem to solve: "Closed guard: attacks and retention",
with notes saying what it covers. It is evergreen and reused, which ADR 105 made
explicit by having a placement reference it rather than copy it.

That left nothing that can be said about **one run** of it. September's two weeks
with a beginner group and February's two weeks with the comp team read the same
line, and editing the block's notes to say otherwise rewrites the note on every
placement, past ones included. `curriculum-plan.md:118` asked to watch what
coaches type into block notes before giving it structure. What was wanted was not
more structure in that field. It was a second, smaller field about the weeks.

## 1. A column on the placement, not a table

`curriculum_block.notes text` nullable. Since ADR 112 a placement row is one
theme on one stretch of weeks, which is exactly the thing the note is about, so
the column lands on the right row with no join. No new table, no policy, no
grants: `curriculum_block_isolation` already covers it.

## 2. Two fields, two names, because they are two objects

The failure mode of this feature is two boxes both called Notes, and nobody
knowing which one to write in. They are not the same object, so they do not get
the same name:

- **Block notes**, in the library, say what the block covers. Editing them
  changes every run, which is the point.
- **This run**, on the placement, says what these weeks are doing about it.
  Editing it changes nothing else.

The plan screen shows the run note under the block's, marked with a brand rule
down its left edge. The class screen labels it "This run", because a coach reads
it there without the context of the timeline around it.

## 3. It stays writable after the stretch has ended

ADR 109 made settled the only frozen state, and froze it because dates decide
which classes fall inside a block. A note decides nothing. `setRunNote` therefore
carries no `requireEditable` guard, and it is the only write a settled stretch
accepts besides renaming the block.

That is deliberate rather than lenient. A note a coach writes on a stretch that
has finished is a record of what those weeks actually covered, which makes this
the cheapest form of the taught line (**C.2**, still todo) and the first raw
material the coverage report (**C.6**) can read. C.2 stays the better answer,
because it is per class rather than per stretch; this does not block it and does
not pretend to be it.

## 4. Staff only, like the block's notes

`forClass` returns `run` under the same gate as `notes`: staff see it, a student
never does, whatever the academy's student-visibility switch says (ADR 110). A
student sees the theme and nothing else. The run note is more explicitly the
coach's than the block's notes are, since it can name a group or an individual
week's plan.

## 5. Undo carries the note

`place` takes an optional `note` so the Undo on a removed stretch puts back what
was written on it. Without that, one mis-click plus Undo silently loses the note
while appearing to restore the block.

## Consequences

- `board` returns `plan[].themes[].note`; `forClass` and `forDate` return `run`
  beside `theme` and `notes`.
- A one-week stretch has no room to draw the note, the same limit that already
  hides block notes there. The note button turns brand-coloured and stays visible
  when a note exists, so a short stretch still says it has one.
- Taking a block off the plan takes its run note with it. That is correct: the
  note is about weeks that no longer exist.
- Nothing structures the note. If coaches turn out to write the same three shapes
  into it, that is the observation `curriculum-plan.md` C.4 asked for, and it can
  be structured then rather than guessed now.
