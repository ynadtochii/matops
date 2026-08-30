# 104 — Curriculum blocks are a sequence, and the ripple is an operation

**Status:** accepted · **Date:** 2026-08-28 · **Area:** `packages/domain`, `packages/db` (migration `0028`), `packages/validators`, `packages/api`, `apps/nextjs`. One new table, one new sub-tab, one new router. **Supersedes:** [`curriculum-plan.md`](../curriculum-plan.md) §4 (the model) and §10 C.1 (the slice), and turns [`curriculum-timeline-ux.md`](../curriculum-timeline-ux.md) from a draft into the built thing. **Relates to:** [53](53-schedule-week-grid.md), [79](79-manual-schedule-rebuild.md).

## Context

`curriculum-plan.md` §4 modelled a block as an independent date range. Eight
blocks are eight rows that know nothing about each other. That is fine to store
and painful to live with: a gym that spends three weeks on closed guard instead
of two has to re-date every block after it by hand. Nobody does that, so the
dates rot and the screen starts lying about what the gym teaches.

The owner's vision named the fix: blocks are a **sequence**. Change one, the
rest follow, like a timeline in a video editor. That turns "we ran long" from
eleven edits into one, which is the difference between a plan corrected every
Sunday and a plan abandoned by week six.

## 1. The model stays flat; the sequence is an operation

Two options were weighed in `curriculum-timeline-ux.md` §6.

- **(A) Store `position` + `weeks`, derive every date from one anchor.** Purest.
  Gaps and overlaps become impossible. But every read does arithmetic, and
  freezing the past needs a second concept.
- **(B) Keep `starts_on` / `ends_on` and make the ripple a pure function over a
  sorted list.**

**(B).** Reads stay trivial, `blockForDate` is unchanged from the plan doc, and
the whole idea is one function. The table adds `weeks int` so a resize does not
have to infer a human's intent from two dates.

`packages/domain/src/curriculum.ts`, beside `grid.ts`, holds the whole rule:
`rippleFrom(blocks, index, weeks)` re-dates the tail end to end from that
block's own start and returns everything before `index` untouched, by
reference. `moveBlock` is a reorder plus a ripple anchored on the **position's**
start, not the moved block's, so a reorder never changes when the plan begins.
Delete pins the same anchor before rippling, so removing a block closes the gap
instead of leaving one.

## 2. The ripple runs forward only

A video timeline ripples both ways because nothing in it has happened. A
curriculum has already run. If extending an October block re-dated September,
the screen would contradict the register and the C.6 coverage report would lose
its ground truth.

So a block is **settled** (ended before today), **running** (covers today) or a
**draft** (starts after today), and the three look different on screen. Settled
blocks are a record: no resize, no reorder, no delete. The running block can be
**extended only**, because part of it has already happened; a gym that wants to
move on early gets a different, clearer button later, not a shortening.

The server decides which is which, not the browser: `curriculum.list` returns
`today` measured in the **academy** zone (spec §4) alongside every block's
state, and every mutation re-derives it before writing.

## 3. Buttons before drag

Drag and drop is the expensive half and the least of the value: pointer
capture, touch, autoscroll, drop targets, and a keyboard path that has to exist
anyway. It is used twice a month, by one person, on a laptop.

The operations ship as buttons first (`− 2 weeks +`, move up, move down), which
are pure array arithmetic and also the accessible path. The drag is a later pass
over the same mutations and changes nothing about the model.

The one control that matters is on the running block: **"Still on this,
+1 week"**. That is the Sunday-night action, and it is the largest thing on that
card. Everything else on the screen exists so that button is honest.

## 4. The week is the unit

A month is four weeks or five, and the ambiguity would infect every date the
screen prints. The stored value is a whole number of weeks; the create form
offers 1, 2, 3, 4, 6 and 8, with 4 labelled "a month". Nothing stores "a month".

## 5. Height is duration, and the rail is the calendar

The timeline runs down and a block's height is its length: 14px a day, so a
two-week block is exactly twice a one-week block. Blocks are positioned from
their real dates rather than stacked, so a gap in the data draws as a gap.

Vertical, for three reasons. A theme is a phrase and phrases want horizontal
room. A year is 26 blocks, and horizontal means sideways scrolling, which the
layout rules forbid for the page body. And **the O2 week grid already draws
time as height with a now-line across it** (`week-grid.tsx`, `grid.ts`), so a
coach who reads the schedule can read this without being taught. The same brand
now-line is drawn here, and the left rail carries ISO week numbers and month
labels, so a block's place in the year is read off the rail rather than off a
date string on every card.

`isoWeek` is in the domain package with its own tests, because the year-end rule
(a week belongs to the year that owns its Thursday) is the kind of thing that
looks right and is wrong for one week a year.

## 6. Every ripple is undoable, and says what it moved

One press moves twenty rows, and the consequence is mostly off screen: you
extend in September and the thing that changed is in December. A ripple that
cannot be taken back in one press is frightening, and a frightening editing
surface goes unused.

So every resize and every reorder raises a toast naming the block, how many
blocks after it moved, and the plan's new end date, with **Undo**. Undo needed
no new mutation: the ripple is deterministic from an unchanged anchor, so
undoing a resize is a resize back to the previous length, and undoing a move is
the same move with the sign flipped. The mutation returns `previousWeeks` for
exactly this.

The browser applies the same `rippleFrom` to its cache before the request goes
out, so the blocks slide the moment the button is pressed rather than after a
round trip, and roll back on an error. The cards animate on `top` and `height`
at 300ms on `cubic-bezier(0.2, 0, 0, 1)`, off under `prefers-reduced-motion`.

Delete is the exception: it has no undo, so it goes behind a `ConfirmDialog`
that says the blocks after it will move up.

## 7. Where it lives, and who may write

**Schedule → Curriculum**, a third tab beside This week and Templates. No new
nav item, no new route, no new row in the route access table (`/schedule` is
already staff-only).

**Any staff writes**, per `curriculum-plan.md` §5. The owner-authors split and
the comment thread are C.7 and are gated on a gym with three or more coaches.
Every procedure is a `staffProcedure`, so a student is `FORBIDDEN` on all of
them, and the table carries the standard `academy_id` policy, so the tenant seam
is unchanged.

`curriculum.forDate` exists so the class detail modal can name the block
covering that class. **The line on the modal is not wired up yet.** That is the
rest of C.1, and without it the distribution argument in `curriculum-plan.md` §7
is unmet: a curriculum page in a nav menu is a dead curriculum.

## 8. What this leaves for later

- **The theme on the class detail modal**, and **C.2's taught line**. The plan
  doc puts both in wave 1. Neither is here.
- **Drag to resize and reorder**, over these same mutations.
- **Soft dates past the horizon** ("early October" instead of a date the gym has
  not promised). It is one formatting branch and was left out until a real gym
  says how far ahead it plans, which is `curriculum-timeline-ux.md` §8's open
  question and is still unanswered: the only academy in the live database is the
  seeded demo.
- **Two coaches editing at once.** The second writer currently wins silently.
  The plan doc's §8.2 answer (carry the sequence's `updated_at`) is unbuilt.
- **C.3, repeat blocks forward**, which on a sequence is "duplicate these six
  and append them", one button over the same function.

## Consequences

- `curriculum-plan.md` §11 item 6 reserved ADR **103** for this. 103 was taken
  the same day by the referrals polish note, so this is **104**.
- `curriculum-plan.md` §12 gains a failure mode: "the plan cannot keep up with
  the gym, so it is abandoned as furniture." The ripple is the mitigation, and
  the counter-metric is **edits to future blocks per gym per month**. A plan
  nobody has corrected in six weeks is a dead plan, whatever the taught-line
  rate says.
- Migration `0028` is **applied to Neon** (2026-08-28, 29 rows in `drizzle.__drizzle_migrations`); the RLS flag, the isolation policy, the `(academy_id, starts_on)` index and the four `matops_app` grants were each read back from `pg_class` / `pg_policies` / `pg_indexes` / `information_schema`.
- **Not verified in a browser.** The tooling has had no tab to attach to for
  four sessions. Typecheck (17/17), lint and `next build` are green, and the
  pure rules were exercised directly with `node --experimental-strip-types`.
  The vitest suites were not run, per the session rule.
