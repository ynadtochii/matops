# 88 — A query window is a cache key, so it cannot be built from a local clock

**Status:** accepted · **Date:** 2026-08-24 · **Area:** `packages/domain`, `apps/nextjs`. No migration, no dependency, no procedure changed. Twelve pages and three screens.

## Context

ADR [81](81-api-latency.md) built the `prefetch()` seam and proved it on the
`(app)` layout, then stopped. Ten of the twelve pages under `(app)/` were
three-line files that rendered a `"use client"` screen and fetched nothing on
the server, so a dashboard open ran: RSC payload, hydrate, mount, fire eight
procedures in two HTTP batches, then paint.

ADR [85](85-frontend-performance-baseline.md) measured what that costs. LCP
landed roughly 50 ms after the last query resolved, twice, on two separate
samples. The page was waiting on data, not on code. That made this the wave
worth doing.

**The thing that made it hard.** Three screens derived their query inputs from
`new Date()` with `setHours(0, 0, 0, 0)`, which is **local midnight**. Those ISO
strings are the tRPC cache key. A server prefetch runs in UTC on Vercel; a
browser runs in the academy's zone. Two different midnights produce two
different keys, the hydrated entry never matches what the client asks for, and
the page fetches **twice**. That is worse than not prefetching at all.

`dashboard-screen.tsx` already carried a comment admitting half of this:

```
// The query window is a query key, so it stays frozen. The clock is not, and
// freezing it left a long-open tab calling an ended class "now".
```

## Decision

**Query windows snap to UTC day boundaries. Display boundaries stay local.**

The reasoning, which is the part worth keeping:

1. A query window is a **cache key**. The only day boundary a server in UTC and
   a browser in any zone agree on, without a round trip to learn the zone, is
   the UTC one.
2. A query window is also a **superset filter**, not a display boundary. What a
   person sees is decided by `groupByDay`, `dayKey`, `sameDay` and
   `needsAttendance`, all of which re-bucket rows in local time after the fetch.
   So moving the window by an hour changes nothing on screen.
3. To make "changes nothing" true rather than nearly true, every window is
   padded a full day on both ends, and any screen that rendered its window
   directly now filters to its own local range.

The alternative was to pass the academy's `timeZone` into the window. It was
rejected: the page would have to await `academy.current` before it could build
the window before it could prefetch anything, which serialises the very thing
this wave exists to parallelise, and it puts a zone lookup on the critical path
of every navigation.

`packages/domain/src/query-window.ts` holds the rule:

| Function | Window | Used by |
|---|---|---|
| `classQueryWindow(now, {backDays, forwardDays})` | UTC-day-snapped span | the three below |
| `dashboardWeekWindow(now)` | `UNMARKED_LOOKBACK_DAYS + 2` back, 8 forward | `/` (staff) |
| `attendanceWindow(now)` | `ATTENDANCE_BACKFILL_DAYS + 1` back, 2 forward | `/attendance` |
| `studentWeekWindow(now)` | 1 back, 8 forward | `/` (student) |
| `scheduleWeekWindow(now, offsetWeeks)` | UTC Monday, padded a day each side | `/schedule` |

**Where a filter had to be added.** The dashboard already re-filtered everything
it drew, so widening its window was free. The other two did not:

- `student-screen.tsx` rendered `groupByDay(week.data)` straight out, so the
  wider window would have shown yesterday. It now filters to today through the
  next seven local days.
- `schedule.tsx` rendered `byDay.map(...)` and passed `week.data` to `WeekGrid`,
  so the padding days would have appeared as extra columns. It now filters to
  the seven local days of `weekStart(offset)`, and the filtered rows feed both.
- `attendance.tsx` renders every class in a picker. The window overshoots
  `ATTENDANCE_BACKFILL_DAYS` by a day, so the picker trims back to the real 14
  days, which is the range `canMarkAttendance` will actually accept.

Those three filters are load bearing. Deleting one shows the wrong days with
nothing failing.

**Twelve pages prefetch.** Each resolves `academy.current` through
`currentAcademy()`, a new helper on the request-cached QueryClient, so it costs
nothing beyond what the layout already fetched. Each then branches on role
before prefetching, so a student opening `/` does not trigger seven staff
queries that would only fail.

## Verification

Rendered every page server-side against the live database and read the
per-procedure log:

| Route | prefetched (beyond the shell's two) |
|---|---|
| `/` | `class.week`, `membership.members`, `stats.gym`, `stats.drifting`, `stats.revenue`, `payments.claims`, `dropIn.list` |
| `/schedule` | `class.week`, `template.list` |
| `/members` | `membership.members`, `membership.archived`, `dropIn.list` |
| `/coaches` | `membership.members`, `stats.coaches`, `membership.staff`, `invite.list` |
| `/payments` | `membership.members`, `payments.claims`, `payments.plans` |
| `/settings` | `academy.settings`, `payments.getRequisites` |
| `/referrals` | `referral.dashboard` |
| `/training` | `booking.mine`, `stats.me` |
| `/notifications` | `notification.list`, `notification.audienceCounts` |
| `/attendance` | `class.week` |
| `/profile` | `rank.mine` |

**The clock contract, checked directly.** For each of the three windowed routes,
the key dehydrated into the HTML was compared with the same window computed
independently outside the app:

```
/            2026-08-15T00:00:00.000Z → 2026-09-01T00:00:00.000Z   match
/schedule    2026-08-23T00:00:00.000Z → 2026-09-01T00:00:00.000Z   match
/attendance  2026-08-09T00:00:00.000Z → 2026-08-26T00:00:00.000Z   match
```

That is the failure mode this note exists to prevent, and it does not occur.

**Payload cost.** The dashboard's HTML grew from 48.6 kB to 202.2 kB raw. What
is actually sent is smaller: **7.0 kB → 19.1 kB brotli**, which is what Vercel
serves. So the trade is about 12 kB of extra transfer against two round trips
that ADR 85 measured at 687 ms. On 4G that extra payload is roughly 8 ms. Even
on slow 3G it approximately breaks even, and on anything better it is a large
win. The raw 154 kB figure is not the number to reason about.

## Not verified

**The client-side half of the gate is unmeasured.** The plan's gate is "on a
cold dashboard open, zero tRPC requests fire from the browser after hydration".
The browser automation was unavailable throughout this slice, so that count was
never taken. The keys match and every entry hydrates fresh under ADR
[87](87-one-freshness-policy.md)'s table, so a refetch would require a mismatch
that the check above disproves. That is an inference, not a measurement, and it
should be confirmed with DevTools before this is trusted as done.

**No new LCP number.** ADR 85's runtime table has no wave 3 column yet, for the
same reason.

## Consequences

- **Never build a query input from a local-midnight clock.** Add a window to
  `packages/domain/src/query-window.ts` instead, and filter for display.
- The three display filters named above must not be "simplified" away.
- New pages under `(app)/` should follow `(app)/page.tsx`: `currentAcademy()`,
  branch on role, `Promise.all` the prefetches, wrap in `HydrateClient`.
- `prefetchQuery` swallows errors, so a prefetch the caller is not entitled to
  degrades to a client fetch rather than breaking the page. The role branch is
  there to avoid the wasted work, not for safety.
- Tests: `packages/domain/test/query-window.test.ts` covers same-UTC-day
  stability, the midnight roll, a DST crossing, Monday alignment, and the
  per-offset step. Run `pnpm -F @matops/domain test`.
