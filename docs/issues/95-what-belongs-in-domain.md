# 95 — What belongs in `packages/domain`

**Status:** accepted · **Date:** 2026-08-25 · **Area:** `packages/domain`, `packages/api`, `apps/nextjs`, `apps/expo` · **Extends:** [94](94-one-copy-of-each-query.md) · **Refines:** [34](34-notifications-layering.md), [74](74-web-shell-seams.md)

## Context

Phase 3 of `docs/backend-architecture-epic.md`. Phase 2 moved repeated queries
into one copy each. This phase moves **rules** out of the places they were
trapped in: tRPC resolvers, and one React component.

`delivery.md` §5 has said since the start that the pure rule goes in
`packages/domain` with a test **before** the API or UI that uses it. That was
followed for new work and not for everything that grew inside an existing
resolver. This pass closes the gap and, because the same question came up in
every item, writes the line down.

## Decision

### The line

A thing belongs in `packages/domain` when **all three** hold:

1. It is a decision, not plumbing. It answers a question about the product:
   may this happen, what does this mean, what should this say.
2. It needs no I/O. No database handle, no `ctx`, no fetch. Inputs in, answer
   out.
3. Getting it wrong is a bug a user would notice.

A thing stays where it is when any of these hold:

- **It is about the database, not the product.** The reason a template
  regenerate CANCELS its future classes rather than DELETEing them is
  `ON DELETE no action` on `class_participation` and `drop_in`. That comment
  stayed in `template.ts`.
- **It is transport.** Which tRPC error code a refusal carries is not a rule.
  `notBookableMessage` returns the sentence; the resolver picks NOT_FOUND versus
  PRECONDITION_FAILED.
- **It is a query.** Those went to `packages/api/src` in ADR 94, not to domain.
  Domain has no `DbReader` and must not grow one.

### What moved

| Rule | To | Was |
|---|---|---|
| `notBookableMessage` | `booking.ts` | a 17-line ternary in `booking.book` |
| `canAssignPlan` | `payments.ts` | a comment plus a 3-clause condition |
| `autoAssignedPlan` | `payments.ts` | inside a `withTenant` callback |
| `canDecideClaim` | `payments.ts` | written twice |
| `formatMoney` | `payments.ts` | three different implementations |
| `newMemberCounts` | `stats.ts` | inline in `stats.gym` |
| `canReadCoachFigures` | `coach.ts` | inline in `stats.coach` |
| `templateEditStrategy` | `class-edit.ts` | an if/else in `template.update` |
| `dayPlan` and 7 more | `dashboard.ts` (new) | a React component body |
| `referralAssignmentState` | `referrals.ts` | a nested ternary with 3 casts |

Two hand-written filters were replaced by predicates domain already owned:
`academy.memberships` now uses `canEnroll`, `stats.drifting` now uses
`isActiveMember(m) && !isStaff(m)`. Neither was only duplication. Each was a
second, weaker copy: `canEnroll` is a deliberate whitelist so a new status is
denied until someone admits it, and the hand-written version was an allow-list
that would have silently admitted whatever came next.

### The dashboard

`dashboard-screen.tsx` held the largest concentration: eight rules reachable only
through a React render. `dayPlan` alone has seven branches and had no test.

Writing the tests found two behaviours that were true by accident and are now
true on purpose:

- `todays.every(...)` is true of an empty array, so a day with no classes rolls
  the block forward to tomorrow. Correct, and previously an accident of `every`.
- A class ending exactly at `now` counts as over. `dayPlan` and `needsAttendance`
  agreed only because both open-coded the same arithmetic. They share
  `classEndsAt` now.

### The client-side `canBook` gap, closed

Both clients reimplemented "cancelled" and "past" and neither knew about
`BOOKING_WINDOW_DAYS`. A deep link to `/class/<id>` for a class three weeks out
showed a live Book button the server then refused. Both now call `canBook` and
render `notBookableMessage`, which is the point of a rule living in a package
both clients import.

The copy changed from "You can book up to a week ahead" to "You can book up to 7
days ahead", interpolating the constant. The old sentence spelled the number as a
word, so changing `BOOKING_WINDOW_DAYS` would have left it lying.

### Money

Three implementations existed: `Intl` with a fallback on the web, plain text in
the Expo profile, and the same plain text inlined a third time in the dues
reminder a student receives. The domain version is the `Intl` one with its
fallback, so the server and the web are unchanged and
`apps/nextjs/src/lib/money.ts` is deleted.

**Expo is a visible change that could not be verified from here.** If the old
comment ("Hermes Intl is partial on native") holds, the `catch` returns exactly
today's string. If the runtime has full ICU, the app shows "€80.00" instead of
"EUR 80.00", which is an improvement. Either way today's output is the fallback,
so there is no crash path. This belongs on `docs/mobile-device-test.md`.

## Consequences

- `pnpm test` is **671 passing, 0 failing**, from 617 at GATE 2. `packages/domain`
  went 318 to 372 tests. Every rule that moved got its test **before** its caller
  switched.
- **A template edit that changes nothing now writes nothing.** The old if/else
  had no third branch, so pressing save without editing ran an `UPDATE` over
  every future class the template owns, out to the 180-day horizon.
- **`pnpm typecheck` does not cover any package's `test/` directory.** Each has
  its own tsconfig and the package script points at `src`, and vitest strips
  types without checking them. Found live: a domain test had been calling
  `buildAnnouncementMessage` with an argument its signature refuses, passing.
  Fixed the call; the gate itself is item 7.0 of the epic.
- `packages/domain` still has no I/O and no dependency on `@matops/db`. The
  three-part test above is what keeps it that way.
