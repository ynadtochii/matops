# 78 — One fan-out, one horizon owner, and the seat rule in the domain

**Status:** accepted · **Date:** 2026-08-23 · **Area:** `packages/api`, `packages/db`, `packages/domain`, `packages/notifications`, `.github/workflows` · **Supersedes:** the `healHorizon` half of [76](76-pilot-blockers.md) and the "materialize stays unscheduled" half of [75](75-daily-cron-on-github-actions.md). Amends [77](77-notification-center.md); no behavior change for a member, no migration.

## Context

An architecture read of the v3.6/v3.7 wave, before any of it is committed. Four
places where the new code was doing the right thing in the wrong shape. Nothing
here is a bug report: every item ships working. The cost is in what the next
change to these files will run into.

- **The notification fan-out was written twice.** ADR 77 added `deliverEach`
  next to the existing `deliver` in `packages/api/src/notify.ts`, because the
  dues sweep gives every recipient a different message and the class events give
  everyone the same one. Both did the same four steps in the same order: write
  the inbox rows, resolve push targets, push, batch the email, count what the
  transport refused. The copies had already drifted inside one wave. `deliver`
  put every recipient's tokens in one `sendPush` call and `deliverEach` made one
  call per person. `deliver`'s failure path returned the count of recipients as
  the count of undelivered email, although opt-outs and members with no address
  had already been subtracted, and that number is what turns the daily workflow
  red. `sentBy` and `emailOptOuts` existed on the shared `Delivery` type and were
  silently ignored by one of the two readers of it.
- **An announcement rule was living in the transport helper.** `emailOptOuts`
  was an optional `Set<string>` on `Delivery`, set by one of six callers, which
  made the generic fan-out the place that knows what gym-news-by-email means.
- **The schedule read was materializing.** ADR 76 put `healHorizon` in front of
  `class.week` and `class.mine`, so a read now selected every stale template and
  materialized each one, serially, before returning a row. `runMaterialization
  Sweep` does the same job with a row limit and a soft time budget, because it
  runs where a long run costs something. The read path got the job with neither.
  ADR 76 gave a reason for not reusing the sweep: it closes over the module-level
  `db`. That is one optional parameter, not a design constraint. Meanwhile the
  horizon rule was being enforced in three places (on template save, on read, in
  the sweep) and ADR 75 had already marked one of the three dead by comment.
- **The one membership rule with a security consequence had no unit test.**
  `requireOwnerForCoachSeat` stopped an instructor from approving a pending
  instructor, which is the escalation `setRole` is owner-gated against. It was an
  imperative throw in the router, while `canApprove`, `isPendingCoach` and
  `wouldLeaveOwnerless` sit pure and tested in `packages/domain`.

## Decision

### One fan-out, per recipient

`deliver(items: PersonalDelivery[])` is the only fan-out. `each(userIds, msg)`
expands one message across a list for the five callers that want that. Both
shapes are the same job: an addressed list per channel, then one batched call per
channel. `deliverEach` is gone.

`sendPush` changed to match `sendEmailBatch`: it takes already-addressed messages
(`BatchPush[]`, one token and one text each) and chunks them at Expo's 100. Every
mix now costs `ceil(tokens / 100)` calls instead of one call per class or one per
person. The transport's only caller was `notify.ts`, so the old signature bought
nothing.

The failure count is now the number of items that wanted an email, which is the
honest number when the target lookup is what failed.

### Who gets the email is an announcement rule

`emailOptOuts` is off `Delivery`. `notifyAnnouncement` builds the recipient list
and sets each item's `email` itself: opted out means no `email` on that item, and
the inbox row and the push go out regardless, as before. The transport stopped
knowing what a preference is.

### The cron owns the horizon, the read does not

`healHorizon` is deleted. `class.week` and `class.mine` are reads again, and
both went back to returning the Drizzle builder unawaited.

`runMaterializationSweep` takes an optional `exec`, defaulting to the base `db`,
and `.github/workflows/cron.yml` curls `/api/cron/materialize` on the same daily
tick as the dues sweep, in the same guarded step. This is the sweep ADR 46
removed for being a Vercel lock-in; the objection was the host, and the host is
GitHub now, so it comes back at no cost. A gym stays ahead through lazy-on-save
as it always did; the sweep is what stops the calendar of a gym nobody edits from
running dry, which is exactly the case ADR 76 was worried about.

The injected `exec` is also what makes the sweep testable:
`packages/db/test/materialize-sweep.test.ts` replaces
`packages/api/test/materialize-on-read.test.ts`, covering the same guarantees
(fills an unmaterialized template, advances the cursor to the horizon,
idempotent, ignores a paused template) plus the bound the read path never had.

**What this trades away:** the horizon now heals once a day instead of on the
next read. A gym would have to go 42 days without a template edit *and* have the
workflow broken for a member to see a short week. The workflow is `curl -fsS`, so
that failure is a red run, not silence.

### The seat rule is a pure function

`canDecideSeat(actor, member)` in `packages/domain/src/membership.ts`: true
unless the seat is a pending coach and the actor is not an owner. The router
keeps its throw and reads the decision from the domain, so the escalation rule is
covered by `packages/domain/test/membership.test.ts` next to the rules it belongs
with, at no setup cost.

### Two smaller moves

- `notificationKindLabel(kind)` is exported from `@matops/domain` and
  `NOTIFICATION_KIND_LABEL` is now private to it. Both clients had the same
  four-line fallback wrapper copied around the same map.
- `clientIp(headers)` is out of the `rateLimited` middleware and in
  `packages/api/src/rate-limit.ts`, where the rest of the limiter is tested. It
  carries the policy worth asserting: the first `x-forwarded-for` entry, and one
  shared bucket when the header is missing or blank, which fails closed.

## Consequences

- One notification path to change, and the push/email batching is one rule.
- `/api/cron/materialize` is live for the first time. `CRON_SECRET` guards it as
  before, and it is still callable by hand.
- ADR 76's `healHorizon` section and ADR 75's "materialize is not scheduled"
  paragraph describe code that no longer exists. Both stand as written; this note
  is the supersede.
