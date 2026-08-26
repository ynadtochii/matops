# 85 — The dashboard paints when the data lands, not when the bundle parses

**Status:** accepted · **Date:** 2026-08-24 · **Area:** measurement only. No product code, no migration, no dependency. This is the umbrella note for the whole v4.x frontend arc; every later wave appends its column to the tables here.

## Context

ADR [81](81-api-latency.md) fixed the API tier and stopped there on purpose. The
client tier was never touched, and the plan in
[docs/frontend-performance-plan.md](../frontend-performance-plan.md) lays out six
waves to fix it. Wave 0 is this note: measure first, because ADR 81 shipped one
claim it could not check, and because five later waves each claim a number that
needs a before.

Two things had to be settled before anything else, and three tables had to exist.

## The two Vercel checks

**Fluid Compute is on.** The project API returns
`defaultResourceConfig: { fluid: true, ... }`, and the Functions settings page
shows the toggle enabled. Node 24.x, so optimized concurrency applies. Every
tRPC request spends most of its life waiting on Neon, and Fluid bills Active CPU
only while code actually runs, so the waiting is free. Nothing to change.

**The `fra1` pin is live.** ADR 81 called this inferred rather than measured. It
is now measured, through the custom domain, which is the only host that skips
this project's SSO deployment protection:

```
GET https://matops.grapplerscollective.com/sign-in
x-vercel-id: cdg1::fra1::hc58h-1787589188967-da8e0e77ca38
```

Edge in Paris, function in Frankfurt, next to Neon `eu-central-1`. The latest
production deployment carries `regions: ["fra1"]`.

**A trap this leaves behind.** The Vercel *project default* region is still
`iad1`. Only `apps/nextjs/vercel.json` moves it to `fra1`, which the dashboard
marks `Overridden`. Delete or rename that file and every function silently moves
to Virginia, paying a transatlantic round trip per query with nothing failing.

**Correction to the method.** The plan originally said to read the region from
the `[TRPC]` timing lines ADR 81 left in `packages/api/src/trpc.ts:143`. Those
print a duration and nothing else, so they cannot show a region. `x-vercel-id`
can.

## Method

**Bundle sizes.** Next 16 removed the size columns from `next build` output.
First Load JS now lives in `.next/diagnostics/route-bundle-stats.json`, which
lists each route's first-load chunk paths and their uncompressed total. Gzip
numbers below are each chunk gzipped at level 6 and summed. Every wave gate in
the plan that said "the `next build` table" means this file.

**Runtime.** Production, signed in as the owner of the Alma beta demo academy,
Chrome from Lisbon, warm HTTP cache. Numbers come from the Navigation Timing and
Resource Timing entries and a buffered `largest-contentful-paint` observer. The
warm cache is deliberate: it isolates the server and query cost from the
first-ever download, which is the cost the later waves target.

## The baseline, 2026-08-24, commit `0243e23`

`next build` green in 10.5s.

| Route | raw | gzip |
|---|---:|---:|
| `/schedule` | 1571 kB | 453 kB | 428 kB | 429 kB |
| `/members` | 1567 kB | 453 kB | 426 kB | 426 kB |
| `/` (dashboard) | 1555 kB | 448 kB | 426 kB | 426 kB |
| `/coaches` | 1551 kB | 448 kB | 420 kB | 421 kB |
| `/payments` | 1545 kB | 444 kB | 421 kB | 422 kB |
| `/settings` | 1536 kB | 444 kB | 421 kB | 422 kB |
| `/attendance` | 1525 kB | 441 kB | 418 kB | 419 kB |
| `/referrals` | 1525 kB | 440 kB | 417 kB | 418 kB |
| `/class/[id]` | 1522 kB | 439 kB | 416 kB | 417 kB |
| `/profile` | 1519 kB | 438 kB | 415 kB | 416 kB |
| `/notifications` | 1517 kB | 438 kB | 415 kB | 416 kB |
| `/training` | 1512 kB | 436 kB | 413 kB | 414 kB |
| `/join/[token]` | 1445 kB | 415 kB | 393 kB | 394 kB |
| `/checkin/[academyId]` | 1441 kB | 414 kB | 392 kB | 393 kB |
| `/sign-in` | 1428 kB | 410 kB | 388 kB | 389 kB |
| `/start` | 1428 kB | 410 kB | 388 kB | 389 kB |
| `/privacy` | 1423 kB | 408 kB | 386 kB | 387 kB |
| `/_not-found` | 1419 kB | 406 kB | 384 kB | 385 kB |
Runtime, two samples of a dashboard open:

| Metric | sample 1 | sample 2 |
|---|---:|---:|
| TTFB | 34 ms | 40 ms |
| Document `responseEnd` | 471 ms | 257 ms |
| First Contentful Paint | 628 ms | 416 ms |
| Largest Contentful Paint | 996 ms | 740 ms |
| DOMContentLoaded | 514 ms | 276 ms |
| `load` | 691 ms | 472 ms |
| tRPC HTTP batches after hydration | 2 | 2 |
| tRPC procedures after hydration | 8 | 8 |
| First tRPC starts | 598 ms | 358 ms |
| All data in | 953 ms | 687 ms |

The two batches, from sample 2:

| Batch | starts | takes | procedures |
|---|---:|---:|---|
| 1 | 358 ms | 135 ms | `membership.members`, `payments.claims`, `notification.unreadCount` |
| 2 | 449 ms | 238 ms | `class.week`, `dropIn.list`, `stats.gym`, `stats.drifting`, `stats.revenue` |

## Per-wave columns

First Load JS, gzip, appended as each wave ships. Read from
`.next/diagnostics/route-bundle-stats.json`, gzipping each listed chunk.

| Route | baseline `0243e23` | v4.5 | v4.6 | v4.7 |
|---|---:|---:|---:|---:|
| `/schedule` | 453 kB | 431 kB | 428 kB | 429 kB |
| `/members` | 453 kB | 430 kB | 426 kB | 426 kB |
| `/` (dashboard) | 448 kB | 425 kB | 426 kB | 426 kB |
| `/coaches` | 448 kB | 425 kB | 420 kB | 421 kB |
| `/payments` | 444 kB | 421 kB | 421 kB | 422 kB |
| `/settings` | 444 kB | 421 kB | 421 kB | 422 kB |
| `/attendance` | 441 kB | 418 kB | 418 kB | 419 kB |
| `/referrals` | 440 kB | 417 kB | 417 kB | 418 kB |
| `/class/[id]` | 439 kB | 416 kB | 416 kB | 417 kB |
| `/profile` | 438 kB | 415 kB | 415 kB | 416 kB |
| `/notifications` | 438 kB | 414 kB | 415 kB | 416 kB |
| `/training` | 436 kB | 413 kB | 413 kB | 414 kB |
| `/join/[token]` | 415 kB | 393 kB | 393 kB | 394 kB |
| `/checkin/[academyId]` | 414 kB | 392 kB | 392 kB | 393 kB |
| `/sign-in` | 410 kB | 388 kB | 388 kB | 389 kB |
| `/start` | 410 kB | 387 kB | 388 kB | 389 kB |
| `/privacy` | 408 kB | 386 kB | 386 kB | 387 kB |
| `/_not-found` | 406 kB | 384 kB | 384 kB | 385 kB |

Most of the 22 kB is v4.2's Sentry Replay move (ADR
[86](86-sentry-replay-out-of-the-entry-bundle.md)). v4.3, v4.4 and v4.5 shipped
no client code, which is why that column is flat across three waves.

**v4.6** (ADR [90](90-cheap-bundle-wins-and-one-measured-no.md)) is the lazy
poster and QR imports: `/coaches` -5 kB, `/members` -4 kB, `/schedule` -3 kB, and
noise elsewhere. **v4.7** (ADR
[91](91-cache-components-and-the-static-shell.md)) adds about 1 kB a route, which
is the runtime cost of Cache Components, paid everywhere so that two public pages
can prerender. Both are real and both are small; the arc's bundle column moved
453 → 429 kB on its heaviest route, and none of it was ever the thing keeping the
dashboard waiting.

**The runtime table has no wave column.** Every metric in it (FCP, LCP,
requests after hydration) needs a browser, and browser automation has been
unavailable since the baseline was taken. v4.4 and v4.5 measured what could be
measured without one: the dehydrated query keys (ADR
[88](88-server-prefetch-and-the-clock-contract.md)) and the arrival time of each
chunk off the socket (ADR [89](89-streaming-the-panels.md)).

## Decision

Record four findings, and let them reorder the plan rather than following it as
written.

### 1. LCP is data-bound, not bundle-bound

LCP lands at 740 ms with all data in at 687 ms, and at 996 ms with all data in
at 953 ms. Both times the page paints roughly 50 ms after the last query
resolves. The bundle finishes parsing long before that.

This is the single most useful number in the arc. It says wave 3, server
prefetch, is where the win is, and it caps what any bundle work can ever be
worth. Bundle waves are worth doing when they are free. They are not worth
spending the arc on.

### 2. TTFB is already good, so no wave may claim it

34-40 ms, because Next streams the RSC shell before the data is ready. Any gate
phrased as "TTFB improves" is measuring something that is not the problem. Later
waves gate on document `responseEnd` and LCP instead.

### 3. The shared bundle is the bundle

16 chunks totalling 1419 kB are shared by all 18 routes. The entire spread from
the lightest route to the heaviest is 152 kB. Per-route dynamic imports cannot
reach 91% of the weight.

Fingerprinting the shared chunks:

| Chunk | raw | Contents |
|---|---:|---|
| `2w6smg0wxlt24.js` | 536 kB | Sentry |
| `02ijvc-wqbcvl.js` | 292 kB | zod |
| `29yfx0d5cn64j.js` | 131 kB | Radix |
| `022n7bcr5aa8a.js` | 110 kB | React scheduler |
| `3vt5fsmsbn-4b.js` | 83 kB | tRPC + superjson |

Sentry plus zod is 828 kB, 58% of the floor, on every route including static
`/privacy`. This reorders wave 1, which had planned to start with a canvas
poster and a QR component. See ADR 86.

### 4. Procedures inside one tRPC batch run concurrently

ADR 81 named "one transaction per procedure per batch" as the largest single win
left, on the grounds that ten batched procedures pay the 179 ms transaction
setup ten times. Batch 2 above carries five procedures and completes in 238 ms.
Five serial setups would be 895 ms before a single row is read.

So they run concurrently. The ten transactions cost ten connections out of a
pool of 20, not ten times the latency. Whatever the batch-transaction change is
worth, it is not the wall-clock number ADR 81 implied, and the plan's wave 6
stays parked for a measured reason rather than a guess.

### Confirmed working, so nobody redoes it

`academy.current` and `academy.memberships` appear in neither batch. ADR 81's
layout prefetch runs in production. Wave 3 extends a seam that already works.

## Consequences

- Every later wave in the arc appends a column to the two tables above rather
  than inventing its own numbers. A wave is not done until its numbers are here.
- The plan document's wave 0 and wave 1 sections were rewritten to match these
  findings, and its wave 5 claim that `/privacy` is dynamic was corrected:
  production returns `x-vercel-cache: PRERENDER` for it today.
- Regenerate the bundle table by reading `route-bundle-stats.json` and gzipping
  each listed chunk. Do not read `next build` output for sizes; it no longer
  prints them.

## Not done here

- Throttled and cold-cache runs. Both samples are warm-cache from one location.
  Two samples is thin, and the gap between them is a cold versus warm function
  instance. Good enough to rank the waves, not good enough to defend a 10 ms
  delta.
- The `[TRPC]` per-procedure server timings for a cold open. They live in Vercel
  runtime logs and need a live tail during the open. The client-side batch
  timings above cover what the waves actually gate on.
