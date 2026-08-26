# 91 — Cache Components: two pages win, sixteen files pay

**Status:** accepted, and the easiest thing in the arc to revert · **Date:** 2026-08-24 · **Area:** `apps/nextjs`. No migration, no dependency, no procedure changed. One config flag and sixteen files. **This changes the rendering contract for the whole app**, so per [delivery.md §7](../delivery.md#7-two-guardrails) it is its own decision record, not an amendment.

## Context

Wave 5 of the [frontend performance plan](../frontend-performance-plan.md), and
the last item in the arc. The plan was explicit about the size of the prize, and
it was right:

> This app is per-tenant data behind RLS. Most of it should stay dynamic and PPR
> will not change that. The win is the shell, and specifically [two] pages.

Those two are `/checkin/[academyId]` and `/join/[token]`, the landings a new
student reaches from a printed QR poster, cold, on gym wifi. Both booted the
full dynamic path to render a page that fetches nothing.

## Decision

`cacheComponents: true` in `next.config.js`. Every route now has a prerendered
static shell with its dynamic parts streamed behind `<Suspense>`.

This is the wave where `<Suspense>` finally earns its place. ADR
[89](89-streaming-the-panels.md) deliberately did not add boundaries, because the
screens' own `isPending` branches already drew the same skeletons. Under this
flag the build simply refuses without them.

### What the flag demands, and what that cost

**1. No page may read request data at its top level.** Sixteen files split into a
page component that returns a `<Suspense>` and a child that does the awaiting.
Mechanical, and the same shape everywhere:

```tsx
export default function MembersPage() {
  return (
    <Suspense fallback={<MembersSkeleton />}>
      <MembersData />
    </Suspense>
  );
}
```

The `(app)` layout got the same treatment, with `PageLoader` as its fallback,
which is the boot state ADR [80](80-loading-states.md) already specified.

**2. `dehydrate()` calls `Date.now()`.** So `HydrateClient` can never appear in a
prerendered shell, and every page carrying it must read request data first. Eleven
pages already did, through `currentAcademy()`, `params` or `getSession()`.
`/training` did not, and now carries `await connection()` whose only job is to
satisfy this. That is the one line in this change that exists for the framework
rather than for the product.

**3. Route segment config is banned.** `export const runtime` and
`export const dynamic` had to come off both cron routes. Verified harmless:
Next 16 already defaults route handlers to the Node runtime, a handler taking a
`NextRequest` is dynamic anyway, and `maxDuration = 60` is untouched. Both routes
still answer with their own `CRON_SECRET is not configured` guard under a
production build, exactly as ADR [46](46-no-scheduler-v1.md) specifies.

**4. `/sign-in` lost its server-side redirect.** A signed-in visitor used to be
redirected before anything rendered. A prerendered shell paints before the
session is known, so the redirect is now a post-paint client navigation and there
is a brief flash of the sign-in page. There is no way to keep both; a static
shell means painting before the session is read. It was accepted because almost
everyone who opens `/sign-in` is signed out and gets a faster page, and the
people who see the flash are the rare ones who type the URL while already signed
in. **This is the one user-visible regression in the change.**

### The fallbacks had to be corrected

The first pass filled every new boundary with a generic pulsing block. That
breaks ADR [80](80-loading-states.md), which [spec.md](../spec.md) §3 states as a
rule: the placeholder looks like what follows it, and where there is no screen to
imitate yet the basketweave mark weaves itself instead. It names "an invite
opening" as one of those places, which is exactly what `/join/[token]` is.

`/checkin/[academyId]`, `/join/[token]` and `/start` now render `<MatLoader>`
with a label. `/sign-in` keeps a `null` fallback, because its page is fully drawn
in the shell and only the redirect streams behind the boundary.

`spec.md` §3 is amended to say the frame of those pages now paints from the cache
ahead of the 180ms rule, and to record the `/sign-in` flash.

## Verification

Local production build (`next start`), warm, timing each chunk off the socket,
median of four. The same code was built both ways, so the only variable is the
flag.

**The public landings, which are the point:**

| Route | flag off | flag on |
|---|---:|---:|
| `/checkin/[academyId]` | 7.6 ms | **4.8 ms** |
| `/join/[token]` | 5.4 ms | **4.3 ms** |
| `/privacy` (already static, the floor) | 2.3 ms | 1.6 ms |

Locally that gap is small because neither page touches the database: their cost
is render, not data. **The real prize is on Vercel, and it is not measured here.**
In production these two routes answered in 173-300 ms while the already-static
`/privacy` answered in 110-115 ms from the same client. That difference is the
function invocation, and a prerendered shell is served from the CDN without one.
So the expected win is roughly **70-170 ms of earlier first paint** on the two QR
landings. The form itself still needs the function, so time-to-usable is
unchanged.

`/sign-in` and `/start` also gained static shells. That was not planned; it fell
out of making them comply.

**The twelve authed routes gained nothing, and this is the number that matters
for judging the change.** Dashboard, same build both ways, three warm runs:

| | flag off | flag on |
|---|---:|---:|
| First byte | 38-49 ms | 55-72 ms |
| Page header in the stream | 227-252 ms | 248-265 ms |
| Last byte | 731-752 ms | 738-764 ms |

The flag is marginally **slower** here, inside the noise. That is expected and it
is what the plan predicted. Their prerendered shell is the mat loader, which the
layout's `<Suspense>` boundary produces either way, and everything below it waits
on Neon.

**Everything still works.** All eleven authed routes render 200 with real data
against the live database on a production build. `/sign-in` and `/start` render
correctly signed out and signed in. `next build` green, `pnpm typecheck` 17/17,
`pnpm -F @matops/nextjs lint` clean, all 23 routes prerender.

## Consequences

- **Never read request data at the top level of a page.** Split the page into a
  `<Suspense>` and a child that awaits. The build enforces this, loudly.
- **Never add `export const dynamic` or `export const runtime`** to a route
  segment. The build refuses.
- **`HydrateClient` cannot be prerendered**, because `dehydrate()` stamps
  `Date.now()`. Any new page carrying it must read request data first.
- `/training`'s `await connection()` is load bearing for the build and nothing
  else. If that page ever gains a real request read, delete it.
- **How to revert, if the production number does not justify it.** Remove
  `cacheComponents: true`. Everything else in this change is valid without the
  flag: the sixteen split files build and behave identically, and the two cron
  routes do not need their segment config back. The only thing worth undoing
  alongside it is `/sign-in`, where restoring `await getSession()` at the top of
  the page brings the server-side redirect back.

## Not verified

**The production number.** Every figure above is from a local production build.
The 70-170 ms estimate for the QR landings is inferred from production TTFB on
`/privacy` versus the two dynamic routes, not measured after a deploy. Take that
measurement on the next deploy before treating this wave as paid for.

**Nothing was clicked.** Browser automation failed for the third session running
(`Tab not found`), so the streamed `/sign-in` redirect, the `/start` form swap and
the QR landing forms were checked by their rendered HTML and not in a browser.

---

**⚠ refined by [100](100-the-client-router-keeps-a-page-for-30-seconds.md)** (2026-08-26). This
note measured cold first-byte and never measured a navigation. Under the flag,
returning to an authed route was re-rendering the whole page on the server every
time, because Next 16 reuses no dynamic navigation at its default of
`staleTimes.dynamic: 0`. The static shell described above is why it was so
visible: for an authed route that shell is the mat loader and a skeleton, with
the sidebar and everything else inside the layout's dynamic hole. ADR 100 sets
`experimental.staleTimes: { dynamic: 30 }`. Reverting this note's flag now also
means deciding what to do with that line.
