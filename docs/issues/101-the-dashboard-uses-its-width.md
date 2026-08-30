# 101 — The dashboard uses its width, and the panel gets built

**Status:** accepted · **Date:** 2026-08-28 · **Area:** `apps/nextjs`, `packages/ui`. No migration, no procedure changed, one spec bullet dropped. **Refines:** [80](80-loading-states.md), [76](76-pilot-blockers.md), `docs/design.md` §2 / §4

## Context

A design pass over O1, the screen an owner opens first and returns to all day.
Nothing was broken. Six things were wrong.

## 1. The cold-load skeleton was the wrong screen

`(app)/page.tsx` serves an owner and a student from one route. Its Suspense
fallback drew `SkeletonClassDays`: three sections of filled card rows with row
actions. That is the **student** home. An owner never sees that layout, so an
owner's first paint was a placeholder for a screen that never arrives, followed
by a hard cut to something else entirely. `design.md` §4 is explicit that a
placeholder looks like what follows it.

The role cannot be known at fallback time. `AppLayout` awaits
`currentAcademy()`, but the page's own boundary opens before that resolves on a
client navigation, and hoisting the await above the boundary is the thing ADR
[89](89-streaming-the-panels.md) and ADR
[91](91-cache-components-and-the-static-shell.md) worked to avoid.

So the fallback now draws **only the header both screens share**. Each screen
paints its own body skeletons the moment it mounts, and the fallback never
contradicts what follows. Where nothing is known, draw nothing, which is the
same rule §4 already applies to a wait under 180ms.

## 2. The instrument panel existed in the doc and half in the code

`design.md` §2 defines one shape for a set of top-of-screen readings: a bordered
strip on `bg-grid-small`, split into cells, each floated above the texture with
`bg-background/90`. The O1 queue was supposed to be that object.

What was actually drawn, in one slot, was three unrelated silhouettes:

| state     | before                                              | after          |
| --------- | --------------------------------------------------- | -------------- |
| filled    | bare square cells, no strip, no texture             | the strip      |
| all clear | `rounded-lg` dashed box on `bg-grid-small`          | the same strip |
| first run | `EmptyState`, another dashed box, different padding | the same strip |

`bg-grid-small` appeared exactly once in the whole app, on the middle row, so
the motif read as an accident. The panel is now a real component (`Panel`,
`panelCell`, `PanelNotice` in `primitives.tsx`) and every state fills it.
Channels that carry nothing are absent and the grid shows through, which also
retires the ragged right edge a wrapped flex strip left behind.

The cells sit in a grid pulled one pixel past the strip and clipped, so the last
column and row shed their hairline into the strip's own border instead of
doubling it. `SkeletonQueue` is built from the same two exports, so it cannot
drift.

## 3. Four full-width sections in a 1088px column

The screen was header, queue, then Today, Insights, Who's drifting and Quick
actions stacked. Day rows are about 40px tall with content only at the two
extremes, so on a laptop an owner saw the queue and maybe today, with the gym's
numbers below the fold behind a lot of empty horizontal space.

On `lg` the page now splits: the day rail and the drifting list on the left,
**Insights as a 20rem right rail**. The queue strip stays full width, because it
is the top-of-screen instrument. Below `lg` nothing changes except the order:
the drifting list, which is a list of people to contact, now comes before the
numbers.

The Insights stats moved from `flex flex-wrap` to a grid: two columns at full
width, **one column in the rail**, where a money figure and its comparison would
not fit side by side. Arbitrary wrapping is gone.

## 4. Quick actions is deleted

A whole section, with its own rule, for two outline links to `/schedule` and
`/attendance`. Both routes are in the sidebar, and attendance is already the
first queue tile whenever there is anything to mark. The empty day state keeps
its "Add a class" link, which is the one moment the shortcut earns its place.

The page header said **"This week"** while the block under it was a today-scoped
queue and a today-or-tomorrow class list. It now says **"Dashboard"**, matching
every other screen, and the date stays in the subtitle.

## 5. The clock did not tick

`week-grid.tsx` had a one-minute interval. The dashboard did not: `now` was
recomputed on every render, but nothing scheduled a render, so a tab left open
all evening drew a frozen now-line and kept an ended class marked live. The
comment in `dashboard-screen.tsx` describes the fix that was never finished.

One `useMinuteClock()` now serves both. Every query window that consumes it is
day-aligned (`utcDayStart`), so ticking never changes a query key.

Also fixed: the day row's title had `flex-1` with no `min-w-0 truncate` while
every sibling was `shrink-0`, so on a phone a long title plus the Unmarked and
You badges pushed the capacity count off the row.

## 6. Nothing in the app responded to a press

Every interactive surface was `transition-colors` and nothing else. `Button` now
carries `active:scale-[0.96]`, and so does a queue tile. Its `transition-all`
became a named property list at the same time.

The full-width day rows and drifting rows deliberately **do not** scale: 4% of a
728px row is 30px of travel, which is a lurch, not feedback. They keep the
colour response and the focus ring.

Motion is otherwise one staged entrance, 100ms apart, on the three top-level
blocks, and a 200ms fade when a panel's data replaces its skeleton. Both are
held still under `prefers-reduced-motion`, and both play on mount only, which
ADR [100](100-the-client-router-keeps-a-page-for-30-seconds.md) makes rare: a
tab you return to inside 30 seconds is never remounted.

## Not verified

**Nothing was looked at in a browser.** No dev server for this app was running,
and signing in needs a magic link from the server terminal. Every claim above is
read from the code, plus `pnpm typecheck` (17/17), `pnpm -F @matops/nextjs lint`,
a clean `next build`, and a grep of the built CSS confirming that
`repeat(auto-fill,minmax(10.5rem,1fr))`, `col-span-full`, `fill-mode-backwards`,
`lg:grid-cols-1` and both `active:scale` rules are emitted, with the reduced-motion
override correctly inside its media query.

What that leaves unchecked: how the 1px-clipped hairlines actually land, whether
`bg-background/90` over the 8px grid reads as intended on the black theme,
whether the 20rem rail is the right width, and every animation at 10% speed.

## Consequences

- `design.md` §2's panel is now a component, so the next set of readings has one
  to reuse instead of a fourth silhouette.
- `HomeSkeleton` is deliberately thinner than the screens it stands in for. If a
  future change makes the two home screens share a body shape, it can grow again.
- Deleting Quick actions removes the only place the dashboard offered "Take
  attendance" outside the queue. An owner with nothing to mark reaches attendance
  through the sidebar.
