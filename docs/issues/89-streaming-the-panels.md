# 89 — A prefetch that is awaited is not a prefetch

**Status:** accepted · **Date:** 2026-08-24 · **Area:** `apps/nextjs`. No migration, no dependency, no procedure changed. One layout, twelve pages, one helper.

## Context

ADR [88](88-server-prefetch-and-the-clock-contract.md) put a `prefetch()` call on
every page under `(app)/`, so the data now leaves the server with the page
instead of being asked for after hydration. It also wrote every call site the
same way:

```ts
await Promise.all([
  prefetch(trpc.class.week.queryOptions(dashboardWeekWindow(new Date()))),
  prefetch(trpc.membership.members.queryOptions()),
  ...
]);
```

That `await` throws away most of the win. React cannot send a byte of the page
until the component returns, so the server holds the whole document until the
slowest of seven queries has finished. The browser gets one large response late
instead of a shell early. Measured on the dashboard, the page header markup left
the server at **630 to 741 ms**, which was also when the last byte left.

ADR [85](85-frontend-performance-baseline.md)'s finding was that LCP is
data-bound: it lands about 50 ms after the last query resolves. Awaiting the
prefetches keeps it that way, because nothing the browser needs (HTML, CSS, the
JavaScript bundle) can start downloading while the server waits on Neon.

## Decision

**`prefetch()` never blocks. A page awaits only what decides its shape.**

`prefetch()` in `apps/nextjs/src/trpc/server.tsx` returns `void` again, which is
the shape tRPC ships it in. ADR 81 had changed it to return the promise so the
layout could await it. Returning `void` puts the rule in the type: a call site
cannot await it even by accident, and `@typescript-eslint/no-floating-promises`
has nothing to complain about.

The queries then dehydrate while still **pending**. This is not a trick. The
QueryClient in `apps/nextjs/src/trpc/query-client.ts` has always carried

```ts
shouldDehydrateQuery: (query) =>
  defaultShouldDehydrateQuery(query) || query.state.status === "pending",
```

which is exactly the opt-in TanStack Query asks for. `dehydrate` puts the
in-flight promise into the payload, React streams it through the RSC flight
stream, and `hydrate` on the client rebuilds the query around that same promise
rather than starting a fetch. So the page still makes no browser request, and
each panel's data arrives on its own as its query finishes.

**One await stays, in the layout.** `app-shell.tsx:205` will not draw the shell
until both `academy.current` and `academy.memberships` have resolved, because the
answer is either the shell or the academy gate and they share no chrome. That is
ADR [80](80-loading-states.md)'s decision and this note does not touch it. It was
tried the other way and measured: with the layout streaming too, the whole
document is the mat loader and no page markup exists in the HTML at all. So the
layout awaits both, through `currentAcademy()` and a direct `fetchQuery`, and
everything below the shell streams.

Each page still awaits `currentAcademy()` to branch on role before choosing what
to prefetch (ADR 88's W.4). That is free: the layout has already resolved it on
the same request-cached QueryClient, and `academy.*` is fresh for five minutes
under ADR [87](87-one-freshness-policy.md)'s table.

## No `<Suspense>` boundary was added

The plan asked for one per panel, with the existing skeleton as the fallback.
It is not needed, and adding it would have been the larger change for the same
picture.

The screens are client components that already branch per panel:
`week.isPending ? <SkeletonDayRail/> : ...`, `insights.isPending ?
<SkeletonInsights/> : ...`, and so on. Those branches already are the
panel-level fallbacks. They render into the streamed HTML on the first flush and
each one swaps to real content when its own query lands. A `<Suspense>` boundary
around a `useSuspenseQuery` would draw the same skeleton at the same moment,
after rewriting a 700-line screen into seven child components.

`<Suspense>` becomes load bearing in the next wave, where `cacheComponents: true`
refuses to build without a boundary around every dynamic read. That is where it
should be paid for, because that is where it buys something.

## Verification

Dashboard of the Alma beta academy, dev server, `Accept-Encoding: identity`,
timing each chunk off the socket. Three runs each.

|                                        | awaited (v4.4) | streamed (v4.5) |
| -------------------------------------- | -------------: | --------------: |
| First byte                             |     125-206 ms |      125-200 ms |
| Page header markup in the stream       |     630-741 ms |  **125-135 ms** |
| Panel data (`stats.gym`) in the stream |     622-730 ms |      628-823 ms |
| Last byte                              |     630-741 ms |      625-823 ms |
| Bytes                                  |       202.0 kB |        201.1 kB |

The header arrives about **half a second earlier** and the response costs
nothing more. Total time is unchanged, which is the point: the browser now spends
that half second downloading and parsing the bundle instead of waiting.

Every other route shows the same shape. Shell markup, then the tail:

| Route            |  shell | last byte |
| ---------------- | -----: | --------: |
| `/schedule`      | 221 ms |    423 ms |
| `/members`       | 130 ms |    612 ms |
| `/payments`      | 201 ms |    681 ms |
| `/coaches`       | 135 ms |    702 ms |
| `/training`      | 139 ms |    355 ms |
| `/referrals`     | 129 ms |    547 ms |
| `/settings`      | 132 ms |    426 ms |
| `/attendance`    | 134 ms |    469 ms |
| `/notifications` | 131 ms |    436 ms |
| `/profile`       | 134 ms |    328 ms |

These are dev-server numbers against the live Neon database, so the absolute
values are not production. The gap between the two columns is the measurement.

## Consequences

- **Never `await` a `prefetch`.** The type prevents it now. If a page genuinely
  needs a value before it can render, that is `currentAcademy()` or a direct
  `getQueryClient().fetchQuery(...)`, and the reason belongs in a note.
- **A prefetch that fails behaves differently now.** ADR 88 relied on
  `prefetchQuery` swallowing errors, so a query the caller was not entitled to
  quietly degraded to a client fetch. That still holds for a query that fails
  fast, because an errored query is not dehydrated at all. A query that fails
  **slowly** is dehydrated pending, and the rejection now reaches the client, so
  the panel shows its `ErrorState` with a retry rather than refetching silently.
  The role branches on each page mean this should not fire in practice.
- **The screens' `isPending` branches are the loading contract.** Deleting one
  now leaves a panel blank during the stream instead of showing a skeleton.
- The dashboard's HTML still carries `academy.current` twice, once from the
  layout's `HydrateClient` and once from the page's. That predates this note and
  costs about a kilobyte.

## Not verified

**The browser gate is still uncounted.** ADR 88 left "on a cold dashboard open,
zero tRPC requests fire from the browser after hydration" unmeasured because
browser automation was unavailable. It was unavailable again for this slice
(`Tab not found` on every attempt), so the count is still not taken. This wave
makes it more worth taking, because the queries now hydrate from a pending
promise rather than from resolved data, which is a different code path in
`hydrate`. Reading that path, it reuses the streamed promise through
`initialPromise` and issues no request. That is still an inference.

**No new LCP number.** Same reason. ADR 85's runtime table has no v4.4 or v4.5
column.

## Addendum 2026-09-29: the `(app)` layout ships only `entity.list`

Production froze on the first open after Neon had scaled to zero. The tab stayed
on "Opening your gym" and then crashed (renderer "Code 5", out of memory).

Cause: the request has one query client. The `(app)` layout's `HydrateClient`
dehydrated all of it, so it also carried `academy.current`, which the
`[entityId]` layout had started in parallel. The server HTML drew `AppShell` with
that query pending (the loader). When the database was slow, the `(app)`
boundary hydrated late, after the streamed promise had resolved, so the client
drew the route instead. That is a hydration mismatch. Inside Next's `<Activity>`,
React 19.3 canary does not recover from it: it loops at `OffscreenLane` and never
commits. Reproduced locally with a 1.5 s delay on every pool connection.

Fix: `HydrateClient` takes `only`, and the `(app)` layout passes the
`entity.list` key, the one query it awaits. `AppShell` now always hydrates with
`academy.current` absent and fetches it in the same batch as
`stats.navigationSummary`. The route under `<main>` is therefore never
hydrated; the browser renders it after that request. Keep it that way: each
page's own `HydrateClient` still ships pending queries, so hydrating the route
would bring the same race back.

Verified on a production build (`next build` and `next start`) with the 1.5 s
pool delay and scripts held back so hydration ran late. Without the fix the tab
spun at 100% CPU and its heap grew about 50 MB a second to 1.7 GB. With it, the
dashboard rendered and the heap stayed near 10 MB. Cost: a warm hard load shows
the route at about 1.1 s instead of 0.4-0.9 s, because `academy.current` is now
one extra request after hydration.
