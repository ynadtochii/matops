<!-- matops — the v4.x frontend performance arc. Plan only. Rules for how we build live in delivery.md; the live matrix lives in roadmap.md. -->

# matops — frontend performance plan (v4.2 to v4.7)

> **What this file is.** The build plan for one arc of work: making `apps/nextjs`
> fast on Vercel. It is a plan, not a decision record and not a status board.
> Each wave below turns into an ADR in `docs/issues/` when it is built, and into
> a row in [roadmap.md](roadmap.md) when it starts.
>
> **Scope: the web frontend.** One wave touches `apps/expo` (a five-line change,
> explained where it appears) and one optional wave is backend and sits outside
> the arc.

**Written:** 2026-08-24 · **Status:** **the arc is complete.** Waves 0 to 5 shipped (ADR 85, 86, 87, 88, 89, 90, 91); wave 6 stays parked, for a measured reason · **Follows:** ADR
[81](issues/81-api-latency.md) (API latency), ADR [83](issues/83-streamed-responses-drop-set-cookie.md)
(the buffered link), ADR [80](issues/80-loading-states.md) (loading states).

---

## 1. Why this arc exists

ADR 81 fixed the API tier. It removed the identity queries, cut the tenant
transaction to one round trip, pinned the functions to Frankfurt, and proved the
`prefetch()` seam on the shell layout. It stopped there on purpose.

The client tier was never touched. Ten of the twelve routes under `(app)/` are
three-line files that render a `"use client"` screen and fetch nothing on the
server. So a navigation still runs: RSC payload arrives, React hydrates, the
screen mounts, seven queries fire, one batched request crosses to Frankfurt,
seven transactions open, then the page paints.

There are 48 client components, zero `<Suspense>` boundaries, zero dynamic
imports, and two `staleTime` overrides in the whole app.

None of that is bad code. It is the create-t3-turbo default shape, and it was
the right shape while the product was being found. It is now the slowest part of
the stack.

---

## 2. The baseline the web says to aim at

Pulled 2026-08-24 from the Next.js 16 release notes, the Vercel functions and
data cache docs, and the TanStack Query server rendering guides. Recorded here
so a future session does not have to re-read them.

| Area           | The rule                                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Caching        | Nothing is cached by default in Next 16. Caching is opt in, through `cacheComponents: true` and the `"use cache"` directive. Put `"use cache"` next to the data read, not on the layout.                                              |
| Rendering      | Server Components are the default. Client Components only where there is interactivity. PPR ships a static shell at once and streams the dynamic parts behind `<Suspense>`.                                                           |
| Routing        | Next 16 rewrote prefetching. Shared layouts download once instead of once per link, and only the missing parts are fetched. Free, no code change.                                                                                     |
| React Compiler | Stable in 16, off by default. `reactCompiler: true` memoizes components automatically. It runs on Babel, so builds get slower.                                                                                                        |
| Cache APIs     | `revalidateTag(tag, profile)` now needs a `cacheLife` profile. `updateTag()` gives read your writes inside a Server Action. `refresh()` refreshes uncached data only.                                                                 |
| Vercel compute | Run functions in the same region as the database. Fluid Compute shares an instance across concurrent requests and bills active CPU, which suits work that spends its time waiting on a database.                                      |
| TanStack Query | Prefetch on the server, hydrate on the client. That flattens waterfalls on first load and on every navigation. `staleTime` must be above 0 or the client refetches the moment it hydrates. Each Suspense boundary streams on its own. |

Sources: [Next.js 16](https://nextjs.org/blog/next-16) ·
[Vercel Functions](https://vercel.com/docs/functions) ·
[Vercel Data Cache](https://vercel.com/docs/caching/runtime-cache/data-cache) ·
[Fluid Compute benchmarks](https://vercel.com/blog/fluid-compute-benchmark-results) ·
[TanStack Query advanced SSR](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr)

---

## 3. What the review found

Ranked by impact. Each one maps to a wave in §5.

| #   | Finding                                                                                                                                                      | Evidence                                                                                                                                                                                      | Wave |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Every route page is an empty shell. All data is fetched after hydration.                                                                                     | 10 of 12 pages under `(app)/` are three-line files. Only `(app)/layout.tsx:20` prefetches. `dashboard-screen.tsx:132-157` fires 7 queries on mount.                                           | 3    |
| 2   | There is no freshness policy. Two `staleTime` call sites exist in the whole app.                                                                             | `trpc/query-client.ts:11` sets a global 30s. `app-shell.tsx:204,208` override it. Nothing else does. `apps/expo/src/utils/api.tsx:14` hardcodes the same 30s separately.                      | 2    |
| 3   | Heavy, rarely used leaf modules are statically imported into hot route bundles.                                                                              | `schedule-screen.tsx:8` → `templates.tsx:27` → `schedule-poster.tsx:17` → `poster-draw.ts`, 370 lines of canvas drawing, on every `/schedule` load. `qrcode.react` rides along on `/coaches`. | 1    |
| 4   | Zero `<Suspense>` boundaries. `loading.tsx` is all or nothing.                                                                                               | No `Suspense` anywhere in `apps/nextjs`. `skeletons.tsx` is 895 lines of hand-drawn layout swapped in one step.                                                                               | 4    |
| 5   | React Compiler is off.                                                                                                                                       | No `reactCompiler` in `next.config.js`. 48 client components, several over 600 lines.                                                                                                         | 1    |
| 6   | Cache Components and PPR are not enabled, and the public pages are not static.                                                                               | No `cacheComponents`, no `"use cache"`. `/checkin/[academyId]` and `/join/[token]` are the printed-QR landings and boot the full dynamic path.                                                | 5    |
| 7   | Both Google font families preload on every route.                                                                                                            | `app/layout.tsx:52-59`. `Geist_Mono` renders a dozen characters per page.                                                                                                                     | 1    |
| 8   | Two Vercel settings are unverified.                                                                                                                          | ADR 81 called the `fra1` pin inferred, not measured. Fluid Compute status is unknown from the repo.                                                                                           | 0    |
| 9   | One transaction per procedure per batch.                                                                                                                     | Named in ADR 81 as deliberately not done. Backend.                                                                                                                                            | 6    |
| 10  | **The shared bundle is the bundle.** 1419 kB of the 1555 kB dashboard first load is 16 chunks shared by all 18 routes. The whole per-route spread is 152 kB. | Measured 2026-08-24, see wave 0. `/_not-found` 1419 kB vs `/schedule` 1571 kB.                                                                                                                | 1    |
| 11  | **Sentry and zod are 58% of that shared floor.** Sentry 536 kB, zod 292 kB, on every route including static `/privacy`.                                      | Chunk fingerprinting, wave 0. Session Replay alone was 123 kB raw / 39 kB gzip.                                                                                                               | 1    |

### What is already right

Stated so it does not get redone. `fra1` matches Neon `eu-central-1`. The session
cookie cache removes two queries per request. The tenant transaction is one round
trip. The pool is sized to 20. The shell's two queries are prefetched. The
`httpBatchLink` choice is correct and load bearing (ADR 83). The QueryClient
factory pattern is the textbook one. There is no `next/image` misuse because
there are no images.

---

## 4. Two traps that decide the ordering

Both were found while planning. They are why the waves are in this order and not
another.

### Trap 1: prefetching without a freshness policy does nothing

TanStack Query's `staleTime` is 30 seconds here and unset almost everywhere. A
client that hydrates a prefetched entry, finds it stale, and refetches has gained
nothing but a wasted server query. **Wave 2 must land before wave 3.**

### Trap 2: the query window is the cache key, and it is built from the clock

`dashboard-screen.tsx:115-126` derives `weekFrom`, `weekTo` and `leadsSince`
inside a `useMemo(..., [])` over `new Date()`. The file already carries this
comment:

```
// The query window is a query key, so it stays frozen. The clock is not, and
// freezing it left a long-open tab calling an ended class "now".
```

If a server prefetch calls `new Date()` too, the two clocks differ by
milliseconds, the ISO strings differ, the cache keys miss, and the page fetches
**twice**. That is worse than today. The same shape appears in `schedule.tsx:154`
(`weekStart(offset)`), `my-classes-screen.tsx` and `student-screen.tsx:44`.

Fixing that is the actual work in wave 3. The page edits are four lines each.

---

## 5. The waves

**Renumbered.** The first draft numbered these v4.1 to v4.6, but `roadmap.md`
already uses **v4.1 for archive and permanent erase** (ADR 84). The arc runs
**v4.2 to v4.7** instead. v4.0 was ADR 81.

Each wave is vertical and shippable on its own, and ends with the
[Definition of Done](delivery.md#4-definition-of-done-the-anti-drift-gate):
docs synced, matrix flipped, one CHANGELOG line.

```
Wave 0  baseline + Vercel checks
   │
   ├──> Wave 1  bundle wins            (independent, ship any time)
   │
   └──> Wave 2  freshness policy
           │
           └──> Wave 3  server prefetch      <- the big one
                   │
                   └──> Wave 4  streaming
                           │
                           └──> Wave 5  static shells + Cache Components

        Wave 6  batch transaction  (backend, decide after wave 3 is measured)
```

Waves 1 and 2 can run in parallel. Everything from wave 3 down is sequential.

---

### Wave 0 — v4.2 · Baseline and the two Vercel checks — **SHIPPED**, ADR [85](issues/85-frontend-performance-baseline.md)

**No product code.** This is the foundation the other five stand on.

**Why first.** Every wave below claims a number. Without a before-number none of
them can be checked, and ADR 81 already left an unverified claim behind. Do not
build on an unmeasured base.

**Both Vercel checks: done, 2026-08-24.**

1. **Fluid Compute is on.** Confirmed three ways: the project API
   (`defaultResourceConfig.fluid: true`), and the Functions settings page.
   Node 24.x, so optimized concurrency applies. Nothing to change.
2. **The `fra1` pin is live.** A request through the custom domain returns
   `x-vercel-id: cdg1::fra1::…`, so the edge is Paris and the function is
   Frankfurt. The dashboard shows Function Region `Overridden`, because
   `apps/nextjs/vercel.json` sets it. The project _default_ is still `iad1`:
   delete that file and every function silently moves to Virginia.
   ADR 81's inferred claim is now measured. The arc proceeds as planned.

**Correction to the method.** Step 2 above originally said to read the region
from the `[TRPC]` timing lines. Those print duration only
(`packages/api/src/trpc.ts:143`) and cannot show a region. `x-vercel-id` can.

**Correction to the method, again.** Next 16 removed the size columns from
`next build` output. First Load JS now lives in
`.next/diagnostics/route-bundle-stats.json`. Every wave's gate reads that file,
not the build log.

**The baseline, 2026-08-24, commit `0243e23`.** Build green in 10.5s.

| Route                  |     raw |   gzip |
| ---------------------- | ------: | -----: |
| `/schedule`            | 1571 kB | 453 kB |
| `/members`             | 1567 kB | 453 kB |
| `/` (dashboard)        | 1555 kB | 448 kB |
| `/coaches`             | 1551 kB | 448 kB |
| `/payments`            | 1545 kB | 444 kB |
| `/settings`            | 1536 kB | 444 kB |
| `/attendance`          | 1525 kB | 441 kB |
| `/referrals`           | 1525 kB | 440 kB |
| `/class/[id]`          | 1522 kB | 439 kB |
| `/profile`             | 1519 kB | 438 kB |
| `/notifications`       | 1517 kB | 438 kB |
| `/training`            | 1512 kB | 436 kB |
| `/join/[token]`        | 1445 kB | 415 kB |
| `/checkin/[academyId]` | 1441 kB | 414 kB |
| `/sign-in`             | 1428 kB | 410 kB |
| `/start`               | 1428 kB | 410 kB |
| `/privacy`             | 1423 kB | 408 kB |
| `/_not-found`          | 1419 kB | 406 kB |

**What the table says, and it is not what §3 finding 3 assumed.** 16 chunks
totalling **1419 kB are shared by all 18 routes**. The entire spread from the
lightest route to the heaviest is 152 kB. Per-route imports are not where the
weight is. The shared floor is.

Fingerprinting those 16 chunks:

| Chunk              |    raw | Contents         |
| ------------------ | -----: | ---------------- |
| `2w6smg0wxlt24.js` | 536 kB | Sentry           |
| `02ijvc-wqbcvl.js` | 292 kB | zod              |
| `29yfx0d5cn64j.js` | 131 kB | Radix            |
| `022n7bcr5aa8a.js` | 110 kB | React scheduler  |
| `3vt5fsmsbn-4b.js` |  83 kB | tRPC + superjson |

Sentry plus zod is 828 kB, 58% of the floor, on every route including static
`/privacy`. That reorders wave 1. See below.

**The runtime baseline, 2026-08-24.** Production, signed in as the owner of the
Alma beta demo academy, Chrome from Lisbon, warm HTTP cache. Two samples of a
dashboard open:

| Metric                            |   sample 1 |   sample 2 |
| --------------------------------- | ---------: | ---------: |
| TTFB                              |      34 ms |      40 ms |
| Document `responseEnd`            |     471 ms |     257 ms |
| First Contentful Paint            |     628 ms |     416 ms |
| **Largest Contentful Paint**      | **996 ms** | **740 ms** |
| DOMContentLoaded                  |     514 ms |     276 ms |
| `load`                            |     691 ms |     472 ms |
| tRPC HTTP batches after hydration |          2 |          2 |
| tRPC procedures after hydration   |          8 |          8 |
| First tRPC starts                 |     598 ms |     358 ms |
| **All data in**                   | **953 ms** | **687 ms** |

The two batches, from sample 2:

| Batch | starts |  takes | procedures                                                                  |
| ----- | -----: | -----: | --------------------------------------------------------------------------- |
| 1     | 358 ms | 135 ms | `membership.members`, `payments.claims`, `notification.unreadCount`         |
| 2     | 449 ms | 238 ms | `class.week`, `dropIn.list`, `stats.gym`, `stats.drifting`, `stats.revenue` |

**Three things this changes.**

1. **TTFB is not the problem.** 34-40 ms, because Next streams the RSC shell
   before the data is ready. Any wave that claims a TTFB win is claiming a win
   on a number that is already good. Measure `responseEnd` and LCP instead.
2. **LCP is data-bound, not bundle-bound.** LCP lands at 740 ms with all data in
   at 687 ms, and at 996 ms with all data in at 953 ms. The page paints when the
   queries land, not when the bundle parses. This is the strongest evidence in
   the arc that **wave 3 is where the win is**, and it confirms the ordering.
   It also caps what wave 1 can ever be worth.
3. **`academy.current` and `academy.memberships` are absent from both batches.**
   ADR 81's layout prefetch works in production. The seam is proven, wave 3 is
   extending something that already runs.

**Gate.** A baseline table committed in the ADR, one row per route. Every later
wave adds a column to it. Regenerate with the script in the ADR, which reads
`route-bundle-stats.json` and gzips each chunk.

**Docs.** ADR 85 opens as the umbrella note for the whole v4.x arc and holds the
baseline plus the method. Later waves append their measured deltas there rather
than each inventing their own numbers.

**Risk.** None. The worst case was learning the region pin failed. It did not.

---

### Wave 1 — v4.3 · The cheap bundle wins — **SHIPPED**, ADR [86](issues/86-sentry-replay-out-of-the-entry-bundle.md) (item 1) and [90](issues/90-cheap-bundle-wins-and-one-measured-no.md) (items 3, 4, 5); item 2 stays an investigation

**Reordered after wave 0 measured the bundle.** The original plan for this wave
listed three per-route changes. Wave 0 showed that 91% of the dashboard's first
load is shared by every route, so per-route work cannot reach it. The shared
floor comes first now, and the per-route items stay but drop down the list.

**Work, heaviest first**

| #   | Change                                                               | Files                                                                                          | Measured             |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------- |
| 1   | **Load Sentry Session Replay lazily** instead of in `integrations[]` | `instrumentation-client.ts`                                                                    | **done**, see below  |
| 2   | Decide what to do about zod, 292 kB on every route                   | investigation first                                                                            | open                 |
| 3   | `next/dynamic` on the poster and QR components, `ssr: false`         | `schedule-screen.tsx:8`, `templates.tsx:27`, `invite-link-card.tsx:23`, `venue-checkin.tsx:10` | 4 import lines       |
| 4   | `preload: false` on `Geist_Mono`                                     | `app/layout.tsx:57`                                                                            | 1 argument           |
| 5   | `reactCompiler: true` plus `babel-plugin-react-compiler`             | `next.config.js`                                                                               | 1 flag, 1 dependency |

**Item 1 is done.** `Sentry.replayIntegration()` was in `integrations[]`, so
rrweb shipped in the entry bundle on all 18 routes. Three builds, measured:

| Build                            | shared floor | dashboard raw | dashboard gzip |
| -------------------------------- | -----------: | ------------: | -------------: |
| baseline, Replay static          |      1419 kB |       1555 kB |         448 kB |
| Replay removed entirely          |      1296 kB |       1432 kB |         409 kB |
| **Replay lazy-loaded (shipped)** |  **1316 kB** |   **1452 kB** |     **417 kB** |

Lazy loading recovers 103 of the 123 kB and keeps the feature.
`replaysSessionSampleRate` is 0 and `replaysOnErrorSampleRate` is 1.0, so Replay
only ever records around an error. Buffering starts when the dynamic import
resolves, a few milliseconds after boot, which costs the very start of the
session and nothing else. Sentry documents this exact pattern.

That one change beats items 3, 4 and 5 combined, and it applies to every route
rather than two.

**A trap found while doing it.** `next.config.js` passes
`webpack: { treeshake: { removeDebugLogging: true } }` to `withSentryConfig`.
Sentry's tree-shaking options are webpack only, and Next 16 builds with
Turbopack. That config is inert. It is left in place because it becomes correct
again if the build ever moves back to webpack, but nobody should read it as
proof that Sentry debug code is being stripped. `tracesSampleRate` is 0 and the
tracing code still ships for the same reason.

**Item 2, zod, is an investigation not a fix.** `pnpm why zod` traces it to
`better-auth`, which depends on it directly and is loaded on every route for the
session. Only five client components import zod or `@matops/validators`
themselves. So this is not a matops import to delete, and it needs a real look
before anyone touches it. Do not guess at it.

The poster case in item 3 is still real. `ScheduleScreen` is a two-tab component
that statically imports both tabs, so opening `/schedule` downloads the whole
canvas poster engine even for someone who only ever looks at "This week". The
same tab-with-static-imports pattern repeats in `coaches-screen.tsx` and
`members-screen.tsx`. It is simply worth tens of kB on two routes, not hundreds
on all of them.

**Gate.** The shared floor drops in `route-bundle-stats.json`, and First Load JS
drops on `/schedule` and `/coaches`. Build time is recorded too, because React
Compiler runs on Babel and will raise it.

**Items 3 and 4 shipped, and item 3 is smaller than this wave guessed.** ADR 90.
`poster-draw.ts` became an `import()` inside the `render()` that already only ran
on dialog open, and `qrcode.react` became `next/dynamic` at both call sites.
`/coaches` 425 → 420 kB, `/members` 430 → 426 kB, `/schedule` 431 → 428 kB gzip:
about **12 kB across three routes**, not the "tens of kB on two" written above.
`preload: false` on `Geist_Mono` changes no bytes and only frees a preload slot.

**Decision to settle.** ~~Whether React Compiler ships in this wave or its own.~~
**Settled: it ships in neither.** Built both ways on the same tree, it costs
**+10 to +16 kB gzip on all 18 routes** and takes build time from 8.6 s to
13.9 s. That gives back item 3's entire win three times over, on every route
rather than three. What it buys is fewer re-renders during interaction, which is
an INP number, and this app's measured bottleneck is the wait for Neon. Re-open
it only if an INP measurement on a real screen justifies 14 kB a route.

**Docs.** ADR 86 (item 1) and ADR 90 (items 3, 4, 5), roadmap row, CHANGELOG
line.

---

### Wave 2 — v4.4 · One freshness policy, both clients — **SHIPPED**, ADR [87](issues/87-one-freshness-policy.md)

**Shipped 2026-08-24 as v4.3, ADR 87.**

**Correction to why.** This wave was justified by trap 1 below: a prefetched
entry that hydrates stale refetches immediately and gains nothing. That does not
apply here. The global default was already **30 seconds, not 0**, which is far
longer than a page load, so a prefetched entry hydrates fresh. §3 finding 2
("there is no freshness policy... nothing else does") also overstated it: the
global default did apply everywhere; what was missing was any variation in it.

So this wave is **not** a prerequisite for wave 3, and wave 3 may start without
it. It was still worth shipping, for the two reasons it actually has: reference
data stops polling every 30 seconds for changes that cannot happen without an
invalidation, and the freshness decision now exists in one readable place
instead of being absent at 43 call sites.

**Work**

1. A `queryDefaults` table keyed by tRPC path prefix. Reference data
   (`payments.plans`, `class.templates`, `academy.*`) at 5 minutes. Stats at 2
   minutes. Badges at 60 seconds. Rosters and bookings keep the 30-second
   default.
2. Wire it into `createQueryClient` in `apps/nextjs/src/trpc/query-client.ts`.
3. Wire the same table into `apps/expo/src/utils/api.tsx`, replacing the
   hardcoded `staleTime: 30_000`.
4. Delete the two ad-hoc overrides in `app-shell.tsx:204,208`. They become
   entries in the table.

**Where the table lives.** `packages/domain`. It is pure framework-free data with
no I/O, which is what that package is for, and the project's stated thesis is
that both clients consume the same rules so they cannot drift. Wiring mobile
costs about five lines and stops the drift before it starts.

This is the deepening move in the arc. The freshness decision currently does not
exist at any call site. The fix puts it behind the QueryClient interface, where
it is one readable decision instead of a hundred absent ones, and screens stay
ignorant of caching.

**Gate, as written, tested nothing.** "The badge queries should stop refiring on
every navigation" was already true: the global 30 second default means no query
refires within 30 seconds of its last fetch, and nothing in either client
overrides `refetchOnMount` or `refetchOnWindowFocus`. The real gate is the unit
test over the table plus the two clients reading the same one.

**Docs.** ADR 87. No spec change: nothing user visible except fewer spinners.
Roadmap row, CHANGELOG line.

---

### Wave 3 — v4.5 · Every route prefetches on the server — **SHIPPED** as v4.4, ADR [88](issues/88-server-prefetch-and-the-clock-contract.md)

The biggest win, and the one with real design work in it.

**Why here.** Needs wave 2. ADR 81 built the `prefetch()` seam, proved it on the
layout, and stopped. The screens still pay the full post-hydration wave.

**The hard part comes first.** Trap 2. Three screens derive their query inputs
from the clock inside the client component, and those strings are the cache key.

**Work**

1. Move the window derivation into `@matops/domain` as pure functions taking an
   explicit clock. There is precedent: ADR [74](issues/74-web-shell-seams.md)
   already moved `dayKey` and `groupByDay` there. Unit tests first, per
   [delivery.md §5](delivery.md#5-the-per-slice-loop-what-a-build-session-actually-runs).
2. Settle the clock contract. Either round the window to a day boundary so both
   sides agree, or pass the server's timestamp down as a prop.
   **Recommendation: round to the day key.** It makes the key stable for a whole
   day, which also improves cache hits across navigations, and it removes the
   clock from the key rather than trying to synchronise two clocks.
3. Add `prefetch()` and `HydrateClient` to each of the twelve pages under
   `(app)/`.

**One thing that makes this better than it looks.** `trpc/server.tsx` uses
`createTRPCOptionsProxy` with a direct `ctx`, not HTTP. Server prefetches call
the router in process, in parallel, with **no `httpBatchLink` batching**. So this
wave also sidesteps the batch serialisation problem without touching the tenant
seam.

**Gate.** On a cold dashboard open, zero tRPC requests fire from the browser
after hydration. Measure TTFB and LCP against the wave 0 baseline.

**What actually shipped.** The contract is **UTC-day-snapped windows, local
display boundaries**, not the day-key rounding step 2 recommended. Same idea,
carried further: rounding to a day key still leaves the key clock-derived, and
two machines in different zones can disagree about which day it is. Snapping to
UTC removes the zone from the key entirely.

**Two corrections to this wave as written.** `my-classes-screen.tsx` has **no
clock in any query key** (`booking.mine` and `stats.me` take no input), so the
list of affected screens is three, not four. And "the page edits are four lines
each" held only for the dashboard: `schedule.tsx` and `student-screen.tsx`
render their window directly, so each needed a display filter as well, and those
filters are load bearing.

**Watch for.** A doubled request count means the key contract is wrong. That is
the single failure mode of this wave. It was checked by comparing each
dehydrated key in the HTML against the same window computed outside the app; all
three match. The browser-side count was **not** taken, because browser
automation was unavailable.

**Docs.** ADR 88, which is where the clock contract gets written down, because it
is the thing a future contributor will break. Roadmap row, CHANGELOG line.

---

### Wave 4 — v4.6 · Streaming, panel by panel — **SHIPPED** as v4.5, ADR [89](issues/89-streaming-the-panels.md)

**Why here.** Needs wave 3. There is currently zero `<Suspense>` in the app.

**The work was one word, not the two steps below.** Wave 3 wrote every call site
as `await Promise.all([prefetch(...), ...])`, so the server held the entire
document until the slowest of seven queries finished. Deleting the `await` is the
whole wave. `prefetch()` returns `void` again (the shape tRPC ships it in), the
queries dehydrate while still pending, and each panel's data streams in on its
own. The dashboard's page header now leaves the server at 125-135 ms instead of
630-741 ms, and the response is not one byte larger.

**Planned, and not done.**

1. ~~Wrap each independent panel in `<Suspense>` with its existing skeleton as
   the fallback.~~ Not needed. The screens already branch per panel on
   `isPending` and render exactly those skeletons. `<Suspense>` around a
   `useSuspenseQuery` would draw the same skeleton at the same moment, after
   splitting a 700-line client component into seven. It becomes load bearing in
   wave 5, where `cacheComponents` will not build without it, so it is paid for
   there.
2. ~~Reduce the route-level `loading.tsx` files to the shell only.~~ Left alone.
   With nothing awaited they no longer show on a cold open at all; they still
   cover client-side navigation, which is the job they were written for.

**What this fixes.** Today a route shows either the full skeleton or the full
page. The header and nav could paint at once. It also gives the 895 lines in
`skeletons.tsx` a real job as fallbacks, instead of being a parallel layout that
has to be kept in sync with the real one by hand.

**Interaction with ADR 80.** That ADR decided the mat loader covers the boot
case, because the answer is either the shell or the academy gate and they share
no chrome. That reasoning still holds and this wave does not touch it. It is why
the `(app)` layout is the one place that still awaits: streaming it too was
tried, and it made the whole document the mat loader with no page markup in the
HTML.

**Gate.** The page header paints before the panels. **Measured on the server, not
in a browser**: each chunk was timed off the socket. Browser automation was
unavailable again, so the Slow 3G run was not done.

**Docs.** ADR 89. It did **not** need [spec.md](spec.md) after all: the
placeholder a person sees is the same skeleton ADR 80 specified, it just arrives
sooner. Roadmap row, CHANGELOG line.

---

### Wave 5 — v4.7 · Static shells, then Cache Components — **SHIPPED**, ADR [91](issues/91-cache-components-and-the-static-shell.md)

Last, because it is the only real migration and it needs wave 4 to build at all.

**Be honest about the size of the prize.** This app is per-tenant data behind
RLS. Most of it should stay dynamic and PPR will not change that. The win is the
shell, and specifically three pages:

- `/checkin/[academyId]` and `/join/[token]` are the public landings a new
  student reaches from a printed QR poster, cold, on gym wifi. They are the first
  impression of the product and they currently boot the full dynamic path.
- `/privacy` already prerenders. Wave 0 measured `x-vercel-cache: PRERENDER`
  on it in production, with no function region in the `x-vercel-id`. It carries
  the shared client bundle like everything else, but it is not a dynamic render.
  This wave is two pages, not three.

**Work, in two separable steps**

1. Confirm from `next build` output which routes actually prerender today. Make
   the three public pages static shells, with the dynamic parts behind Suspense.
2. Only then, `cacheComponents: true`. It will not build without a Suspense
   boundary around every dynamic read, which is why wave 4 is the prerequisite.

**Gate.** The QR landing pages serve a static shell with a sub-100ms TTFB.
**Passed on a local production build** (4.8 ms and 4.3 ms), though that number
says less than it looks: neither page touches the database, so locally the gap to
the flag-off build is only about 3 ms. **The gate as written is not measurable
from Lisbon at all**, because even the already-static `/privacy` answers in
110-115 ms from here. The network floor is above the target.

**What it actually bought, measured.** Both landings prerender, so on Vercel they
skip the function invocation that made them 173-300 ms against `/privacy`'s
110-115 ms: an expected **70-170 ms of earlier first paint**, not yet confirmed
after a deploy. `/sign-in` and `/start` gained shells too, unplanned. **The twelve
authed routes gained nothing** and are marginally slower (first byte 38-49 →
55-72 ms), exactly as this section predicted.

**What it cost.** Sixteen files split into a page returning `<Suspense>` plus a
child that awaits; `HydrateClient` can never be prerendered because `dehydrate()`
stamps `Date.now()`, so `/training` carries an `await connection()` for the build
alone; both cron routes lost `runtime` / `dynamic` segment config (harmless);
and **`/sign-in` lost its server-side redirect**, which is the one user-visible
regression. Reverting is one line.

**Docs.** Its own ADR. It changes the rendering contract for the whole app, so
per [delivery.md §7](delivery.md#7-two-guardrails) this is a new decision record,
not an amendment to an old one.

---

### Wave 6 (optional, and not frontend) — one transaction per batch

ADR 81 named this as deliberately not done and called it the largest single win
left. Ten procedures in one HTTP batch open ten transactions and pay the 179ms
setup ten times.

**Wave 0 measured this and the premise does not hold.** Batch 2 above carries
five procedures and completes in 238 ms. Five serial transaction setups at
179 ms would be 895 ms before a single row is read. So the procedures in a batch
run **concurrently** on the server, not one after another. The ten transactions
cost ten pool connections out of 20, not ten times the latency. Whatever wave 6
is worth, it is not the wall-clock number ADR 81 implied.

Two more things to know. Wave 3 moves that cost **off the critical path** but does not
remove it. And the change touches the tenant seam (ADR
[12](issues/12-tenant-isolation-mechanism.md)) and the `baseDb` injection point
(ADR [60](issues/60-backend-review-fixes.md)), so it needs its own ADR and its
own tests.

**Recommendation: leave it parked, and now with a stronger reason.** The
concurrency measurement above removes the headline number that justified it.
Revisit only if wave 3 leaves a measured problem behind.

---

## 6. Sizing

| Wave               | Size                                              | Risk                                       |
| ------------------ | ------------------------------------------------- | ------------------------------------------ |
| 0 baseline         | half a day, mostly dashboard checks               | none                                       |
| 1 bundle           | half a day                                        | low, each change reverts alone             |
| 2 freshness policy | one day, touches both clients                     | low                                        |
| 3 server prefetch  | two to three days, the clock contract is the work | **medium**, wrong keys double the requests |
| 4 streaming        | one to two days                                   | low                                        |
| 5 static shells    | two days, a real migration                        | medium                                     |

---

## 7. Open decisions

Settle these before the wave that needs them starts.

| #   | Decision                                                                                     | Needed by    | Recommendation                                                                                |
| --- | -------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------- |
| 1   | Does the freshness table live in `packages/domain` and serve both clients, or stay web only? | Wave 2       | Shared. It is pure data, and the project's rule is that the clients cannot drift.             |
| 2   | Clock contract: round query windows to the day key, or pass the server timestamp down?       | Wave 3       | Round to the day key. It removes the clock from the key instead of synchronising two of them. |
| 3   | Does React Compiler ship inside wave 1 or as its own wave?                                   | Wave 1       | Inside wave 1, as a separate commit so it reverts alone.                                      |
| 4   | Is wave 6 in scope at all?                                                                   | After wave 3 | Decide on the wave 3 numbers, not before.                                                     |

---

## 8. Per-wave Definition of Done

Every wave, without exception, per [delivery.md §4](delivery.md#4-definition-of-done-the-anti-drift-gate):

1. Code merged, `pnpm lint` and `pnpm typecheck` clean.
2. Tests for any new pure rule in `packages/domain`. Hand the run command over,
   do not run suites mid-session.
3. `next build` run, and the route table in ADR 85 updated with this wave's
   column.
4. [spec.md](spec.md) updated if user-visible behaviour changed. Waves 4 and 5
   only.
5. [architecture.md](architecture.md) updated, and the wave's ADR written.
6. The roadmap row flipped and one line added to [CHANGELOG.md](../CHANGELOG.md).

A wave is not done until its numbers are in the table. That is the point of wave 0.
