# 66 · Identity reads run on the tenant transaction, not a second connection

*(Amends the `ctx.baseDb` rule in ADR [60](60-backend-review-fixes.md), which itself amends ADR [33](33-tenant-seam-enforcement.md). Found while running the router suite for ADR [62](62-coach-workload-and-coverage.md). No migration, no behavior change for users.)*

## Context

ADR 60 gave the tRPC context one injectable base-connection handle, `ctx.baseDb`, and made `exec` a required parameter on every base-connection helper. `architecture.md` described it as existing "only for the Better Auth identity tables (`member`/`user`/`organization`) that carry no policy and **so can never be read through the tenant transaction**."

That last clause is not true, and the codebase already contradicted it. `template.list` and `class.week` left-join `user` on the RLS-scoped `ctx.db` and always have. Migration `0020` says the same thing in its own comment: "Request handlers only ever READ identity: the routers left-join `user` for a display name on the RLS-scoped transaction." `0020` revokes only INSERT/UPDATE/DELETE from `matops_app`; SELECT on `user` / `organization` / `member` stays. None of those tables has RLS enabled, so a read returns identical rows on either handle.

Fourteen router call sites nonetheless read identity through `ctx.baseDb` **from inside** the tenant transaction: `listMembersOf`, `getMemberById`, `getMemberIdForUser`.

**What that costs in production.** `enforceTenant` wraps the whole resolver in `withTenant`, which holds one `pg` pool connection for the request. A `ctx.baseDb` read inside it checks out a **second** connection from the same pool and holds both until the transaction ends. With `pool.max` at the node-postgres default of 10, ten concurrent requests can each hold a transaction while each waits for one more connection that nobody can release. It is the same shape as the problem ADR 60 fixed by moving notification sends to `afterCommit`, and it was left in the read path.

**What it cost in tests.** PGlite is a single connection, so the deadlock is not probabilistic there, it is certain. A four-line repro over unmodified files shows it:

```ts
await withTenant("acad", async () => exec.execute(sql`SELECT 1`), exec); // hangs
```

Every router test whose procedure read identity inside the transaction timed out at 30s, and because the deadlocked transaction never released the single connection, every later test in that file timed out too. `member-scope.test.ts` (12), `payments.test.ts` (7) and `coach-stats.test.ts` (8) were all red, and the api suite took **366 seconds** to report it. Two of those files predate this wave, so the suite had been failing since ADR 60 shipped it.

## Decision

**A read inside a tenant resolver runs on `ctx.db`.** The base connection is for two things only: lookups that happen **before** the transaction opens (`getMembership` in `enforceTenant`, `academy.setActive`), and identity **writes**, which `matops_app` may not perform.

The four read helpers in `packages/db/src/membership.ts` now take `DbReader = DbExec | TenantTx` instead of `DbExec`, so either handle typechecks and the call site picks the right one. `MemberScope` in `packages/api/src/members.ts` carries `db` rather than `baseDb`, so `requireMember` and `staffOf` follow the same rule. Twelve router call sites moved.

**`listMembershipsForUser` gained a required `exec`.** It was the one helper in the module still closing over the module singleton, which ADR 60 had missed. In a test run it reached for the real pool and failed with `getaddrinfo ENOTFOUND api-test-dummy`; in production it silently bypassed the one injection point the seam is supposed to have.

**Permission tests assert the tRPC error code, not the message.** `rejectionCode(promise)` in `packages/api/test/helpers.ts` returns the code. Four tests had asserted `/FORBIDDEN/i` against the *message*, which is user-facing copy: the guards were refusing correctly with "Owner only" and "Only an owner can change the coach on a past class", and the tests failed anyway. Those four are a test defect, fixed in the tests. Every other failure in this wave was a code defect, fixed in the code.

## Consequences

- The api suite goes from **4 files failing in 366s** to **7 files, 62 tests, green in 18s**. Full run: 410 tests across five suites.
- One connection per request instead of two, and the pool-exhaustion deadlock is gone from the read path.
- `architecture.md` §0's description of `ctx.baseDb` is corrected: it is the door for pre-transaction lookups and identity writes, not "the only way to read identity".
- The lint guardrail from ADR 33 (no raw owner `db` in `packages/api/src/router/**`) is unaffected and still the backstop.
- Identity **writes** inside a tenant procedure still take a second connection, because `0020` denies `matops_app` those grants. That is a smaller surface (approve, suspend, set role) and is left as is; moving it would mean either granting the RLS role write access to identity or restructuring where the transaction opens. Neither is worth doing for the pilot.
