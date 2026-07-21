# 33 — Tenant-seam enforcement (fail-closed, not fail-open)

Type: build-decision (hardening)
Status: resolved
Refines: [12](12-tenant-isolation-mechanism.md), [20](20-instructor-permissions-and-approval-gate.md), [23](23-pending-capability-never-block.md)

## Question

The RLS tenant seam ([12](12-tenant-isolation-mechanism.md)) is correct: every
request runs inside `withTenant(academyId, …)`, which drops to the non-BYPASSRLS
role `matops_app` and sets `app.academy_id`, so Postgres filters every row. An
architecture audit found the seam is **opt-in, not on-by-default** in three
places, and one authorization gate that **fails open**:

1. The runtime app connects as the Neon table-**owner** role. A table owner
   bypasses RLS unless `FORCE ROW LEVEL SECURITY` is set (it is not — the
   materialization cron needs cross-academy writes, [16](16-materialization-job-scaling.md)).
   So the base `db` handle is a full RLS-bypass connection. It was placed on the
   tRPC base context as `ctx.db`, meaning a future resolver on a **non-tenant**
   procedure that reached for `ctx.db` would leak across academies, and no test
   would catch it.
2. Architecture §10 / issue 12 promised a lint rule forbidding routers from
   opening a raw db connection outside the tenant helper. It did **not exist**.
3. `enrolledProcedure` only checked that a membership row **exists**, not its
   status. Reject/remove/suspend keep the row (history is preserved), so a
   removed or suspended member still passed the enrolled tier. Harmless today
   (two read-only endpoints), but booking + check-in are planned to land on this
   exact tier ([23](23-pending-capability-never-block.md)).

## Answer

**Make the seam fail-closed by construction, at the layers we can verify without
new infra. Split the DB role as a documented follow-up.**

### 1. The base request context carries no db handle

`createTRPCContext` no longer puts `db` on the context. The only db handle a
resolver ever sees is `ctx.db` — the RLS-scoped transaction injected by the
tenant middleware (`enforceTenant`). A resolver on a public/protected procedure
therefore has **no `ctx.db` at all** and fails at **typecheck** if it reaches for
one, instead of silently getting an RLS-bypassing owner connection. (`withTenant`
uses the module-level `db` directly, so the seam itself is unaffected.)

### 2. Lint guardrail on routers

`no-restricted-imports` blocks importing `@matops/db/client` (the raw owner
`db`) inside `packages/api/src/router/**` (`packages/api/eslint.config.ts`).
Routers must use `ctx.db` or a domain-scoped db helper. The raw handle stays
available to `trpc.ts` (the seam), the auth package, migrations, and the cron.

### 3. `canEnroll` predicate — the enrolled tier excludes suspended/removed

A pure `canEnroll(m)` in `@matops/domain` (`packages/domain/src/access.ts`)
returns true only for `pending` and `active`. `enforceTenant` rejects anything
else with `FORBIDDEN`. This closes the fail-open and puts the last tier rule that
was implicit ("row exists") into a tested pure function alongside
`isActiveMember`/`isStaff`/`isOwner`.

### 4. Atomic "never ownerless"

The `remove`/`suspend` guard was a read-then-write race: two owners removing each
other could each read "2 active owners", both pass, and strand the gym with none.
`setMemberStatusIfNotLastOwner` (`packages/db/src/membership.ts`) now does the
check and the write in **one transaction**, locking the academy's member rows
with `FOR UPDATE` so concurrent mutations serialize, re-running the pure
`canRemoveOrDemote` guard on the freshly locked rows before writing.

## Follow-up (not done here): split the runtime DB role

Defense in depth #1 above stops the API layer from leaking, but the base
connection still bypasses RLS at the Postgres level. The stronger posture is a
dedicated **non-owner login role** for request handlers (fail-closed even if a
future path forgets the seam), with the owner role reserved for migrations + the
cron. This needs Neon provisioning (a login role + its own connection string) and
verification on a Neon branch — the current tests run on PGlite as a superuser,
which masks role behavior, so it cannot be verified in CI as-is. Tracked as a
Phase 5 launch-hardening task. Steps:

1. Provision a `matops_runtime` login role in Neon; grant it the same table
   privileges `matops_app` already has (no `BYPASSRLS`, not a table owner).
2. Point the request pool at a `matops_runtime` connection string; keep the owner
   string for migrations + the cron/service path only.
3. Add a real-Neon (or non-superuser PGlite) leak test to CI so dropping the
   grant or forcing RLS fails a test.

## Consequences

- Forgetting the tenant seam in a router now fails at typecheck or lint, not at
  runtime with a silent cross-tenant leak.
- A suspended/removed member is refused at the enrolled tier — the gate is now
  uniform for pending (allowed, view-only) and closed for revoked access.
- The last active owner cannot be dropped even under concurrent owner actions.
- Verified: `lint` (13/13), `typecheck` (15/15), `test` (62) green; the lint rule
  was confirmed to fire on a raw-client import in a router.
