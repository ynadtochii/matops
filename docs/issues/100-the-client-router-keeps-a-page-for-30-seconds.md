# 100 — The client router keeps a page for 30 seconds

**Status:** accepted · **Date:** 2026-08-26 · **Area:** `apps/nextjs`. One config line, no migration, no procedure changed. **Refines:** [91](91-cache-components-and-the-static-shell.md), [87](87-one-freshness-policy.md), [80](80-loading-states.md)

## Context

A bug report from the owner using the production deployment: clicking between
sidebar tabs redraws the whole screen every time, including a tab visited
seconds earlier. It reads as a page reload.

It is not a reload. It is a client-side navigation that keeps nothing, so the
skeleton comes back and the server renders the page again.

**This was never measured.** ADR [91](91-cache-components-and-the-static-shell.md)
timed cold first-byte on twelve authed routes. ADR
[89](89-streaming-the-panels.md) timed a page shell reaching the browser. Neither
timed the thing an owner does two hundred times a day: click a tab, then click
back.

## What was actually happening

Three things, and only the third is ours to set.

**1. The prerendered shell for an authed route is the mat loader and a
skeleton.** Checked against the live deployment, four routes:

| route       | shell | contains "Opening your academy" | contains the sidebar |
| ----------- | ----: | ------------------------------- | -------------------- |
| `/schedule` | 46 KB | yes                             | **no**               |
| `/members`  | 33 KB | yes                             | **no**               |
| `/payments` | 25 KB | yes                             | **no**               |
| `/coaches`  | 36 KB | yes                             | **no**               |

All four came back `x-nextjs-prerender: 1`, `x-vercel-cache: HIT`,
`x-nextjs-stale-time: 300`. So the CDN part works exactly as ADR 91 describes.
It is just that the whole app chrome sits inside the `(app)` layout's dynamic
hole, because `AuthedShell` awaits the session. The only thing that can be
painted from cache is the loader.

**2. Every page has a `loading.tsx`.** They predate the flag (they came with ADR
[80](80-loading-states.md)), so this is not a Cache Components regression. Their
effect is that the page you are looking at is replaced by a skeleton the instant
you click, rather than held until the next one is ready.

**3. Next 16 does not reuse a dynamic navigation, by default.** Two settings
decide it and both default off:

- `experimental.staleTimes.dynamic` defaults to **0**. This is the value the
  client BFCache checks on a forward navigation
  (`router-reducer/ppr-navigations.js`). At 0 the entry is stale the moment it
  is written, so it is never reused.
- `experimental.cachedNavigations` defaults to **false**.

So the second visit to a tab costs a full RSC request: `currentAcademy()` plus
every `prefetch()` on the page, which is three database queries for `/members`
and five for the dashboard, on top of the session read. The browser already held
all of it, fresh, in React Query. It could not use any of it, because
`MembersScreen` only mounts once the server payload lands.

## Decision

```js
experimental: { staleTimes: { dynamic: 30 } },
```

Revisit a tab inside 30 seconds and it renders from the client BFCache: no
skeleton, no RSC request, no database hit.

**This does not weaken freshness, it stops overriding it.** The client
components remount and re-check React Query's own per-path `staleTime`
(`packages/domain/src/freshness.ts`, ADR [87](87-one-freshness-policy.md)), which
is 30 seconds for anything a second person can change and longer for reference
data. The router was applying a stricter rule of its own on top, by accident,
which is exactly the drift ADR 87 exists to prevent. There is now one freshness
policy again, and 30 seconds matches its default deliberately.

A mutation is unaffected: `invalidatedBy()` (ADR
[98](98-fewer-round-trips-and-one-invalidation-rule.md)) still dirties the right
queries, and an invalidated query refetches on remount regardless of the router.

## Why not the other two options

**`experimental.cachedNavigations: true`** caches the dynamic holes themselves
rather than relying on the BFCache, and it is the larger win. It is available
here, since it requires `cacheComponents` and we have it. It is not taken yet
because it changes how every dynamic response is treated, days before a pilot,
for a problem one config value already fixes. Reach for it if 30 seconds proves
too short.

**Per-page `unstable_dynamicStaleTime`** gives a route its own number. Nothing
here needs a different one yet. If `/payments` or the dashboard ever needs to be
tighter than 30 seconds, this is the knob, not a global reduction.

## Verification

`next build` green with the flag set. Next's own config validation was read
first: `staleTimes` and `cacheComponents` have no conflict, and
`cachedNavigations` is the only one of the three gated on another flag.

## Not verified

**The production effect.** The mechanism is confirmed from the live deployment's
response headers and shell payloads, and from Next 16's own source. The
improvement itself has not been clicked, because browser automation failed again
this session (`Tab not found`), the same failure ADR 91 recorded. What to check
after the deploy: click Schedule → Members → Schedule and confirm the third click
paints instantly with no skeleton, and that the network tab shows no RSC request
for it.

**Nothing was measured for the first visit**, which is unchanged and still waits
on Neon. This fixes returning to a tab, not opening one.

## Consequences

- Data on screen can be up to 30 seconds behind on a revisit, which is the
  freshness budget ADR 87 already set for it. Do not add a route-level number
  without checking that table first.
- The `(app)` layout's dynamic hole holding the entire sidebar is still true and
  still costs a cold visitor the full loader. That is ADR 91's shape and is not
  addressed here.
