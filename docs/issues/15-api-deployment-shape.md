# 15 — API deployment shape (in-Next vs standalone) under future realtime

Type: grilling
Status: resolved
Blocked by: 21

## Question

**Refines [06](06-hosting-topology.md) / [04](04-realtime-strategy.md).** The review found a conflict: the realtime upgrade path (SSE fed by Postgres `LISTEN/NOTIFY`) needs a **persistent connection**, which is impossible on Vercel serverless functions and broken by transaction-mode pooling. So "add SSE endpoints later" is not the drop-in the doc implies — it likely forces extracting the tRPC API into a standalone long-lived service.

Decide, knowing this now:
1. **Stay in-Next serverless for v1** (simplest, solo-friendly) and accept that *any* future push/realtime means a later API extraction to a standalone `@hono/trpc-server` (or Node) service — a bigger change. Document it as a known one-way-ish door.
2. **Run the tRPC API as a standalone long-lived service from day 1** (Node/Hono on Fly/Railway), Next used only for the web UI. More ops now (a second deploy for a solo dev), but persistent connections, interactive transactions, and cron workers become natural, and realtime is additive.
3. **Hybrid** — in-Next now, but structure `packages/api` so extraction is mechanical (routers are pure functions; no Next-only APIs in resolvers).

Weigh against solo-builder + DX-first + the real likelihood of needing push (class reminders/cancellations — see [17](17-class-cancellation-notification.md)). Depends on the connection facts from [21](21-neon-connection-model.md). Output: the v1 deployment shape + an explicit statement of what future realtime/push will cost under it.

## Answer

**In-Next serverless for v1, with `packages/api` kept extraction-ready.** (Option 1.)

- **Deploy:** a single Next.js app on **Vercel** serves the web UI + the tRPC API (`/api/trpc/[trpc]`) + cron endpoints. Connection: **`pg` (node-postgres) on Vercel Fluid compute against Neon's `-pooler` endpoint** (per [21](21-neon-connection-model.md)).
- **Why this is low-risk:** everything v1 and the near term need runs on serverless — booking (single atomic `UPDATE`, no interactive tx → [13](13-booking-write-atomicity.md)), the materialization cron ([16](16-materialization-job-scaling.md)), cancellation email ([17](17-class-cancellation-notification.md)), and Expo push are all plain HTTPS calls or single statements.
- **The one thing serverless can't do** — Postgres `LISTEN/NOTIFY`-driven live UI updates — is already deferred (v1 = polling, [04](04-realtime-strategy.md)). When/if it lands, it becomes a **small separate always-on worker** (direct Neon connection) that pushes over SSE — the API does **not** move. Realtime is additive, not a rewrite.
- **Extraction discipline (makes a future full move mechanical):** `packages/api` routers stay pure — no Next-only APIs inside resolvers; `ctx` is built by a thin adapter. A lint rule enforces it. If a standalone API is ever wanted, the routers drop onto `@hono/trpc-server` unchanged.

**Corrects** architecture.md §6/§9 and [06](06-hosting-topology.md): the realtime upgrade is a *separate worker*, not "SSE endpoints on the same serverless API."
