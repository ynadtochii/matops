# 96 — One definition per rule, and one boundary for strings

**Status:** accepted · **Date:** 2026-08-25 · **Area:** `packages/domain`, `packages/validators`, `packages/api`, both clients · **Extends:** [95](95-what-belongs-in-domain.md) · **Refines:** [24](24-qr-self-checkin.md), [58](58-input-validation-and-sanitization.md), [71](71-academy-map-link.md)

## Context

Phase 4 of `docs/backend-architecture-epic.md`. Phase 3 moved rules into
`packages/domain`. This phase deals with what was already there: rules defined
more than once, rules defined and never called, and a boundary that each field
had to opt into.

The plan's list for this phase was written from a read at one commit and was
wrong in several places. Where it was, the log says so and this note records the
corrected version.

## Decision

### The check-in window had three definitions and two of them were wrong

This is the phase's real finding, and both halves are live defects.

**The `checkIn` mutation accepted a class from two weeks ago.** Its guard was
`canMarkAttendance`, the attendance backfill window: 14 days back, 1 day forward.
The rule the product promises is `resolveCheckInClass`, from 60 minutes before
the start through the end of the class. Spec S8 says "the class happening now",
and the resolver's own error message already said "No class to check into right
now" while accepting anything from the last fortnight. So the real rule ran on
the client only, and a student could mark themselves present at a class they
never attended, which then feeds the attendance statistics and the drifting
report. The guard is `canCheckIn` now.

**A long class that was still running was invisible to the scanner.** The query
that feeds `resolveCheckInClass` was bounded by a hardcoded 3 hours back and 6
hours ahead, derived from nothing, while the validators accept a
`durationMinutes` up to 600. A ten-hour seminar that started five hours ago is
inside its own check-in window and outside the query that looks for it.

`checkInFetchWindow(now)` derives both ends from the rule: back
`MAX_CLASS_MINUTES`, forward `CHECK_IN_EARLY_MINUTES`. The forward end also
narrows, from six hours to one, because a class whose doors have not opened is
not a candidate. A test sweeps start times and durations and asserts the window
never drops a class `canCheckIn` would accept.

### One week is two things, not one

The plan asked for a single `academyWeek` replacing five hand-rolled windows.
That would have been wrong. The five are two different concepts:

- A **rolling window** from midnight today, used by the student schedule on both
  clients and by the dashboard: `dayWindow(now, {backDays, aheadDays})`.
- A **calendar week** the owner pages through on the O2 grid, Monday first:
  `calendarWeekStart(now, offset, startsOn)`.

Folding them together would turn the student's "next seven days" into "the rest
of this week", which is a different product.

`apps/nextjs/.../attendance.tsx` is a third case and keeps its own arithmetic.
Its picker window has to match `canMarkAttendance`, and that rule is
**instant-anchored** (`now - 14 * DAY_MS`), not midnight-anchored. Moving it to
`dayWindow` would widen it past the server rule and offer classes the mutation
then refuses. The "five hand-rolled windows" are four, and one of them is right.

**Still open, and a product decision rather than a refactor.** The grid pages
Monday-first while `localDate`'s `weekBucket` is Sunday-aligned and feeds "weeks
trained" in `trainingStats`. A student who trains Sunday and Monday counts as two
weeks under Sunday alignment and one under Monday. Changing `weekBucket` moves
every historical figure. `WeekStartsOn` and `GRID_WEEK_STARTS_ON` make the choice
visible at the call site instead of hiding it in a `(getDay() + 6) % 7`.

### A tested rule that never ran

`isInReminderWindow` and `reminderRecipients` in `packages/domain/src/notify.ts`
were the reminder rules, tested seven ways, and **never called**. What runs is
SQL inside `claimDueReminderClasses`, which has no test at all. They are not even
the same algorithm: the SQL bounds the window on one side plus
`reminder_sent_at IS NULL`, the domain version used a two-sided sweep window.

Both are deleted, with their tests. Deleting the twin makes the gap visible
instead of papering over it, and epic item 5.2 now owns testing the SQL and says
not to resurrect the twin. A rule with passing tests that production does not
call is worse than an untested rule, because it reads as covered.

### `DAY_MS` was declared nine times

Four of them inside `packages/domain` itself, while `local-date.ts` exported one
nobody imported. One of the nine was `86400000`, the same number written
differently. All now import the one.

`apps/nextjs/.../attendance.tsx` also hardcoded `14` for the backfill window
while `ATTENDANCE_BACKFILL_DAYS` sat exported and unused, so the screen and
`canMarkAttendance` could disagree on the next edit.

### What was NOT deleted

The plan listed roughly 45 exported types and 30 constants as dead. That list
does not survive checking, and acting on it would have removed live code:

- Most constants are used by the module that declares them. They are not dead,
  only un-imported, and un-exporting them would break the domain tests that
  import them directly.
- Most types are the parameter and return types of functions that ARE used.
  Deleting them takes away a caller's ability to name what it receives, and
  TypeScript erases them at build.
- A scan for "imported from `@matops/domain`" **undercounts**. `fillLabel` looked
  unused and is re-exported through `apps/expo/src/utils/format.ts`.

`src/invite.ts` was genuinely dead, superseded by `InviteRoleSchema`. So was
`NOTIFICATION_KINDS`. Those went.

### Label maps stay in `packages/domain`

The plan asked whether they belong behind a separate entry point. Decided no.
They pass the ADR 95 test (a decision about what the product says, no I/O,
user-visible if wrong), both clients share them, and a second entry point means a
second export map and a choice at every import site. The problem it would solve,
"a caller cannot tell a deep rule from a string helper at the import site", is
real and small, and the fix is worse than it.

### Sanitizing is a property of the builder now

`cleanedString(rawMax)` is the one entry point for a user-supplied string: bound
it cheaply, then strip the invisibles. Every text field is built on it, so a
field cannot opt out by forgetting.

**`HttpUrlSchema` was the field that had opted out**, and it is the one rendered
as a tappable `href` for every member of a gym (ADR 71). A zero-width space or a
bidi override survived validation and reached the DOM. A right-to-left override
lets the visible text disagree with where the tap goes.

The scheme check still runs **after** `z.url()`, so `java<ZWSP>script:` is
refused rather than cleaned into `javascript:`. There is a test for that
specifically, because "strip then parse" is the ordering that could introduce the
bug it is meant to prevent.

`IdSchema` and `OpaqueTokenSchema` keep `.trim()` and no strip. They are opaque
values compared exactly against the database and never rendered; stripping there
would let a malformed id quietly become a valid one.

### One `isValidTimeZone`

`packages/validators` had a private copy of the function `packages/domain`
already exported, and the two differed on an empty string.
`@matops/validators` now depends on `@matops/domain` (acyclic) and there is one
implementation. `academy.updateSettings` had been checking a time zone with both.

## Consequences

- `pnpm test` is **690 passing, 0 failing**, from 671 at GATE 3. Nine tests were
  deleted with the code they covered (seven decoys plus `isInvitableRole`), and
  28 were added.
- `packages/validators/src/index.ts` is nine files behind an unchanged barrel.
  No caller changed: the split is invisible outside the package. `lineText` and
  `blockText` had to become exported to be shared, which is the one visible
  surface change.
- `personFields` replaces five copies of `{ firstName, lastName, phone }`. The
  walk-in still overrides `lastName` to optional, and that override is now the
  only line that differs.
- `WeekWindowSchema` moved from `packages/api/src/router/class.ts` into the
  validators, and its 400-day cap is a named constant the error message
  interpolates.
