# 51 — Dev seed module (marker-scoped, attaches to your real user)

**Status:** accepted · **Date:** 2026-07-24 · **Area:** `@matops/db` dev tooling

## Context

Clicking through the apps to hit every UI state (roster with pending/suspended
members, payment dots across paid/due-soon/overdue, attendance history, belts,
drop-in leads) is slow to set up by hand. We want one command to load rich demo
data and one to remove it — and to test as the **real user we sign in as**, not a
fake account.

## Decision

A **marker-scoped, deterministic-id** seed under `packages/db/src/seed/`, in two
modes:

- **`fill <code>` / `clear <code>` (the primary mode)** — add fake students to a
  **real** academy (yours) so it looks alive, then remove only them. Fakes reuse
  the academy's **existing** plans (dues) and **existing** classes
  (bookings/attendance); the seed adds no plan/class/template of its own.
- **`up` / `down` / `reset`** — build two fully isolated fake academies attached
  to your real user (owner of one, student of the other).

`status [code]` reports both.

Two facts about the schema make this simple:

1. **Every tenant table carries `text academy_id`** (that is how RLS works). So the
   academy id is the natural teardown key — remove a demo academy = delete every
   row whose `academy_id` is a seed academy. No per-row ledger table.
2. **Auth rows the seed creates use a `seed_` id prefix.** Teardown removes fake
   users by that prefix. The prefix *is* the marker.

**You are a real user, not a seed row.** In the fake-academy mode the seed looks
you up by email and attaches memberships (owner of "ALPHA", student of "BETA")
using `seed_`-prefixed member ids; it never creates or deletes your `user` row.

**Fill mode teardown is by member, not by academy.** `fill <code>` writes into a
**real** academy, so `clear` must NOT delete by `academy_id` (that would take real
data). Instead it deletes only rows whose member/user id is `seed_`-prefixed
(`class_participation` by `student_id`, dues/claims/ranks/notes by `member_id`,
members by `organization_id + seed_` id, users by the academy's `seed_user_fill_*`
prefix). `booking_count` on each real class is **recomputed** from its confirmed
bookings on both fill and clear, so it stays correct as fakes come and go. Your
academy, its plans, templates, real classes, and real members are never touched.

**Architecture:**
- `registry.ts` — the two demo academies, id helpers, the `seed_` marker, the
  email resolver, one soft `NODE_ENV=production` guard (`SEED_ALLOW=1` overrides).
- `data.ts` — **pure** dataset builder (no I/O, no clock), given `now` + an
  injected id generator. Shaped to light up every UI state. Unit-tested.
- `run.ts` — IO layer; inserts on the base connection with `academy_id` set
  explicitly (same pattern as the materialize sweep / drop-in helpers, ADR 12),
  reuses `materializeTemplate` for future classes. Executor is **injected** so the
  module has no connection side effect and is testable against PGlite.
- `teardown.ts` — `removeAll` (child→parent deletes scoped to seed ids) + `seedStatus`.
- `augment.ts` — `fillAcademy` / `clearAcademy` / `academyFakeCount` for the
  fill-a-real-academy mode (member-scoped teardown + `booking_count` recompute).
- `cli.ts` — arg parsing, email→user lookup, up/down/reset/status/fill/clear.

`up` refuses to double-seed (a few tables have no natural unique key); `reset`
rebuilds. Deterministic org ids make `up` idempotent at the academy grain.

## Alternatives rejected

- **Ledger table** recording every inserted `(table, pk)` — precise but needs a
  migration + bookkeeping the uniform `academy_id` scoping already gives for free.
- **Better Auth server API** to create users/orgs so hooks fire — drags the `api`
  layer into `db` (wrong direction) and runs one org at a time; direct inserts
  with an explicit `public_code` reach the same end state.
- **Heavy prod separation** (host allow-list, reserved code band) — there are no
  production academies, so a marker-scoped teardown is already safe. Kept only one
  cheap `NODE_ENV` check.
- **Truncate-all teardown** — would nuke real dev data. Rejected.

## Verification

- Pure builder coverage (`test/seed-data.test.ts`) — every member status, the
  three payment dots, present/absent/walk-in attendance, two rank disciplines, and
  determinism.
- Roundtrip safety (`test/seed-teardown.test.ts`) — seed → teardown against PGlite
  proves the invariant: **all seed rows gone, a real user + a real academy
  inserted alongside survive untouched.**
- Fill safety (`test/seed-fill.test.ts`) — fill → clear against PGlite proves the
  fill mode adds fakes onto a real academy's own plans/classes and then removes
  **only** them: the real owner, real student, real plan, real class + its real
  booking, and `booking_count` all end exactly as they started.

Verified live on Neon: `seed fill 860275` populated the "grapplers" academy with
20 demo students (+ dues, 70 bookings/attendance, ranks, a pending claim).

No product behavior changed (dev tooling only), so `spec.md` is unchanged.
