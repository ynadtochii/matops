# 21 — Neon driver + serverless connection model (facts)

Type: research
Status: resolved
Blocked by: —

## Question

**Feeds [13](13-booking-write-atomicity.md), [15](15-api-deployment-shape.md), [16](16-materialization-job-scaling.md).** Several decisions hinge on what Neon's connection options actually support. Gather the facts (Neon + Drizzle docs, as of 2026-07):

1. **Drivers:** `neon-http` (stateless HTTP) vs `neon` serverless WebSocket (`Pool`) vs a plain TCP `pg` pool. For each: does it support **interactive transactions** (`BEGIN … app logic … COMMIT`), `SELECT … FOR UPDATE`, and **single-statement** transactions?
2. **Pooling:** Neon's pooled endpoint (PgBouncer, transaction mode) vs direct. What breaks under transaction-mode pooling — `LISTEN/NOTIFY`, session-level settings (`SET`, relevant to RLS `SET app.academy_id` in [12](12-tenant-isolation-mechanism.md)), prepared statements, advisory locks?
3. **Serverless fit:** connection limits / cold-start behavior for each driver on Vercel functions; recommended driver for Next-on-Vercel + Drizzle.
4. **LISTEN/NOTIFY:** confirm it needs a persistent session connection and is therefore incompatible with serverless functions + transaction pooling (relevant to [15](15-api-deployment-shape.md)).
5. **RLS + pooling:** if we set `app.academy_id` per request for RLS, does transaction-mode pooling preserve it for the statement, or is a `SET LOCAL` inside a transaction required?

Output: a driver × capability table and a one-line recommendation per consuming ticket. Resolve via a `/research` subagent.

## Answer

Full report: [research/neon-connection-model.md](../research/neon-connection-model.md).

**Driver capabilities:**
- `neon-http` — single or non-interactive **batched** `transaction([...])` only (~3 round-trips, edge-friendly). **No interactive transaction**, so it cannot hold `SELECT … FOR UPDATE` across app logic. Fine for a single atomic conditional `UPDATE`.
- `neon-serverless` WebSocket `Pool` and plain TCP `pg` — full interactive transactions + row locks; must open/close within one request on serverless.

**Pooling (`-pooler`, PgBouncer transaction mode):** breaks `SET`/`RESET`, `LISTEN`/`NOTIFY`, SQL `PREPARE`, `WITH HOLD` cursors, session temp tables, session-level advisory locks. Protocol-level prepared statements OK. `max_client_conn` 10,000.

**RLS recipe under pooling:** scoped non-`BYPASSRLS` role; per request wrap in a transaction and `set_config('app.academy_id', id, true)` / `SET LOCAL` (LOCAL = transaction scope = pooler checkout boundary → never leaks to a reused connection). Never plain `SET`.

**Recommended driver (Next.js on Vercel):** `pg` (node-postgres) + `@vercel/functions` on **Fluid compute** (warm functions reuse TCP) against the `-pooler` endpoint. `neon-http` for edge/one-shot. LISTEN/NOTIFY needs a persistent session → change-driven push must use a dedicated long-lived worker (direct connection) or CDC/queue, never serverless functions.

**One-liners for consumers:**
- **[13] booking write:** the atomic conditional `UPDATE` works on any driver incl. `neon-http` → no interactive tx needed. If we choose `pg`+Fluid, interactive tx is also available but not required.
- **[15] deployment shape:** LISTEN/NOTIFY confirmed impossible on serverless → future realtime needs a long-lived worker/service regardless. Feeds the in-Next-vs-standalone call.
- **[16] materialization:** a serverless cron works with `pg`/`neon-http`; heavy fan-out favors a worker.
- **[12] RLS:** viable under pooling via `SET LOCAL`/`set_config(...,true)` in a per-request transaction.
