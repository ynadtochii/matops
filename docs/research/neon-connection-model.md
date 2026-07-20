# Neon Connection Model for matops

Research ticket resolution — Neon (Postgres) + Drizzle + tRPC, possibly on Next.js/Vercel serverless.
Date: 2026-07-20. Sources are current Neon/Drizzle primary docs (linked inline; full list at bottom).

---

## TL;DR recommendations

| Decision | Recommendation |
|---|---|
| **Booking write** (needs `SELECT … FOR UPDATE` + app logic + COMMIT) | Use the **WebSocket `Pool`** driver (`@neondatabase/serverless` → `drizzle-orm/neon-serverless`), or plain `pg` on Fluid. `neon-http` **cannot** do it. |
| **API deployment shape** | Prefer a **warm/serverful-ish runtime**. On Vercel, use **Fluid compute + `pg` (node-postgres)** per current Neon guidance; if edge/one-shot, use `neon-http`. |
| **Materialization / cron job** | Batch, non-interactive → **`neon-http` `transaction()`** (fastest, ~3 round-trips). If it needs advisory locks or LISTEN, use a **direct/unpooled `pg`** connection. |
| **RLS** | **Pooled endpoint** + **transaction-wrapped `set_config(..., true)` / `SET LOCAL`** per request. Never plain `SET`. |

**Default driver for "Next.js on Vercel + Drizzle + Neon":** `pg` (node-postgres) on **Vercel Fluid compute** against the **`-pooler`** endpoint, because Fluid keeps functions warm long enough to reuse TCP connections ([Neon: choose-connection](https://neon.com/docs/connect/choose-connection)). For edge or non-interactive workloads, `neon-http`. Reach for `neon-serverless` WebSocket `Pool` only when you need interactive transactions in a runtime where TCP `pg` isn't viable.

---

## 1. Driver × Capability matrix

| Capability | (a) `neon-http` (`neon()` / drizzle `neon-http`) | (b) WebSocket `Pool` (drizzle `neon-serverless`) | (c) plain TCP `pg` Pool |
|---|---|---|---|
| **Interactive tx** (BEGIN → app logic between queries → COMMIT) | ❌ No — "single or non-interactive batched queries" only; Drizzle `neon-http` has **no `db.transaction()`** | ✅ Yes — "session and transaction support" | ✅ Yes |
| **`SELECT … FOR UPDATE` row lock held across app logic** | ❌ No — a row lock only survives inside an open interactive tx, which this driver can't hold | ✅ Yes | ✅ Yes |
| **Single-statement / single-round-trip tx** | ✅ Yes — `transaction([q1,q2,…])` batches multiple statements into **one** non-interactive round-trip (`isolationLevel`, `readOnly`, `deferrable` options) | ✅ Yes (but ~8 round-trips like TCP) | ✅ Yes |
| **Usable from Vercel serverless functions** | ✅ Best fit for edge/one-shot (HTTP, ~3 round-trips, no persistent socket) | ⚠️ Works, but `Pool`/`Client` **must be connected, used, and closed inside a single request handler** — WebSockets can't outlive a request | ✅ Yes on **Fluid compute** (warm reuse); poor on classic cold serverless (socket setup per invoke) |
| **node-postgres compatibility** | ❌ | ✅ "drop-in replacement for `pg`" | ✅ (is `pg`) |

Sources: [Neon serverless-driver](https://neon.com/docs/serverless/serverless-driver), [Drizzle connect-neon](https://orm.drizzle.team/docs/connect-neon), [Neon choose-connection](https://neon.com/docs/connect/choose-connection).

**Key nuance on `FOR UPDATE`:** the point of `SELECT … FOR UPDATE` is to hold the lock while application code decides, then COMMIT. That requires an *open interactive transaction*. Only (b) and (c) can keep that transaction open across app logic. `neon-http` can run a `FOR UPDATE` statement *inside* a batched `transaction()`, but there is no gap to run app logic between the lock and the write, so it cannot serve the read-decide-write booking pattern.

---

## 2. What breaks under transaction-mode pooling (PgBouncer `pool_mode=transaction`)

Neon's **pooled endpoint** (`-pooler` in hostname) runs PgBouncer in **transaction mode**: the server connection is handed back to the pool at the **end of each transaction**, so any state that lives on a *session* (backend) is unreliable because your next statement may land on a different backend ([Neon connection-pooling](https://neon.com/docs/connect/connection-pooling)).

Broken / unsupported on the pooled endpoint:

- **`SET` / `RESET`** (session GUCs incl. `search_path`, `SET app.academy_id`) — the setting is lost/leaks. **Use `SET LOCAL` / `set_config(..., true)` inside a transaction instead** (see §5).
- **`LISTEN` / `NOTIFY`** — the channel subscription lives on a backend you no longer own.
- **SQL-level `PREPARE` / `DEALLOCATE`** (named prepared statements). *Protocol-level* prepared statements via the driver **are** supported.
- **Session-level advisory locks** (`pg_advisory_lock`) — a trap: you may acquire on one backend and release on another, **leaking the lock forever**. Use **transaction-scoped** `pg_advisory_xact_lock` (auto-released at COMMIT) or a direct connection.
- **`WITH HOLD` cursors**, **`LOAD`**, and session **temp tables** (`ON COMMIT PRESERVE ROWS`).

**Connection limits:** PgBouncer `max_client_conn` = **10,000** client connections; `default_pool_size` ≈ **90% of `max_connections`** per role/db (`max_connections` scales with compute, e.g. 419 at 1 CU). Direct/unpooled connections are capped by `max_connections` and are easily exhausted by serverless fan-out — this is the whole reason to use the pooled endpoint for app traffic.

**Use direct/unpooled for:** schema migrations (`drizzle-kit`), `pg_dump`/`pg_restore` (use `SET`), logical replication, and anything needing persistent session state or session advisory locks.

---

## 3. Serverless fit & cold-start

- **`neon-http`** — no persistent socket; each query is an independent HTTPS request (~3 round-trips). Lowest cold-start/connection overhead, edge-runtime compatible. Best for one-shot queries. No connection to keep alive between invocations.
- **`neon-serverless` WebSocket `Pool`** — must open/close within one request handler; a WebSocket can't outlive the request. ~8 round-trips (TCP-like). Use only when you need interactive tx in a runtime without TCP.
- **`pg` TCP Pool** — full connection setup per cold container; poor on classic bursty serverless, but **excellent on Vercel Fluid compute**, which keeps functions warm long enough to reuse TCP connections. Point it at the `-pooler` endpoint so bursts don't exhaust `max_connections`.

**Current recommended driver for Next.js on Vercel:** Neon's own guidance now says **`pg` (node-postgres) with `@vercel/functions` on Fluid compute** ([Neon choose-connection](https://neon.com/docs/connect/choose-connection)). For edge functions or purely non-interactive access, `neon-http`. Drizzle's general serverless recommendation remains `neon-http` for single queries and `neon-serverless` when you need transactions ([Drizzle connect-neon](https://orm.drizzle.team/docs/connect-neon)).

---

## 4. LISTEN/NOTIFY & Postgres-change-driven push

`LISTEN`/`NOTIFY` **requires a persistent session connection** — the subscriber must hold an open backend to receive events. This is fundamentally **incompatible with**: (a) stateless serverless functions (nothing stays open between invocations), and (b) the transaction-mode pooled endpoint (subscription lives on a backend that gets recycled). Confirmed by the pooling docs listing LISTEN/NOTIFY as unsupported on the pooler.

**Standard patterns for change-driven push in a serverless-hosted app:**
- A **long-lived listener process** (small always-on worker / container / VM) on a **direct/unpooled** connection that `LISTEN`s and fans out to clients (WebSocket/SSE/push service). Serverless functions can't be that listener.
- **Outbox / polling** table drained by a cron/queue worker.
- **Logical replication / CDC** (Debezium, Neon logical replication → Kafka/queue) on a direct connection.
- A managed realtime layer (e.g. Supabase Realtime-style, Ably/Pusher, or a durable queue) rather than raw NOTIFY.

For matops: don't build push on `LISTEN`/`NOTIFY` from serverless. If real-time is needed, add a dedicated worker or a realtime/queue service.

---

## 5. RLS-under-pooling recipe (practical)

Goal: set the tenant id (`app.academy_id`) per request so RLS policies see it, while running on the transaction-mode pooled endpoint where reused connections must not leak one tenant's context to another.

**Rule:** never use plain `SET` (leaks across pooled reuse). Always **wrap in a transaction** and use **`SET LOCAL` / `set_config(key, value, true)`** — the `true`/`LOCAL` flag scopes the value to the current transaction, which is exactly the PgBouncer checkout boundary, so it resets before the connection returns to the pool ([Neon rls-query-execution](https://neon.com/docs/guides/rls-query-execution)).

Setup:
- Connect with a **scoped role** with `LOGIN`, **no `BYPASSRLS`** (e.g. `authenticated_backend`) so policies are actually enforced. Use the **pooled** connection string for runtime traffic.
- Define policies in Drizzle with `crudPolicy` bound to that role.

Per-request pattern (Drizzle):

```ts
const pool = new Pool({ connectionString: process.env.DATABASE_AUTHENTICATED_URL! }); // pooled -pooler URL
const db = drizzle(pool);

export async function withTenant<T>(academyId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    // LOCAL => scoped to this tx => safe under transaction-mode pooling
    await tx.execute(sql`select set_config('app.academy_id', ${academyId}, true)`);
    // equivalently: await tx.execute(sql`set local app.academy_id = ${academyId}`);
    return fn(tx);
  });
}
```

RLS policies read the value via `current_setting('app.academy_id', true)` (Neon's Authorize/JWT flavor uses `set_config('request.jwt.claims', …, true)` and `auth.*` helpers). Populate `academyId` from tRPC context / auth middleware (e.g. via `AsyncLocalStorage`).

**Caveat:** every RLS request now runs inside a transaction (one extra `set_config` round-trip). That's fine on `pg`/`neon-serverless`; with `neon-http` you'd have to fold the `set_config` + query into a single `transaction([...])` batch (no interactive tx), which is awkward — another reason to prefer `pg`/Fluid for the RLS-bearing API path.

---

## Sources

- Neon — Serverless driver: https://neon.com/docs/serverless/serverless-driver
- Neon — Connection pooling: https://neon.com/docs/connect/connection-pooling
- Neon — Choosing your connection method: https://neon.com/docs/connect/choose-connection
- Neon — Run RLS queries with Drizzle: https://neon.com/docs/guides/rls-query-execution
- Drizzle — Connect to Neon: https://orm.drizzle.team/docs/connect-neon
- Drizzle — Row-Level Security: https://orm.drizzle.team/docs/rls
