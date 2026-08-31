# 116 — Rate limiting and the cost ceiling

**Status:** accepted · **Date:** 2026-08-30 · **Area:** `packages/api` (`src/trpc.ts`), plus an operational step on Vercel that is not code. **Relates to:** [25](25-dropin-lead-form.md) (the first public write), [46](46-no-host-scheduler.md), [93](93-safety-pass-before-the-pilot.md), [115](115-public-booking-api-and-the-lead-path.md) (the REST surface and its six buckets).

## Context

The public surface is growing. It was three tRPC procedures behind the wall
poster; ADR 115 added four REST routes that a third party calls from a gym's own
website. The question this note answers is not "does a flood break the app". At
pilot size it does not. The question is what a flood **costs**, because the bill
is the part that has no ceiling.

## 1. What the existing limiters can and cannot do

Two in-memory limiters already existed, and ADR 115 added a third set of buckets
on the same `take()`. All of them are correct and all of them share one ceiling:
they run **inside** the serverless function.

By the time `take()` returns false we have already paid for the invocation and
its CPU time. A 429 we return ourselves is a 429 we paid for. Every in-code
option has this property, so no library changes it.

## 2. The cost claim that turned out to be false

The suspicion was that `createTRPCContext` calling `auth.api.getSession()` on
every request, before any middleware, let an unauthenticated flooder force a Neon
query per request with a forged session cookie.

**It does not.** Better Auth's `/get-session` starts with `getSignedCookie`,
which returns `null` for a missing cookie, `null` for a malformed one and `false`
for a bad signature, all before any adapter call. The handler's first line is
`if (!sessionCookieToken) return null`. Forging the signature needs `AUTH_SECRET`.

So an unauthenticated request costs zero database queries today. The lazy-session
refactor this would have justified is **not done**, and should not be done for
this reason. Recorded here so it is not re-proposed.

## 3. The edge is the only place a block is free

Vercel WAF rate limiting runs before the request reaches the function. Mitigated
traffic incurs no CDN request, no Fast Data Transfer and no invocation. Rules
take effect without a redeploy.

Limits that matter for us: Hobby gets **1 rate limit rule per project**, Pro gets 40. Both include 1M allowed requests a month and can bucket on IP or JA4 digest
only; custom headers are Enterprise. Windows run 10s to 10min. Counters are
**per region**, so a distributed flood can exceed a configured number.

Upstash, Arcjet and Unkey were all considered and rejected **for this purpose**.
Each is a competent limiter, and each runs in-function, so none of them prevents
the invocation charge that is the entire reason for the work. They would add a
bill and a network hop to solve a problem the free edge already solves.

One detail for whoever writes the rule: both clients use `httpBatchLink`, so a
batched call goes to `/api/trpc/dropIn.submit,invite.resolve`. A path condition
must use **contains**, not **equals**.

## 4. The decision

Two layers, each doing the job the other cannot.

**The edge owns the bill.** A WAF rate limit rule on `/api/trpc` and one on
`/api/public/v1`, keyed by IP, with a persistent deny so a tripped client is
blocked for a while and those blocks are also free. This is dashboard
configuration, not code. On Hobby there is one rule, so it has to be a single
broad ceiling rather than a per-route limit.

**The code owns the product rule.** `take()` stays. It is the only layer that can
express "5 drop-in submits per 10 minutes" or "3 bookings per phone per day",
which are business rules, not cost rules. The WAF cannot see a procedure name
inside a batched tRPC call reliably enough to be the only defence.

## 5. The unauthed surface carries a cap by construction

`publicProcedure` now includes `rateLimited(120, 60_000)`. The limit was opt-in
per call site, and `system.health` and `auth.getSession` had none. With more
public endpoints coming, the failure mode was a new procedure shipping with no
limit because its author forgot one.

`t` is private to `trpc.ts`, so `publicProcedure` is the only door onto the
unauthed tRPC surface. Putting the cap on the door makes the omission
unexpressible rather than merely discouraged.

120 a minute is deliberately generous: a gym's students share one wifi address,
so a whole room is one caller. It is a brake, not a product rule. A procedure
needing a real cap adds its own `rateLimited` on top, and the three that had one
are unchanged in behaviour, because the tighter cap still trips first.

Stacking two limiters on one procedure needed one fix: the bucket key now carries
the limit, so the default and the specific cap count in separate buckets. Sharing
one counter would have tripped the tighter cap early.

## 6. What is deliberately not done

- **No lazy session.** §2 says why.
- **No durable counter.** `take()` stays per-process. A cross-instance counter
  belongs in `@vercel/firewall`'s `checkRateLimit`, not Redis, because it reuses
  the WAF counter and adds no vendor. Reach for it when a limit must be keyed by
  academy or user rather than address. `rateLimited` grows one rule id when that
  day comes, and the seam gains its second adapter.
- **The REST handlers keep opt-in limits.** Every handler in
  `packages/api/src/public/index.ts` calls one today, but a fifth added later
  could forget, exactly the gap §5 closes for tRPC. Worth the same treatment; it
  was left alone here because that code landed in the same window as this note.
