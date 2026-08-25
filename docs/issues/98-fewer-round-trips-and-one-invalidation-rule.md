# 98 — Fewer round trips, and one rule for what a mutation dirties

**Status:** accepted · **Date:** 2026-08-25 · **Area:** `packages/api`, `packages/domain`, both clients · **Extends:** [97](97-the-notification-path-gets-a-test.md) · **Refines:** [81](81-api-latency.md), [87](87-one-freshness-policy.md), [88](88-server-prefetch-and-the-clock-contract.md)

## Context

Phase 6 of `docs/backend-architecture-epic.md`, written against the merged
release branch rather than the backend branch. Phase 6 is about round trips and
cache rules, which is exactly what the frontend arc had just changed, so writing
it anywhere else would have meant merging it twice.

Three of the five items turned out to be wrong or already done. That is the
useful part of this note.

## Decision

### `stats.dashboard` replaces three procedures

`stats.gym`, `stats.drifting` and `stats.revenue` are one procedure. Staff tier,
because `gym` was staff-visible; the two owner-only halves come back `null` for
an instructor and their reads are skipped, which is the shape `gym` already used
for `newMembers`.

**The item's stated benefit did not survive the frontend merge, and the
measurement says so.** It claimed the non-streaming batch would stop waiting on
the slowest of three. The batch is not non-streaming any more (ADR 89), and wave
0 had already measured that procedures inside one batch run concurrently. Warm
dashboard render, five runs each: **0.79-0.96s before, 0.87-0.89s after.** No
wall-clock change, and none is claimed.

What did change:

- **Three tenant transactions become one.** Each was one pooled connection out of
  twenty. This is the real win and it is about connection pressure, not latency.
- **Two `academyTimeZone` calls become one.** It is not cached, and it costs two
  queries when the academy row has no `time_zone` and it falls through to the
  most common template zone.
- **Two `rosterOf` calls become one.**

Roughly seven queries across three transactions become five in one.

Given up: the three panels used to hydrate independently and now arrive together.
They are the dashboard's lower half; the primary content is untouched. This is
the one place this phase and the frontend arc pull against each other.

### One invalidation rule, and the bug it exposes

`invalidatedBy(aggregate)` in `packages/domain` returns the tRPC namespaces a
mutation dirties. **Every aggregate includes `stats`**, with a test asserting it,
because that was the bug: no booking and no attendance mark refreshed the gym's
figures. Dashboard insights, the drifting list and a student's own training stats
all sat stale after the thing that changed them.

The merge had quietly made it worse. ADR 87 gives `stats` a two-minute
`staleTime`, up from the old 30-second default, so the stale window grew from
half a minute to two minutes. Neither change is wrong alone.

Wired at three call sites through a five-line `useInvalidate()` per client, so
the table stays pure and shared. The key shape was verified rather than assumed:
`getQueryKeyInternal` builds `[["class"]]` for a path filter with no input, which
is what the helper builds, and it prepends a configured prefix, which neither
client sets.

`class-roster.tsx` keeps its deferred invalidation, so tapping through a register
does not re-run the booking-count subqueries per tap. `stats` joins the deferred
cleanup for the same reason.

The other ~30 call sites still name their own paths. Rewriting them is a large
mechanical change with no bug behind it.

### Three items rejected on the evidence

**Folding `rank.forMember` and `note.forMember` into a `memberDetail` procedure
would make the page slower.** The claim was "ten opened member rows go from 30
procedures to 10". Opening a row fires **one** procedure:
`member-detail.tsx:141` renders `RankTab` and `NotesTab` only when their tab is
selected, and the members page prefetches neither. Folding would make ten cheap
opens each read the rank ledger and the staff notes for tabs most people never
click.

**Folding the coach breakdown into `stats.coaches` trades a rare query for a
payload everyone pays.** `coachBreakdown` returns `recent`, every class that
coach led in the window. A month window and five classes a week is about twenty
summaries per coach; ten coaches is two hundred, on a response carrying a few
aggregate rows today. Expanding a card is user-initiated and **only one card can
be open at a time**. The page load is far more frequent than the expand.

**Half of the mobile waterfall item was already fixed by the merge.** The
`academy.current` staleTime now comes from ADR 87's shared table, which both
clients read; the hardcoded override the item pointed at is gone. On the web,
ADR 88's prefetch already parallelised both hoists. Only mobile was left.

### The mobile waterfalls

`(tabs)/training.tsx` rendered `MyTrainingCard` inside the `mine.isPending`
branch, and that card owns the `stats.me` query, so the stats read could not
start until bookings landed. `class/[id].tsx` had the same shape with `WhoIsIn`
and `class.attendees`.

Both fixed by starting the second query in the parent, above the gate. TanStack
keys both to the same entry, so the child subscribes rather than making a second
request, and neither component's interface changed. Each carries a two-line
comment: a `useQuery` whose result is discarded reads as dead code, and deleting
it would put the waterfall straight back.

## Consequences

- `pnpm test` is **733 passing, 0 failing**, from 727. Six new, on the
  invalidation rule.
- `stats.gym`, `stats.drifting` and `stats.revenue` no longer exist. Any caller
  outside this repo would break; there are none.
- `next build` passes and all 23 routes still prerender. Every screen was walked
  signed in against live Neon with no server error.
- **Not verified on a device.** The two mobile fixes are behaviour no static gate
  can see. They go on `docs/mobile-device-test.md`.
