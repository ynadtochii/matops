# 87 — One freshness policy, read by both clients

**Status:** accepted · **Date:** 2026-08-24 · **Area:** `packages/domain`, `apps/nextjs`, `apps/expo`. No migration, no dependency, nothing a member can see except fewer spinners.

## Context

Two QueryClients each hardcoded the same 30 second `staleTime`, in
`apps/nextjs/src/trpc/query-client.ts` and `apps/expo/src/utils/api.tsx`, with
no link between them. Two call sites in `app-shell.tsx` overrode it to five
minutes for `academy.current` and `academy.memberships` through a local
`ACADEMY_STALE_TIME` constant. That was the entire freshness policy for 43
distinct query paths across two clients.

30 seconds is a reasonable default for a roster that another person can change
while you look at it. It is a poor default for a plan list, a template list, or
the academy's own name, none of which change unless a staff member edits them,
and every such edit already calls `invalidateQueries`. Those paths were being
refetched on a timer that could never find anything new.

**A correction to the plan.** [The plan](../frontend-performance-plan.md) framed
this wave around "trap 1": that a server prefetch is wasted if the client
hydrates and immediately finds the entry stale. That trap is real in general but
does not apply here, because the global default was already 30 seconds rather
than 0, which is comfortably longer than a page load. Its finding 2, that
"nothing else does", also overstated things: the global default did apply
everywhere. So this wave is not a prerequisite for wave 3 in the way the plan
claimed. It is worth doing on its own merits, which are the two below.

## Decision

A single table in `packages/domain/src/freshness.ts`, keyed by tRPC path, read
by both QueryClients.

```ts
staleTime: (query) => staleTimeForQueryKey(query.queryKey)
```

TanStack Query v5 accepts a function for `staleTime`, so this is one line per
client and no per-query registration. tRPC query keys are
`[[...path], { input, type }]`, so the path falls straight out of the key.

The table resolves in three steps: exact path, then namespace, then the default.

| Bucket | Stale for | Paths |
|---|---|---|
| Reference | 5 min | `academy.*`, `template.*`, `rank.*`, `invite.*`, plus `payments.plans`, `payments.planOptions`, `payments.getRequisites` |
| Stats | 2 min | `stats.*` |
| Badge counters | 1 min | `notification.unreadCount`, `payments.claims` |
| Default | 30 s | everything else: rosters, bookings, attendance, drop-ins, dues |

**Why the table lives in `packages/domain`.** It is pure data with no I/O, which
is what that package is for, and the project's rule is that both clients consume
the same rules so they cannot drift. Wiring mobile cost one import and one line.
The alternative, a web-only table, would have left the Expo app on a hardcoded
30 seconds and guaranteed the drift this note exists to prevent.

**Why namespace-first with path exceptions.** A new procedure added to
`academy` should inherit the academy policy without anyone remembering to add a
row. A new procedure in an unmapped namespace falls to the 30 second default,
which is the safe direction: too fresh costs a request, too stale shows someone
a wrong number.

**Why `membership.members` stays at the default.** It is both the Members screen
roster and the source of the pending-approvals badge. One cache entry serves
both. Making the roster staler to suit a badge is the wrong way round, so it
keeps 30 seconds and the badge rides along.

**Why the fall-through is defensive.** `staleTimeForQueryKey` returns the
default for any key that is not a tRPC key, rather than throwing. A QueryClient
default runs for every query in the app, including any a library registers, and
a crash there would take down the whole client.

## Consequences

- The two `staleTime` overrides and the `ACADEMY_STALE_TIME` constant are gone
  from `app-shell.tsx`. Freshness is no longer decided at call sites. A screen
  stays ignorant of caching, which is the deepening the plan described.
- To change how fresh something is, edit the table, not a component. The
  decision now exists in one readable place instead of being absent in 43.
- Reference data stops refetching every 30 seconds. On the dashboard this is a
  small win, because ADR [85](85-frontend-performance-baseline.md) measured LCP
  as data-bound on the *first* load, and this wave only affects later ones.
  Honest framing: this is a correctness-and-clarity change with a modest
  performance side effect, not a performance win on its own.
- `packages/domain/test/freshness.test.ts` covers each bucket, the path-beats-
  namespace precedence, the unknown-procedure default, and the non-tRPC key
  fall-through. Run with `pnpm -F @matops/domain test`.
