# 99 — Cover the procedures a pilot gym walks first

**Status:** accepted · **Date:** 2026-08-25 · **Area:** `packages/api`, `packages/db`, `packages/domain` (tests only) · **Extends:** [98](98-fewer-round-trips-and-one-invalidation-rule.md) · **Refines:** [60](60-backend-review-fixes.md)

## Context

Phase 7 of `docs/backend-architecture-epic.md`, the last one. 46 of 104
procedures had no test, and the gaps were not random: the whole onboarding funnel
was untestable, the one insert a stranger can make had nothing on it, and the
three procedures that can wipe a gym's calendar were unguarded.

No production code changed in this phase except five `package.json` scripts.

## Decision

### The typecheck gate now covers the test directories

`pnpm typecheck` ran each package's own script, which pointed at `src`. The
`test/tsconfig.json` files were never run by any gate, and vitest strips types
without checking them, so a test could call a function with arguments its
signature refuses and still pass. That happened, and was found by hand during
Phase 3.

Fixed in the package scripts, not by merging the tsconfigs: the split exists to
keep `build` off the test files.

```
"typecheck": "tsc --noEmit --emitDeclarationOnly false && tsc -p test/tsconfig.json --noEmit"
```

**Verified by breaking it on purpose**, because a gate that passes proves
nothing, and this item exists precisely because a passing gate was covering
nothing. A deliberate `const _proof: number = "not a number"` in a domain test
now fails with `TS2322`, where before it would have been silently stripped.

### `authApi` is wired in the test harness

The Proxy that threw on every access is why the onboarding funnel was untestable.
The routers make exactly **four** Better Auth calls, so `fakeAuthApi` implements
four and still throws on anything else, so a router reaching for an untested call
fails loudly.

**It reproduces the plugin's hooks, or the tests would be testing the
stand-in.** `beforeCreateOrganization` assigns `publicCode` (NOT NULL since
`0010`, and it cannot be set afterwards) and `afterCreateOrganization` flips the
creator's membership to active. Both reuse the real `@matops/db` helpers rather
than reimplementing them.

The harness also gained an optional `headers` argument, because the rate limiter
keys on `path:ip` and every test ctx had an empty `Headers`. Without it the
middleware could only be tested at unit level.

### What is now covered

**The onboarding funnel** (14 tests). Start a gym makes the creator a working
owner in one step with a six-digit code. The invite join lands `pending` with the
academy role **withheld** on `invited_role` rather than granted, which is the ADR
20/23 rule that a missed status check must not become a role grant. A second tap
is idempotent. **A rotated token stops working and its replacement works**, which
is the entire point of rotation and was unverified. Join by code, and switching
academies, including that a foreign academy id and a missing one give the same
answer.

**The public surface** (13 tests). `dropIn.submit` is the one insert a stranger
can make with no account, from a poster on a wall. An unknown academy is
`NOT_FOUND` with nothing written; a lead does not leak to an instructor. **The
rate limit is driven through a real procedure**: six submits from one address,
the sixth refused; a second address unaffected; a different path from the same
address still working.

**The destructive schedule writes** (12 tests). `template.delete` cancels future
generated classes, keeps past ones, leaves one-offs alone, and preserves booking
rows so history survives. `template.rebuild` is owner-only and never touches a
past class or a hand-entered one-off; `rebuildPreview` names the damage first.
`class.cancel` notifies the booked student, and cancelling twice is `NOT_FOUND`
**and sends nothing**.

**The attendance mutations** (14 tests). The 14-day backfill window is enforced
on both sides. `markAll` skips a cancelled booking and an already-absent student.
A walk-in gets `booking_status: none` and **`booking_count` stays 0**.
`addVisitor` writes `consent: false`, the deliberate rule that a gym cannot tick
a consent box for someone who is not at the keyboard.

**`stats.dashboard`** (8 tests), whose content had no test even before Phase 6
folded it. **`referral.correct`** (6). **`local-date`** (9), including the DST
jump that every academy-zone statistic depends on.

### The erase is guarded structurally

`erase.ts` carried a comment saying "a table left out of this list survives the
erase" and nothing checked it. `packages/db/test/erase-coverage.test.ts` asks
Postgres for every table with an `academy_id` column and requires each one to be
either deleted by `eraseMemberData` or carry a written exemption. Stale
exemptions fail too, so the list cannot rot.

It found no defect: every table holding member data is named. What it buys is
that the next tenant-scoped table cannot be added without someone deciding
whether erasing a member should remove its rows. That matters because this is how
an owner answers a data-deletion request.

## Consequences

- `pnpm test` is **812 passing, 0 failing**, from 733. **+79 tests**, in seven new
  files.
- `packages/api` goes from 185 to 252 tests.
- No production code changed except five `typecheck` scripts.
- Two of my own tests were wrong about the code and the code was right, and both
  became better tests: the drop-in visit counter counts a **new class**, not a new
  form submit, and `attendanceRate` is a ratio rather than a percentage.
- **Not covered, deliberately:** the concurrent race in the two `FOR UPDATE`
  never-ownerless transactions. PGlite is a single connection, so the race cannot
  be reproduced there. The single-caller guard is covered by
  `membership-lifecycle.test.ts`.
