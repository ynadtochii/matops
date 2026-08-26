# 93 — The safety pass before the pilot

**Status:** accepted · **Date:** 2026-08-25 · **Area:** `packages/api`, `packages/db`, `apps/nextjs` · **Amends:** [13](13-booking-write-atomicity.md) · **Extends:** [33](33-tenant-seam-enforcement.md), [60](60-backend-review-fixes.md), [92](92-identity-writes-leave-the-tenant-transaction.md)

Numbered 93 for the same reason 92 was numbered 92: ADRs 85 through 91 belong to
the frontend performance branch, which has not merged to `main`.

## Context

Phase 1 of `docs/backend-architecture-epic.md`. Five things that can fail
quietly, found by reading the code rather than by a bug report. None of them is
a new feature. Each one is a promise the code was not keeping.

## Decision

### The tenant transaction now actually rolls back

`docs/issues/13` line 67 has said since session 10 that a failed second step
rolls back the first, "because both run in the one RLS transaction". The SQL was
right. The middleware above it was not.

tRPC does not let a thrown resolver error escape a middleware. `next()` catches
it and returns `{ ok: false, error }`. `enforceTenant` returned that object, so
the `withTenant` callback resolved normally and Postgres committed. Every write
made before the throw survived, including the half of a two-step mutation that
was meant to be undone.

`enforceTenant` now rethrows `attempt.error` rather than returning the failed
result. Postgres sees an exception and rolls back. tRPC's own `callRecursive`
catches the rethrow one frame out and rebuilds the identical
`{ ok: false, error }`, and `getTRPCErrorFromUnknown` returns an existing
`TRPCError` untouched, so the client sees exactly the same error as before.

The plan for this asked for a private marker thrown inside the callback and
caught outside. That version was written and thrown away: typing the caught
result as `Awaited<ReturnType<typeof next>>` makes the context inference
circular, and `ctx.db` and `ctx.academyId` collapse to `any` in every router.

This does **not** make an identity write and a tenant write atomic. Those still
commit separately, as [92](92-identity-writes-leave-the-tenant-transaction.md)
says they must.

### RLS coverage is checked structurally, not per table

Every tenant table had its own leak test. Nothing checked that a **new** table
got one. `packages/db/test/rls-coverage.test.ts` asks Postgres: every `public`
table with an `academy_id` column has `relrowsecurity` and at least one row in
`pg_policies`.

One table is exempt, `academy_invite`, and the reason is the map value in the
test, not a comment: the public join screen resolves a token with no active
academy, so a policy on `app.academy_id` would match nothing (ADR 28). What
protects it instead is migration `0020`, which revokes every `matops_app` grant
on it. The guard asserts that too, so the exemption is self-justifying. It also
fails if an exempt table later gains a policy, or if a name in the list stops
existing.

`member` is **not** on the list, because it never matched: Better Auth names its
column `organization_id`. It is an identity table and out of scope by design.

### A Postgres error no longer speaks to the user

An uncaught throw reached the client carrying the driver's own words, which for a
Postgres error name the table, the column and the constraint. tRPC drops `stack`
outside dev but never touches `message`.

`errorFormatter` now passes `shape.message` through `publicErrorMessage(code,
message)`, which returns a fixed string for `INTERNAL_SERVER_ERROR` in
production. Two routers throw that code deliberately, `academy.create` and
`payments.createPlan`, both saying "Could not create the X". Both are server
faults with no user action attached, so replacing them is right.

`payments.claim` had a bare `catch {}` that told the user a payment was already
awaiting confirmation. An RLS denial, a dropped connection and a check-constraint
failure all became that same friendly message. It now rethrows anything that is
not `23505`. The `23505` reader moved out of `referral.ts` into
`packages/api/src/pg-error.ts`, unchanged, because it has two callers now.

### Four indexes for reads that had none

Migration `0027`. Three of the four serve cross-academy cron sweeps, which is
exactly why the existing academy-first indexes could not help them:
`ct_sweep_stale` on `class_template(status, generated_until) WHERE deleted_at IS
NULL`, `cl_reminder_due` on `class(starts_at) WHERE reminder_sent_at IS NULL AND
deleted_at IS NULL`, and `md_by_next_due` on `member_dues(next_due_at)`.

Both scheduling indexes are partial on purpose. A class leaves `cl_reminder_due`
once its reminder is sent, so the index stays the size of the pending set instead
of growing with history for the life of the gym.

The fourth is not a cron. `member_by_user` exists because
`listAcademiesForUser` filters `member.user_id` alone and `member_by_org_user`
leads with `organization_id`. That query runs on every academy switch and every
mobile sign-in.

### Four reads are bounded, and one deliberately is not

`booking.mine` (300), `referral.history` (200), `note.forMember` (200) and
`payments.claims` (500). All four already order newest-first, so the cap drops
the right end. Each ceiling is a named constant with a `ponytail:` comment
saying what is lost and what to do instead.

`attendance.list` was on the plan's list and should not have been. It reads the
participants of one class, so it is bounded by how many people fit in a room, not
by time, and it returns `attendanceCounts(rows)` computed from the same rows. A
cap would make the present and absent counts lie before it ever protected
anything.

### The CORS wildcard is gone

`Access-Control-Allow-Origin: *` on the tRPC route, with the `OPTIONS` handler
that served it. There is no browser cross-origin client: `apps/expo` declares
`ios` and `android` only, React Native's fetch is not CORS-bound, and the Next
clients are same-origin so they never preflight. There was no
`Access-Control-Allow-Credentials` either, so no browser would have sent the
session cookie cross-origin. It granted nothing and advertised the endpoint.

## Consequences

- `pnpm test` is **604 passing**, from 589 at the end of Phase 0. Fifteen new:
  two for the rollback, eight for the error shape, five for RLS coverage.
- The rollback test targets the middleware contract through a two-procedure probe
  router, not one mutation's incidental behaviour, so it survives router
  refactors. `packages/api/test/helpers.ts` gained `ctxFor` so a test can build a
  caller for its own router.
- **Migration `0027` is written and not applied.** It needs
  `pnpm -F @matops/db migrate` against Neon on the next deploy. All four are
  `CREATE INDEX` without `CONCURRENTLY`, which briefly locks writes on the table.
  At pilot size that is milliseconds.
- Both structural guards were proved to bite before being kept. Commenting out a
  `CREATE POLICY` in `0017` fails the policy test by name; commenting out its
  `ENABLE ROW LEVEL SECURITY` fails the RLS test. Reverting the rollback rethrow
  fails both of its cases.
