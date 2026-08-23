# 81 — Every page load paid the Frankfurt round trip forty times

**Status:** accepted · **Date:** 2026-08-23 · **Area:** `packages/api`, `packages/auth`, `packages/db`, `apps/nextjs`. No migration, no new dependency, nothing a member can see.

## Context

"Loading data from the API feels slow", on a 663/204 Mbps line with no
throttling. Bandwidth was never the problem. A probe against the live Neon
pooler (`eu-central-1`, run from Lisbon) measured:

```
cold connect (TLS + auth + pooler):  605 ms
warm SELECT 1:                        45 ms   (median of 8, 44-47)
BEGIN + SET ROLE + set_config + COMMIT: 179 ms
```

45 ms is the floor for one statement. The dashboard sends about forty of them.

Per tRPC procedure, before the resolver reads a single row:

| Step | Round trips | Cost |
|---|---|---|
| `getSession()` (once per HTTP request) | 2 | 90 ms |
| `getMembership()` | 1 | 45 ms |
| `withTenant`: BEGIN, SET LOCAL ROLE, set_config, COMMIT | 4 | 179 ms |
| the resolver's own query | 1 | 45 ms |

On top of that the dashboard loads in three waves, each blocking the next: the
RSC layout awaits the session, then `AppShell` awaits `academy.current` +
`academy.memberships` and renders no children until both land, then the page
mounts and fires ten more queries at once — exactly the `pg` pool default of 10,
so any eleventh caller waits 300 ms for a fresh TLS handshake.

In dev, every procedure also slept a random 100-500 ms. That is inherited
create-t3-turbo boilerplate, meant to expose waterfalls; on a ten-query page it
just hides them behind noise.

None of this is bad code. It is a correct design paying its fixed cost many
times per page. Resolvers are one query each, the indexes cover every hot path,
and there is no N+1. So the fix is to pay the fixed cost fewer times, not to
rewrite the layers.

## Decision

Six changes, none of them structural.

### The dev sleep goes

`packages/api/src/trpc.ts`. Four lines deleted. The timing log stays, because it
is how the next person measures this.

### The session is cached in its own cookie

`session: { cookieCache: { enabled: true, maxAge: 5 * 60 } }` in
`packages/auth/src/index.ts`. Better Auth signs the session + user rows into the
cookie, so a request inside the window costs zero queries instead of two.

**The tradeoff, stated plainly: a revoked session stays valid for up to five
minutes.** What that does and does not cover here:

- **Role and status changes are unaffected.** The tenant tier reads the `member`
  row live on every call (`getMembership`), so approving, suspending or removing
  someone still takes effect on their next request.
- **Switching academy is unaffected**, but only because Better Auth's
  `/organization/set-active` calls `setSessionCookie` after it updates the row,
  and the `nextCookies()` plugin copies that `Set-Cookie` onto the tRPC
  response. Without that the switcher would appear stuck for five minutes. If a
  future Better Auth drops either half, this cache has to go with it.
  **Correction, ADR [83](83-streamed-responses-drop-set-cookie.md):** the second
  half was not true. The web client streamed its responses, and a streamed
  response sends its headers before the resolver runs, so that `Set-Cookie` was
  dropped and the switcher did appear stuck for five minutes. Fixed by moving the
  client to `httpBatchLink`. The same hole made `refreshSessionCookie` below a
  no-op.
- **Sign-out is unaffected** — it clears the cookie.

What is left is an admin-revoked session outliving its revocation by up to five
minutes. For a pilot with a few academies that is the right trade for removing
90 ms from every single call.

**The trap, found in review: a write that changes the `user` or `session` row
behind Better Auth's back is invisible until the cookie expires.** Three of ours
do it.

- `createOrganization` sets `activeOrganizationId` on the session row and never
  re-signs the cookie. Only `/organization/set-active` does. So "Start a gym"
  would have left the new owner reading a cookie that still says no active
  academy, and every tenant procedure would answer `No active academy selected`
  for five minutes. This is the whole owner onboarding path.
- `account.updateProfile` and the join flow write the `user` row through
  `updateUserProfile`, so a rename showed the old name in the sidebar and on the
  profile page until the cookie expired. The phone app already passed
  `disableCookieCache` on its own refetch; the web read the name from the RSC
  session and had no way to ask for a fresh one.

`refreshSessionCookie(ctx)` in `packages/api/src/trpc.ts` is the repair, called
by all three. It runs `getSession` with `disableCookieCache: true`, which forces
the database read and makes Better Auth rewrite the cookie with the fresh copy.
It only works from a mutation, because `nextCookies()` can apply a `Set-Cookie`
in a route handler and silently drops it in an RSC render.

**The rule for anyone adding a write:** if it touches `user` or `session`
directly rather than through a Better Auth endpoint that already re-signs the
cookie, call `refreshSessionCookie` after it.

### Functions run in Frankfurt

`apps/nextjs/vercel.json` gained `"regions": ["fra1"]`. It held only a `$schema`
key, so every function defaulted to `iad1` (Washington DC) while the database
sits in `eu-central-1`. That is the full transatlantic round trip on each of the
forty statements. **Not measured** — inferred from the empty config plus the
known Vercel default, so confirm it on the next deploy from the `[TRPC]` timing
lines, and confirm the plan allows region pinning.

### The tenant transaction sets both values in one statement

`packages/db/src/tenant.ts` sent `SET LOCAL ROLE` and `set_config` as two round
trips. `SET LOCAL ROLE x` is defined as `SET LOCAL role = x`, so the role is a
plain GUC and goes through `set_config` like the academy id does:

```sql
SELECT set_config('app.academy_id', $1, true), set_config('role', $2, true)
```

One round trip instead of two, so 45 ms off every procedure. It also removes the
last interpolated identifier from the seam: both values are bound parameters
now, and the regex guard on `APP_ROLE` stops being load-bearing (it stays, since
the constant is still exported and interpolated by nothing else).

`packages/db/test/tenant.test.ts` is new and is the first test that runs the real
`withTenant` rather than hand-copying it: role and GUC set inside, both gone
after COMMIT. Every existing RLS test mirrors the seam by hand, which is exactly
how a change here could have slipped through.

### The shell's two queries start on the server

`apps/nextjs/src/app/(app)/layout.tsx` prefetches `academy.current` and
`academy.memberships` and wraps the shell in `HydrateClient`. `prefetch()` was
defined in `apps/nextjs/src/trpc/server.tsx` and never called anywhere in the
app; all data was fetched from the browser after hydration.

The layout already has the session, so those two queries begin on the server
while the HTML streams, instead of after the browser parses, hydrates and asks.
The queries are dehydrated while still pending (`shouldDehydrateQuery` already
allows that), so nothing blocks the HTML. `AppShell` keeps its `useQuery` calls
untouched and finds the answers already in the cache. That collapses wave 2 into
wave 1 without touching the loader decision in ADR
[80](80-loading-states.md) — the mat loader still covers the case where the
academy genuinely is not resolved yet.

### The pool and the stale time

`max: 20, keepAlive: true, idleTimeoutMillis: 60_000` in
`packages/db/src/client.ts`, so a ten-query page no longer sits exactly on the
pool ceiling. **Watch this one on Vercel**: each function instance holds its own
pool, so 20 multiplies across a scale-out and Neon's pooled endpoint has its own
connection limit.

`academy.current` and `academy.memberships` get a 5-minute `staleTime` at their
call site in `app-shell.tsx`, against the global 30 s default. An academy's name
and the list you belong to do not change on a 30-second cycle.

## What was deliberately not done

- **One transaction per HTTP batch.** Ten procedures in one batch open ten
  transactions and ten pool checkouts, paying the 179 ms setup ten times.
  Sharing one would be the largest single win left. It is also a real change to
  the tenant seam ([12](12-tenant-isolation-mechanism.md)) and the `baseDb`
  injection point ([60](60-backend-review-fixes.md)), and it needs its own note.
- **Neon autosuspend.** The 605 ms cold connect is partly the compute waking
  after ~5 minutes idle. It explains why the first request after a break is the
  worst one. Not a code fix.

## Consequences

- A revoked session can outlive its revocation by five minutes. Written down
  here because nothing in the UI will ever show it.
- The region pin is a production-only change and is unverified until the next
  deploy. If the plan refuses it, delete the key — nothing else depends on it.
- `pnpm test` gains `packages/db/test/tenant.test.ts`. Nothing else changes
  behavior a test could see.
