# 12 — Tenant isolation: RLS vs app-level convention

Type: grilling
Status: resolved
Blocked by: —

## Question

**Refines [05](05-multitenancy-model.md).** The review found the "structural, by-construction" tenant-scoping claim over-stated: Drizzle is a query builder with **no global row-level filter hook**, so an auto-injecting `scopedDb(academyId)` that covers every select/join/update/delete is hard to make truly airtight. Without a mechanism, "the seam" degrades to *discipline* (remember the `where` on every query) — exactly what the old app avoided.

Pick the actual enforcement mechanism:
1. **Postgres RLS now** — a `SET app.academy_id` per request/transaction + `USING (academy_id = current_setting(...))` policies on every tenant table. True by-construction isolation, DB-enforced; cost: policy management, and it needs the connection to carry the setting (interacts with [21](21-neon-connection-model.md) / pooling). This contradicts the earlier "no RLS in v1" call — the review says that call was wrong.
2. **App-level convention + guardrails** — a constrained repository/`scopedDb` wrapper + an ESLint rule forbidding raw db in resolvers + a CI cross-tenant leak test suite. Honest name: "enforced by convention + tests," not "by construction."
3. **Both** (RLS as the real guarantee, wrapper for DX).

Decide the mechanism, and if not RLS, **correct the architecture doc's language** to stop claiming by-construction. Output: the chosen mechanism + how a request sets/carries the tenant scope + what the leak test asserts.

## Answer

**Postgres RLS is the enforcement mechanism, with a thin per-request helper.** (Reverses the earlier "no RLS in v1" call in [05](05-multitenancy-model.md) — the review showed that call traded a must-never-leak guarantee for mere discipline.)

**How it works:**
- Every tenant table (`class_template`, `class`, `class_participation`, and future domains) gets RLS enabled + a policy: `USING (academy_id = current_setting('app.academy_id')::uuid)` (and a matching `WITH CHECK` for writes).
- The app connects with a **non-`BYPASSRLS` role** (per [21](21-neon-connection-model.md)).
- Per request, a helper opens a transaction and runs `set_config('app.academy_id', <id>, true)` / `SET LOCAL` (the `LOCAL`/`true` flag = transaction scope = the Neon pooler checkout boundary → never leaks to a reused connection). Confirmed viable under Neon transaction-mode pooling.
- The academy id comes from the authenticated **active** membership (Better Auth `member`, `status='active'` — the guard from [14](14-better-auth-approval-feasibility.md)); role checks layer on top.

**Why RLS makes the code simpler, not harder:** the hard part of the old `scopedDb` idea was auto-injecting `where academy_id` into every select/join/update/delete. With RLS, the helper only sets one session variable; **Postgres does the filtering**. App queries stay plain Drizzle and *cannot* leak even if a filter is forgotten or a raw query slips through. This is the true "by-construction" property the architecture doc claimed — now actually delivered.

**Scope & exceptions:**
- RLS applies to **our domain tables**. Better Auth's own tables (`user`/`session`/`organization`/`member`/`invitation`) stay managed by the plugin's scoping — do not force RLS on them in v1.
- Future **global** tables (e.g. the games catalog) get no academy policy (they're cross-tenant by design) — reached via an explicit non-scoped path.

**Guardrails:** keep the CI **cross-tenant leak test** (assert a foreign `academy_id` returns nothing per procedure) as a regression net on the policies; a lint rule still forbids resolvers opening an unscoped connection (they must go through the helper that sets `app.academy_id`).

**Corrects** architecture.md §5 and [05](05-multitenancy-model.md): the tenant guarantee is RLS-enforced, not app-convention.

## ⚠ Implementation notes (slice 0.3)
- **`academy_id` is TEXT, not uuid.** It is the Better Auth `organization.id` (text), so the policy compares text-to-text: `USING (academy_id = current_setting('app.academy_id', true))` — **no `::uuid` cast** (the `::uuid` in the answer above predates the session-12 fix). `current_setting(..., true)` = missing_ok, so an unset GUC yields NULL → the query **fails closed** (no rows) instead of erroring.
- **The request transaction also does `SET LOCAL ROLE matops_app`** (a NOLOGIN, non-BYPASSRLS role) before `set_config`. Reaching the restricted role via `SET LOCAL ROLE` (rather than only the connection role) means RLS is enforced even if the connection authenticated as a privileged/owner role, and it makes the guarantee testable off a superuser connection.
- **Seam helper:** `withTenant(academyId, fn)` in `packages/db/src/tenant.ts` opens the transaction, sets role + GUC, and runs `fn(tx)`.
- **Managed-Postgres gotcha (verified live on Neon):** the runtime connection role (e.g. `neondb_owner`) is NOT a superuser, so it can only `SET ROLE matops_app` if it is a **member** of that role. Migration `0003_grant_app_role.sql` does `GRANT matops_app TO current_user`. A superuser could `SET ROLE` without this — which is exactly why the PGlite leak test (bootstrap superuser) did not catch it. Lesson: some tenancy guarantees must also be checked against real managed Postgres, not only PGlite.
- **Regression net:** `packages/db/test/rls.test.ts` proves isolation on a `tenant_probe` table using **PGlite** (embedded Postgres) — runs in CI with no external DB. The same assertions were also confirmed **live on Neon** (A sees only its rows, cross-tenant write blocked by `WITH CHECK`). It asserts: a tenant sees only its own rows, cannot read another's even by explicit filter, cannot INSERT another academy's row (`WITH CHECK`), and fails closed when the GUC is unset. Every real tenant table (scheduling, Phase 2) follows the same ENABLE RLS + policy pattern in `migrations/0001_tenant_rls.sql`.
