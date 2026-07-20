# matops (rebuild of MAT) — Real-Time Strategy (v1 MVP)

**Ticket:** Does the standard-scope MVP need live updates? If so, which portable mechanism on a Postgres + Node stack?
**Date:** 2026-07-20
**Scope assumed:** recurring class schedule, book/cancel against capacity, member roster + approval, instructor attendance marking. Clients: Next.js owner web + Expo/React Native student app.

---

## Part 1 — Judgment: does v1 need real-time?

**Verdict: No true real-time (persistent push) for v1.** Request-time freshness + refetch-on-focus + light polling on the few hot screens is good enough. Build it that way and keep the door open for SSE later.

Reasoning, per the concrete staleness spots:

### 1. Class filling to capacity while a student is on the booking screen
This is the spot people reach for real-time to "fix" — but it's the wrong tool. The actual failure (two students taking the last spot, overfill) is a **server-side transactional-integrity problem, not a UI problem.** Solve it in the write path regardless of any realtime layer:

- Enforce capacity in a single DB transaction: `SELECT count(*) ... FOR UPDATE` on the class row, or an atomic conditional insert (`INSERT ... WHERE (SELECT count(*) ...) < capacity`), or a `bookings` unique constraint on `(class_id, slot_index)`. Reject the loser with a clear "class just filled" error.
- On the client, treat booking as **optimistic with graceful failure**: the button submits, the server is the arbiter, and a rejected booking rolls back the optimistic state with a toast. TanStack Query mutation `onError` rollback handles this.

Realtime would only make the *displayed* "3 spots left" count tick down live. For an academy class (capacity ~dozens, concurrency a handful), the window where a stale count matters is seconds and the cost of being wrong is a single friendly rejection — not a data-integrity bug. Not worth a push infrastructure.

### 2. Instructor's live attendance sheet
Single instructor marking their own class from one device is the common case. Cross-device concurrency (two people marking the same sheet) is rare in this domain. Refetch-on-focus + optimistic writes cover it. Only if the academy has multiple staff marking one large mat simultaneously does live sync add value — a v2 signal, not v1.

### 3. Owner's schedule view
A dashboard. Staleness of a few seconds-to-minutes is invisible to an owner glancing at the week. `refetchOnWindowFocus` + a modest `refetchInterval` (e.g. 30–60s while the tab is open) makes it feel live enough. No push needed.

**Bottom line:** The one thing that *must* be correct — capacity — is a transaction, not a subscription. Everything else is a freshness-of-display concern that polling + focus-refetch solves at a fraction of the ops cost. Convex's reactive queries were a genuinely nice free perk, but nothing in this scope *depends* on them. Ship without persistent real-time; add SSE to specific screens if/when a real complaint appears.

---

## Part 2 — Mechanism survey (Postgres + Node, mid-2026)

### Comparison table

| Mechanism | Portability / vendor-lock | Ops cost | Mobile (Expo/RN) | Maturity | Fit for matops v1 |
|---|---|---|---|---|---|
| **Polling / refetch** (TanStack Query `refetchInterval`, `refetchOnWindowFocus`) | Zero lock — client library over plain HTTP; swap freely | Lowest — no new infra, just your existing API | First-class; works web + RN (RN maps focus to `AppState`) | Extremely mature, ubiquitous | **Chosen for v1** |
| **Server-Sent Events (SSE)** | Zero lock — plain HTTP `text/event-stream`, passes proxies/CDNs, no upgrade handshake | Low — one long-lived HTTP route per client; watch concurrent-connection count | Web native; RN needs a polyfill (`react-native-event-source`) — EventSource is not built in | Mature protocol; simple to reason about; auto-reconnect built in | **v1.5 upgrade path** |
| **WebSockets** (raw / Socket.IO / managed pub-sub) | Raw = zero lock; Socket.IO adds a protocol; managed pub-sub (Pusher/Ably/etc.) = real lock | Higher — connection state, upgrade handshake, scaling/fan-out, sticky sessions | Web + RN both support WebSocket natively | Very mature, but more moving parts than SSE | Overkill — we don't need bidirectional |
| **Postgres LISTEN/NOTIFY push** | Zero lock — pure Postgres feature | Medium/high gotchas — needs a **dedicated unpooled** connection; silently breaks under PgBouncer transaction pooling; payload cap 8 KB (send an id, refetch); not durable (offline listener misses events); ceiling ~1k notify/s | N/A directly — it's a server-side trigger; must be fanned out to clients via SSE/WS | Mature Postgres primitive | Later, as the *source* feeding SSE fan-out |
| **ElectricSQL** (sync engine) | Apache 2.0, self-hostable, **read-path only** (writes go through your own API), syncs over HTTP via "Shapes"; works with React, RN/Expo, TanStack DB. Company now also markets "agents on sync" — core sync remains but roadmap attention is split | Medium — run/operate the Electric service beside Postgres | Yes (RN via Expo) | Improving but historically breaking changes between versions; positioning has shifted | Overkill for v1; revisit if we want true local-first |
| **PowerSync** | Client SDKs open; **server is source-available (FSL)** — Open Edition self-host is free, Cloud from ~$49/mo. Offline-first via client-side SQLite; you write conflict-resolution rules | Medium/high — service + sync buckets + SQLite on device | **Best-in-class** (React, RN, Flutter, Swift, Kotlin) | Most battle-tested of the three (production apps, millions of users) | Overkill for v1; strongest option *if* offline-first becomes a goal |
| **Zero (Rocicorp)** | Open source; cloud offering TBD; IndexedDB (web) storage | Medium | **React-only — no React Native / Expo yet.** Disqualifying for our mobile client | Hit **1.0 in June 2026**; still cautious community sentiment on production scale | Not viable — no RN support |

### On the local-first sync engines (the vendor-lock scrutiny you asked for)
The ticket's whole premise is *minimal vendor lock*. Two of the three engines undercut that or don't fit:

- **Zero** is the buzziest (1.0 shipped June 2026) but is **React-only with no React Native**, so it can't serve the Expo student app — hard out for matops.
- **PowerSync** has the best mobile story and is the most production-proven, but its **server is source-available (FSL), not OSS**, and its model forces an on-device SQLite + your own conflict-resolution logic. That's a heavy architecture to adopt for a CRUD academy admin app, and it trades Convex-lock for PowerSync-lock.
- **ElectricSQL** is the most philosophically aligned (Apache 2.0, self-hostable, read-path-only so your writes stay in your own Postgres/API). But it's had rockier version stability and the company is visibly redirecting energy toward an "agent platform" narrative. Adopting it now means betting on a moving target for a feature the MVP doesn't need.

All three reintroduce exactly the kind of framework-shaped commitment we left Convex to escape — a new runtime, a new data-flow model, and a new set of upgrade risks — in exchange for real-time we've already established v1 doesn't require. **Skip all three for v1.**

---

## Recommendation

**v1 (build now):** TanStack Query on both clients.
- `staleTime` short (a few seconds), `refetchOnWindowFocus: true`, and a `refetchInterval` (~30–60s) on the three hot screens: booking, instructor attendance, owner schedule.
- Capacity enforced **server-side in a transaction** (row lock or atomic conditional insert + unique constraint). Bookings are optimistic with `onError` rollback.
- No new infrastructure. Portable, boring, correct.

**v1.5 upgrade path (add only when a real staleness complaint appears):**
- Add **SSE** endpoints for the specific resources that need to feel live (a class's remaining-capacity, an attendance sheet). SSE is plain HTTP, zero lock, works through your existing stack, and degrades to polling trivially. Add the `react-native-event-source` polyfill for the Expo client.
- Feed those SSE streams from **Postgres LISTEN/NOTIFY** (dedicated unpooled listener connection; notification carries only an id, client/server refetches the row). This keeps the push source inside Postgres — no external broker, no new vendor.

**v2+ (only if the product changes shape):** if offline-first mobile or truly collaborative editing becomes a product goal, re-evaluate **PowerSync** (best mobile + maturity) or **ElectricSQL** (best lock profile) then — with real requirements in hand, not speculatively.

This path spends nothing on real-time until the product proves it needs it, and every step (polling → SSE+NOTIFY → sync engine) is additive and stays on portable, mostly-OSS primitives.

---

## Sources
- ElectricSQL docs / positioning: https://electric.ax/docs/intro , https://github.com/electric-sql/electric
- PowerSync licensing, self-host editions, pricing: https://powersync.com/ , https://powersync.com/pricing
- Zero 1.0 release (June 2026), production status: https://www.infoq.com/news/2026/06/zero-version-1/ , https://zero.rocicorp.dev/
- Local-first sync engine comparison (Electric vs PowerSync vs Zero, 2026): https://trybuildpilot.com/648-electric-sql-vs-powersync-vs-zero-2026
- Postgres LISTEN/NOTIFY scaling + PgBouncer caveats: https://www.jusdb.com/blog/postgresql-listen-notify-realtime-events , https://github.com/pgbouncer/pgbouncer/issues/655 , https://neon.com/guides/pub-sub-listen-notify
- SSE vs WebSockets, RN/Expo support: https://ably.com/blog/websockets-vs-sse , https://github.com/react-native-community/discussions-and-proposals/issues/99
