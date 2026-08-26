# 92 — Identity writes leave the tenant transaction, and the type system says so

**Status:** accepted · **Date:** 2026-08-24 · **Area:** `packages/api`, `packages/db` · **Extends:** [33](33-tenant-seam-enforcement.md), [60](60-backend-review-fixes.md), [66](66-identity-reads-run-on-the-tenant-transaction.md), [84](84-archive-and-erase.md)

Numbered 92 on purpose. ADRs 85 through 91 are taken by the frontend
performance branch, which has not merged to `main` yet. Starting at 85 here would
collide on merge.

## Context

ADR 66 established the rule: inside a tenant transaction, reach for the base
connection and you check out a **second** pool connection and hold both for the
whole transaction. It named the consequence for a single-connection PGlite,
"deadlocks outright", and introduced `ownerIdentityProcedure` for the writes that
touch the `organization` row.

The rule was right. It was not enforced, and it was broken in thirteen places.

`packages/api/test` had **27 failing tests**, all timeouts, across
`booking-gate`, `instructor-desk` and `membership-lifecycle`. The three suites
took 124s, 245s and 342s. The pattern in each file is the same: the tests before
the first `member`-writing mutation pass in milliseconds, that mutation hangs for
the full 30-second timeout, and every test after it dies in `beforeEach` behind
the wedged connection.

The cause is `membership.approve` and its seven siblings. All eight are
`staffProcedure` or `ownerProcedure`, so the whole resolver runs inside
`withTenant`. Each then writes the `member` table on `ctx.baseDb`, because
migration `0020` revoked `matops_app`'s write access to the identity tables and
`ctx.db` therefore cannot do it. `packages/api/test/helpers.ts` hands the same
PGlite handle in as `baseDb`, so the base write queues behind the open
transaction, and the transaction is awaiting the base write. Self-deadlock.

Five more procedures had the same defect and no test at all to reveal it:
`invite.list/create/rotate/revoke` on `ownerProcedure`, and
`attendance.addVisitor` on `staffProcedure`.

**This was never only a test problem.** In production the pool hands out the
second connection, so nothing hangs. Every approve, archive, restore, purge,
invite action and walk-in simply holds two of the pool's twenty connections for
its whole duration.

## Decision

### The resolver decides when the transaction opens

`ownerIdentityProcedure` becomes an `identityProcedure` factory with two
instances, `staffIdentityProcedure` and `ownerIdentityProcedure`. They authorize
exactly like the matching tenant tier and open **no** transaction. Where a
resolver also touches tenant tables, it calls `ctx.withTenant(fn)` itself, around
just that part.

The rejected alternative was an `afterCommit`-style queue for identity writes.
It cannot work, because it forces one ordering on every mutation and the
mutations do not agree. `archive` writes status **first** on purpose: status is
the access gate, so a race cannot book a seat in the gap between cancelling the
member's seats and revoking their access. `approve` wants the opposite order. A
middleware cannot offer "before the transaction opens", because the resolver
already runs inside it. Ordering belongs to the resolver, which is the only thing
that knows which order leaves a repairable state.

Every converted mutation keeps the order it already had.

### Five of the eight needed no mechanism at all

`reject`, `suspend`, `restore`, `promote` and `setRole` read `member` and write
`member`. They never touch a tenant table, so they are plain identity procedures
with no `ctx.withTenant` call. Only `approve`, `archive` and `purge` are mixed.

### The base connection is typed away inside a tenant resolver

`enforceTenant` now passes `baseDb: undefined` in the context it hands to
`next()`. A tenant resolver has no base handle to reach for, and the compiler
says so at the call site rather than the test hanging three suites later.

`afterCommit` became `(exec: DbExec) => Promise<void>`. The middleware passes the
real handle when it runs the task, after COMMIT, which is the one moment the
connection is free. That is the legitimate way for a tenant procedure to do
base-connection work, and now the only way.

### Every `packages/db` helper takes a required executor

Fifteen functions lost their `= db` default or their hard-coded singleton:
all five in `invite.ts`, two in `push-token.ts`, three in `dropin.ts`, three in
`academy-settings.ts`, three in `academy-code.ts`, both reminder claims, the
notification insert, and `runMaterializationSweep`, whose `SweepOptions.exec`
went from optional to required. `materialize.ts` also stopped deriving its
`Executor` type from the singleton.

Outside `client.ts`, the only module in `packages/db` that still imports `db` is
`seed.ts`, a CLI entry point.

A default is what let this hide. `exec = db` compiles at every call site,
including the ones that should have been a compile error.

## Consequences

- **`pnpm test` is 589 passing in 19s**, from 27 failing in 5m49s. The three
  suites that took 11 minutes between them now take 8 seconds.
- Approve, archive, restore, purge, the invite actions and the walk-in form each
  hold **one** pool connection instead of two.
- Adding a new identity write to a tenant procedure is now a type error. The
  guard found all four remaining offenders the moment it was switched on, and
  they were all benign closures over `ctx.baseDb` in `afterCommit`.
- `packages/api/test/identity-seam.test.ts` covers the five procedures that had
  no tests: the invite round trip, resolve against a revoked token, the
  owner-only tier with cross-academy isolation, and the walk-in visitor.
- **Known ceiling:** the identity write and the tenant write still commit
  separately. Nothing makes them atomic, and ADR 66's reasoning says nothing can
  without a second connection. What changed is that the ordering is now explicit
  and deliberate per mutation, the way `purge` always reasoned about it.
- Six test failures surfaced once the timeouts stopped masking them. All six were
  test bugs, not product bugs: two casing mismatches against `RANK_SYSTEMS` and
  one ISO datetime sent where a calendar date was required. The product rules
  were correct in all three cases and were left alone.
