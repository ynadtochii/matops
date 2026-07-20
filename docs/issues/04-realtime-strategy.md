# 04 — Real-time / reactivity strategy (post-Convex)

Type: research
Status: resolved
Blocked by: —

## Question

Dropping Convex loses its killer feature: **live-updating queries** (the old app's schedule/bookings updated reactively for free). What replaces it in a portable Postgres stack — and **is any of it needed for the MVP at all?**

Two questions, in order:
1. **Does the standard-scope MVP actually need live updates?** Where would staleness hurt — a class filling to capacity while a student is on the booking screen; an instructor's attendance sheet; the owner's live schedule? Or is request-time freshness + refetch-on-focus enough for v1?
2. **If some live behavior is warranted, what's the portable mechanism?** Research the 2026 options and their lock/ops tradeoffs: plain **polling / refetch-on-focus** (e.g. TanStack Query), **SSE**, **WebSockets**, Postgres **LISTEN/NOTIFY**-backed push, or sync engines like **ElectricSQL / PowerSync / Zero** (evaluate vendor-lock and maturity carefully — some reintroduce the very lock we're avoiding).

Output: a recommendation on how much real-time to build for MVP and the specific mechanism (or an explicit "polling is enough for v1, here's the upgrade path"), with the portability tradeoff of each option noted.

## Answer

**v1 does NOT need persistent real-time.** Full report: [research/realtime-strategy.md](../research/realtime-strategy.md).

- **Part 1 — verdict:** The only thing that must be *correct* is class capacity, and that's a **server-side transactional-integrity** problem, not a UI-realtime one: enforce with a DB transaction (row lock or atomic conditional insert) + a `bookings` unique constraint; booking is optimistic-with-graceful-failure (loser gets a "class just filled" toast). Attendance sheet (one instructor/device) and owner schedule (a dashboard) are display-freshness concerns covered by refetch-on-focus + light polling. Convex's reactive queries were a free perk nothing in scope depends on.
- **v1 mechanism:** **TanStack Query** on both clients — short `staleTime`, `refetchOnWindowFocus`, ~30–60s `refetchInterval` on the three hot screens (booking, attendance, schedule). Zero new infra, zero lock, works web + Expo. Capacity stays transactional server-side.
- **Upgrade path (additive, still portable):** v1.5 — **SSE** endpoints (plain HTTP, degrades to polling; `react-native-event-source` on Expo) fed by Postgres **LISTEN/NOTIFY** (dedicated unpooled listener; notification carries an id → refetch). v2 — a sync engine only if offline-first/collab becomes a real goal.
- **Sync engines scrutiny (skip for v1):** Zero 1.0 is React-only (no RN → disqualified for mobile); PowerSync is source-available (FSL) + on-device SQLite + own conflict resolution; ElectricSQL has the best license (Apache 2.0) but version churn. All reintroduce framework-shaped commitment for real-time the MVP doesn't need.

## ⚠ Post-review note (session 8) — WebSockets/live-UI explicitly deferred
Re-examined after a "should we do real-time/push from day one?" question. Decision unchanged for v1, now with the reasoning made explicit:
- **Live in-app updates (WebSocket/SSE) stay OUT for v1.** Vercel serverless cannot hold an open connection, so true real-time needs either a paid vendor (breaks minimal-lock) or a separate always-on worker (extra service). Neither is warranted — polling keeps screens fresh and booking correctness is transactional, not UI-realtime.
- **Push notifications ARE in v1** (a different mechanism — Expo Push over HTTPS, no open connection) → see [17](17-class-cancellation-notification.md).
- **Upgrade pattern when live-UI is finally needed:** "serverless publishes, a worker subscribes" — add a small always-on Node worker (Fly/Railway) holding SSE/WS connections and listening to Postgres `LISTEN/NOTIFY`; tRPC mutations publish events to it. The main API does not move (kept extraction-ready in [15](15-api-deployment-shape.md)).
