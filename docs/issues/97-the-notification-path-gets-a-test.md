# 97 — The notification path gets a test

**Status:** accepted · **Date:** 2026-08-25 · **Area:** `packages/api`, `packages/notifications`, `apps/nextjs` cron routes · **Extends:** [96](96-one-definition-per-rule.md) · **Refines:** [17](17-class-cancellation-notification.md), [34](34-notifications-layering.md), [46](46-no-scheduler-v1.md), [75](75-daily-cron-on-github-actions.md)

## Context

Phase 5 of `docs/backend-architecture-epic.md`. The reminder path is the only
part of the backend that runs with nobody watching. A resolver that breaks gets a
bug report the same day. A sweep that breaks is silent: the gym just stops getting
reminders, and the first sign is a member who did not show up.

It had no test at all. Not one.

## Decision

### The push sender is a parameter

`packages/api/src/notify.ts` imported `sendPush` concretely, and `sendPush` calls
global `fetch`. That single import is what made 299 lines untestable.

`PushSender` is a structural type, `(messages: BatchPush[]) => Promise<unknown>`,
not `typeof sendPush`. A test double should not have to build a `SendPushResult`
to say "I was called with these two tokens".

The parameter sits on `deliver` with `sendPush` as its default, and reaches the
outside through `SweepOptions`, which extends the `ClaimRemindersOptions` the cron
route already passes. **The sweeps gained no new parameter.**

The other five notify functions were left alone. Their routers call them through
`ctx.afterCommit`, so injecting a sender there means injecting it into the tRPC
context, which is a much larger change than this. What they have is ADR 94's
`class-notify.test.ts`, which asserts on the inbox rows, and the inbox is the
durable copy by design. Add the parameter when a test needs it.

### The reminder SQL is now tested, and the domain twin stays deleted

ADR 96 deleted `isInReminderWindow` and `reminderRecipients`: tested seven ways,
never called. `packages/api/test/reminder-sweep.test.ts` tests what actually runs.
Eleven cases. What they pin down:

- A due class is claimed once, both booked students get a push and an inbox row,
  and a second run right after sends nothing.
- The window has two sides. A class 600 minutes out is not claimed, and neither is
  one that started 30 minutes ago.
- A class with no live booking is skipped, and so is one whose only booking was
  cancelled.
- A cancelled class, a soft-deleted class, and a class inside a **soft-deleted
  academy** are all left alone. The last is the only guard in that query
  protecting a gym that has closed.
- `limit` bounds a run and the leftovers wait for the next tick.
- Dues: due-soon claims, not-yet-due does not, an **archived member is never
  billed**, and an overdue member gets different words from one merely due soon.

Two facts the tests had to be told, both load-bearing and neither asserted before:
`class.id` is a uuid, and `class_participation.student_id` is a **user** id, not a
member id. The second is why `deliver` can hand it straight to `getPushTargets`.

### The claim-then-send gap is described, not closed

`claimDueReminderClasses` stamps `reminder_sent_at` and then the send happens. A
crash in between loses that reminder for good.

The test makes an exploding sender and asserts what survives: **the inbox row is
written, the class stays stamped, and the retry sends nothing.** So a push outage
costs the push and not the message, because `deliver` writes the inbox row first
and on purpose.

Closing the gap means choosing between at-most-once and at-least-once. Stamping
after the send turns a crash into a duplicate reminder for everyone in that batch,
and two concurrent sweeps into two pushes. The current order is a choice, not an
oversight, and changing it is a product call about which failure a gym would
rather have. Out of scope for a restructure. It is written down now.

### One cron guard, in `packages/api`

The shared-secret block was copied into both `/api/cron/*` routes, so the two
could drift while both looked right.

`cronVerdict` lives in `packages/api/src/cron-auth.ts`. Not in `packages/domain`,
because "does this bearer token match" is not a product rule by the ADR 95 test.
Not in `apps/nextjs/src/lib`, because that app has no test runner and an untested
auth guard is what this item exists to stop.

It returns a verdict, not a `Response`; the route maps it. That keeps the branch
worth getting right statable in one line: **no secret plus production is a
refusal, no secret plus dev is fine.** Written twice, tested zero times, on the
two endpoints that run cross-academy on the base connection outside the tenant
seam.

The test also pins the near misses a hand-rolled compare gets wrong: lowercase
`bearer`, a trailing space, and the bare secret with no prefix. All 401. Behaviour
is otherwise unchanged; the old block and the new one agree case for case.

### Resend is not dead

The plan called the Resend adapter dead. It is not. `sendEmail` has one caller,
`packages/auth/src/index.ts`, and it is the sign-in magic link. Nothing deleted.
The transport package's docblock now says which sender carries what, and that **no
gym message goes out by email** (v3.8, ADR 77). The remind route's docblock had
said the dues sweep would "push + email them"; it says push.

## Consequences

- `pnpm test` is **707 passing, 0 failing**, from 690 at GATE 4. All 17 are new:
  11 on the sweeps, 6 on the cron guard.
- `packages/api` gains a `./cron-auth` export path.
- `sweepDuesReminders` is exported. It is half of what `runReminderSweep` does and
  the test has to be able to run it alone.
- `claimDueReminderClasses({ ...opts, exec })` became an explicit three-field
  call. Spreading `SweepOptions` would hand a `send` function to the db package,
  which is the layering ADR 34 set up to avoid.
- `pnpm typecheck` still does not cover any `test/` directory. Epic item 7.0 is
  what fixes that.
