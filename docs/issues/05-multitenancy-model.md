# 05 — Multi-tenancy enforcement model

Type: grilling
Status: resolved
Blocked by: —

## Question

The old app's strongest idea was **structural tenancy**: every tenant row carries an indexed `academyId`, and isolation is enforced *by construction* through a `tenantQuery`/`tenantMutation` seam rather than per-handler discipline. How do we re-derive that on Postgres?

**Scope note (session 4):** "SaaS" here means **multi-academy native, not typical commercial SaaS** — no billing/plans/signup-funnel machinery. So the goal is clean, scalable tenant *separation*, kept **simple**. Strong recommended default (confirm here): **shared DB + `academyId` on every tenant row + an application-level scoped seam**, expressed as a **tRPC middleware** ([01](01-api-contract-and-runtime.md)) that resolves user→academy→role (from Better Auth's org data, [02](02-auth-stack.md)) and hands the resolver an academyId-bound db client. **No RLS / schema-per-tenant / DB-per-tenant in v1** (that's the over-engineering to avoid; it stays a documented future option if a tenant ever needs hard isolation).

Remaining calls to lock:
1. **Belt-and-suspenders?** App-seam only for v1 (recommended), or add Postgres **RLS** as defense-in-depth now? (Lean: app-seam only; revisit RLS later.)
2. **Membership-in-academy** as a first-class join so a user can belong to / operate several academies without a refactor — connects to [08](08-mvp-domain-model.md).
3. **Where resolution happens** — confirm it's the tRPC tenant middleware, so no resolver can touch an unscoped db client (the "deletion test": delete the seam and cross-tenant reads become possible → it's load-bearing).

Output: the enforcement pattern (with a deletion-test justification), the simple day-1 posture, and how a request resolves to a scoped context.

## Answer

**Shared DB + `academyId` on every tenant row + an application-level scoped seam. No RLS in v1.**

- **Seam:** a tRPC `protectedProcedure` tenant middleware ([01](01-api-contract-and-runtime.md)) resolves user → academy → role from the Better Auth session/Organization data ([02](02-auth-stack.md)) and injects an academyId-bound **`scopedDb(academyId)`** Drizzle client ([03](03-postgres-access-layer.md)) into `ctx`. Resolvers never receive a raw, unscoped db handle — isolation is by construction, not per-handler discipline.
- **Deletion test:** remove the middleware and cross-tenant reads become possible → the seam is load-bearing (the structural-tenancy property, re-derived from the old app on Postgres).
- **Isolation posture:** one shared Postgres, `academyId` column + academyId-leading indexes on every tenant table. **No RLS / schema-per-tenant / DB-per-tenant in v1** — documented future option only if a tenant ever needs hard physical isolation. This is "simple + scalable enough for many academies," not over-engineered.
- **Membership-in-academy** is a first-class join (user ↔ academy ↔ role + status) so a user can belong to / operate several academies later without a refactor — the exact columns are modelled in [08](08-mvp-domain-model.md).
- **Not a T3 default** (create-t3-turbo is single-tenant) — this is our own design, T3-compatible, layered as tRPC middleware.

## ⚠ Post-review note (session 8)
The "structural, by-construction" claim here was **over-stated for Drizzle without RLS**. Refined by [12 — Tenant isolation: RLS vs app-level convention](12-tenant-isolation-mechanism.md). Treat this ticket's "no RLS in v1" as **under revision** until 12 closes.
