# 06 — Hosting & deployment topology

Type: grilling
Status: resolved
Blocked by: 01, 02, 04

## Question

Where do the pieces run, under the portability constraint — web, backend/API, Postgres, and mobile builds?

Decide the deployment topology and the escape-hatch story:
- **Web (owner):** Vercel vs a portable Node host (Fly / Railway / Render / self). If the API is colocated in Next.js ([01](01-api-contract-and-runtime.md)), this couples; if standalone, it splits.
- **Backend/API:** where the Node service lives; must be movable (container-first, no serverless-vendor-specific primitives in the core).
- **Postgres:** Neon vs Supabase vs RDS vs self-hosted — all "just Postgres," so the choice is ops/cost/DX, and the point is that migrating hosts is a dump/restore, not a rewrite.
- **Mobile:** EAS (Expo Application Services) for builds/submission — acceptable lock (build tooling, not data path)? Bare workflow alternative?
- **Env/secrets, migrations-on-deploy, preview environments.**

Depends on the API runtime ([01](01-api-contract-and-runtime.md)), auth hosting ([02](02-auth-stack.md)), and whether a realtime transport needs a persistent connection ([04](04-realtime-strategy.md)).

Output: a concrete topology (a diagram/list of hosts) plus the "how we move off any one of these" note per component.

## Answer

**Web + API deploy together on Vercel (create-t3-turbo default); Postgres on Neon; mobile via EAS.**

- **Web + tRPC API:** one Next.js app on **Vercel** (the API is colocated per [01](01-api-contract-and-runtime.md)) — one deploy, right for a solo builder.
- **Postgres:** **Neon** (serverless Postgres, first-class Drizzle driver). Portable — migrating hosts is a dump/restore, not a rewrite.
- **Mobile:** **EAS** (Expo Application Services) for builds/OTA/store submission — build tooling, not a data-path lock (acceptable).
- **Migrations:** `drizzle-kit generate` in CI; applied on deploy.
- **Portability escape hatches (keep the door open):** Next is containerizable off Vercel (Docker → Fly/Railway/self) if serverless limits or SSE ([04](04-realtime-strategy.md)) demand it; the tRPC router is extractable to a standalone `@hono/trpc-server` service at that point; Postgres is host-agnostic. Nothing here is a one-way door.

## ⚠ Post-review note (session 8)
"Add SSE later" understated the cost: LISTEN/NOTIFY needs a persistent connection, incompatible with Vercel serverless. The in-Next-vs-standalone-API question is reopened in [15 — API deployment shape](15-api-deployment-shape.md); scheduler scaling in [16](16-materialization-job-scaling.md).
