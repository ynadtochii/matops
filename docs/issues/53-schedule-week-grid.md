# 53 — The staff week reads as a timetable, not a list

**Status:** accepted · **Date:** 2026-08-19 · **Area:** staff web / O2 schedule

## Context

O2 rendered the week as a vertical list grouped by day. A gym runs the same
class at the same hour on several days, and the owner's real question is
"what is on, and where are the holes". A list answers that only by reading
every row. Gyms already solve this on the wall: a grid, days across, hours
down, one glance.

The gym timetable poster the client showed splits gi from no-gi visually, so
the reader sorts the whole board before reading a single word.

## Decision

- The **week is a time grid** on `md` and wider: Monday to Saturday columns, hour rows,
  each class positioned by its real start and duration. The same class at the
  same hour lines up across the week. Sunday is dropped, since gyms rarely run
  it, and appears only in a week that actually has a Sunday class.
- **A colored left rail encodes the coarse split** the reader wants first: gi
  and judo carry a teal rail over an 8% teal tint, no-gi and MMA an amber rail
  over an 8% amber tint, open mat a dashed neutral border and no rail because
  it is both. The title carries the exact discipline. Two passes got here: a
  solid ink fill for no-gi made a board of alternating black and white blocks,
  too loud to read; neutral grey rails then separated nothing on the dark
  theme, where every grey rail is a light grey. Hue does the work value could
  not. The two hues are new tokens, `--gi` and `--nogi` (design.md §1.1) — a
  **category**, not a status, kept clear of the brand violet and the four
  callouts, and separated on the blue-yellow axis so red-green color blindness
  still reads the board.
- **The brand violet stays restrained** (ADR 37): it marks the live "now" line,
  today's column, and the pending count. Statuses keep the functional colors,
  warning for a full class, destructive for a cancelled one.
- **Runs of two or more empty hours collapse** into one labelled band ("no
  classes 14:00-18:00"). A gym runs mornings, lunch, and evenings; the dead
  afternoon is a fact worth stating once, and collapsing it keeps the whole
  week on one screen. A class can never fall inside a collapsed band, since an
  hour any class overlaps is not empty.
- **The grid uses a 24-hour clock** regardless of locale. "06:30 PM" does not
  fit a column, and a timetable is read as numbers.
- **The phone keeps the day list.** Six columns stop being skimmable on a
  narrow screen, and the list keeps the full-size cancel button that the
  grid's hover control could not offer at a 44px touch target.
- `class.week` gains `instructorName` (a left join on `user`, the same pattern
  `class.get` already uses), because the coach's name is the third thing a
  reader looks for after time and title.

## Consequences

- Two renderings of one week read the same data. The list is not dead code, it
  is the touch layer.
- The cancel control in the grid appears on hover or keyboard focus. That is
  acceptable only because it is pointer-only by construction; every touch user
  reaches the labelled button in the list.
- Overlapping classes split their column into lanes. The lane math is local to
  the grid and has no effect on the domain.
