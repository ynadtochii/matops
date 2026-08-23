# 83 — A streamed tRPC response cannot carry a cookie

**Status:** accepted · **Date:** 2026-08-23 · **Area:** `apps/nextjs/src/trpc/react.tsx` (one link swap). No migration, no procedure change. · **Fixes:** the endless "Opening your gym…" spinner · **Amends:** [81](81-api-latency.md)

## The report

Sign in with Google from a student join link, land on the post-login gate, and
the page sits on "Opening Alma beta…" forever. It comes back on its own a few
minutes later.

## What the evidence said

The database had already done the work. One minute after the Google sign-in the
user's session row carried `active_organization_id = seed_org_alma`, so
`academy.setActive` had reached its write and returned. Sentry had no error for
that path, so the mutation did not throw. Yet the client kept reading "no active
academy" from `academy.current`.

Only one thing can make the server answer that while the row says otherwise: the
five-minute session cookie cache from ADR [81](81-api-latency.md). `getSession`
answers from the signed `better-auth.session_data` cookie without touching
Postgres, so a session cookie written before the switch keeps saying "no active
academy" until it expires. That is the five minutes the page waits.

ADR 81 said switching academy was safe because Better Auth re-signs the cookie
on `/organization/set-active` and `nextCookies()` copies that `Set-Cookie` onto
the tRPC response. Half of that is true. Replaying the call against the dev
server, twice, one header apart:

```
POST /api/trpc/academy.setActive                          → set-cookie: better-auth.session_data=…
                                                            set-cookie: better-auth.session_token=…
POST /api/trpc/academy.setActive  (trpc-accept: application/jsonl)
                                                          → transfer-encoding: chunked, NO set-cookie
```

The second call is what the browser sends. Both wrote the row. Only the first
told the browser about it.

## The cause

The web client used `httpBatchStreamLink`. A streamed response returns its
`Response` object, and therefore its headers, as soon as the stream opens,
before the resolvers finish. `nextCookies()` sets its cookie during the
resolver, through `next/headers`, which is too late: the headers are already on
the wire. Next drops the write silently, so nothing errors and nothing is
logged.

Before ADR 81 this was invisible. Every request re-read the session from
Postgres, so a lost cookie cost nothing. The cookie cache made that lost cookie
the source of truth for five minutes.

The same hole sits under every write that re-signs the session cookie, not just
this one: `academy.create` ("Start a gym"), `membership.join`, and
`account.updateProfile` all call `refreshSessionCookie`, and through the
streaming link that call was a no-op. The owner who creates a gym, and the
student who joins one, were both riding on the join mutation's other effects.

## Decision

The web tRPC client uses `httpBatchLink`. The response is buffered, so the
headers are written after the resolvers run and the `Set-Cookie` survives.

What that costs: batched queries no longer resolve progressively. A batch waits
for its slowest member. The payloads here are small JSON and the shell fires at
most a handful at once, so the trade is a fraction of the 90 ms per request the
cookie cache buys back. Expo already used `httpBatchLink`, which is why the
phone never showed this.

## The rule this leaves behind

**A response that streams cannot set a cookie.** Any future switch back to a
streaming link takes the session cookie cache with it, or ADR 81's
`refreshSessionCookie` repair silently stops working again.

## Not fixed here

The gate itself is still all-or-nothing: `OpenActive` fires `setActive` once, and
any failure leaves a spinner with no retry and no error state. A toast is the
only signal. An error state with a Retry button is worth doing, as its own slice.
