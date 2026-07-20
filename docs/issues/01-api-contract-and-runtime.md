# 01 — API contract & backend runtime

Type: grilling
Status: resolved
Blocked by: —

## Question

What runs the server, and what is the **contract** the owner web app and the student Expo app both call through?

Two coupled sub-decisions:
1. **Runtime/host of the backend** — colocated Next.js route handlers vs a standalone Node service (Hono / Fastify / Nest). Constraint: must serve a native mobile client (not just RSC), and must stay portable (no serverless-vendor lock in the core).
2. **API style** — the top contenders for a two-TS-client stack: **tRPC** (best DX, tightest TS coupling, weaker for non-TS/public consumers), **typed REST** (e.g. Hono + OpenAPI + generated client — most portable, more boilerplate), or **GraphQL** (flexible, heavier). Must feed a shared, type-safe client package consumed by both web and mobile.

This is foundational — it decides the shape of the shared `api-client` package and constrains hosting and the monorepo layout. Resolve first.

Output: a chosen runtime + API style with the rationale tied to the portability and two-client constraints, and a sketch of how the shared client package is generated/consumed.

## Answer

**tRPC, colocated in Next.js — the `create-t3-turbo` pattern.** (Revised — this ticket was first locked to REST+OpenAPI/Hono under a "client-agnostic API" constraint that the user then retracted: the API is internal-only, one codebase, no third-party consumers. Combined with solo-builder + DX-first + agentic-first, tRPC wins.)

**Contract style:** **tRPC** (v11) + `@trpc/react-query` (TanStack Query v5). End-to-end types inferred straight from the server `AppRouter` — **zero codegen, zero spec-sync**. In a monorepo the Expo app and Next app both import the router type directly. Auto-generated hooks (`trpc.class.list.useQuery()`) with query keys + invalidation. Zod validates inputs, bound to the inferred types. This is the highest-DX path for a solo dev and the shape agents know best.

**Runtime/host:** tRPC mounted in a **Next.js App Router route handler** (`/api/trpc/[trpc]`), not a separate service. The Expo student app calls that URL over HTTP like any client; the Next web app calls it in-process. One deployable, one thing to run — right for a solo builder. (Considered but rejected for v1: a standalone Hono `apps/api`. It's more portable and better for long-lived SSE, but it's a second service to run/deploy for no v1 benefit, and less canonical for agents. Extraction later is cheap — tRPC routers are plain functions movable onto `@hono/trpc-server`.)

**Why tRPC over REST+OpenAPI here:** the only reason to prefer OpenAPI was an external/non-TS consumer. The user confirmed there is none. tRPC then strictly dominates on DX (no codegen pipeline, no `packages/api-client` to maintain, refactor-safe). **Hedge:** if an external API is ever needed, `trpc-to-openapi` exposes annotated procedures as REST+OpenAPI without a rewrite.

**Two cautions carried forward (accepted):**
1. **Mobile version skew.** Store apps linger on old builds, so the tRPC contract must be **additive-only** to shipped procedures (never change/remove a shape an old app calls). Discipline, not tooling — note it in the [architecture doc](10-architecture-design-doc.md).
2. **Portability.** Hosting the API inside Next couples the API layer to the Next deploy (Vercel or a self-hosted Next container). Data stays portable (Postgres). Acceptable given DX/velocity priorities; the standalone-Hono escape hatch remains.

**Auth + tenancy integration:** Better Auth ([02](02-auth-stack.md)) provides the session; a tRPC `protectedProcedure`/tenant middleware resolves user → academy → role and injects the academyId-scoped db client — that middleware IS the tenant seam from [05](05-multitenancy-model.md).

**Consequences for downstream tickets:** [07](07-monorepo-structure.md) → `apps/nextjs` (web+API) + `apps/expo` + `packages/api` (tRPC router) + `packages/db` + `packages/validators`, per create-t3-turbo; no `api-client` codegen package needed. [06](06-hosting-topology.md) → web+API deploy together (Vercel or container); no separate API host in v1. SSE upgrade path ([04](04-realtime-strategy.md)) → if it lands, that's when a standalone service may get extracted.
