# ADR 46 — No scheduler in v1: remove Vercel Cron

**Status:** accepted · **Date:** 2026-07-23 · **Supersedes:** the Phase-5
"frequent reminder cron cadence" framing in ADR [34](34-notifications-layering.md)
+ [40](40-manual-transfer-payments.md) (any scheduler is now post-v1, host-agnostic)

## Context

We are preparing to test v1 with a real gym (the builder's own). A vendor cost +
lock-in review (`docs/infra-costs.md`) surfaced three facts that make the two
Vercel Cron jobs a liability rather than an asset for the pilot:

1. **Vercel Cron is proprietary.** It is one of the few Vercel-only features in
   the stack (the database is Neon, not Vercel Postgres). Depending on it works
   against the project's stated goal of staying portable.
2. **Vercel Hobby forbids commercial use**, and its definition counts "any method
   of requesting or processing payment from visitors" — the dues screen. So the
   live gym likely runs **off Vercel** anyway (self-host on Railway / Render / Fly,
   or Vercel Pro). Wiring behavior to Vercel Cron pre-commits us to Vercel.
3. **Hobby caps crons at one per day**; the frequent (~15 min) cadence that class
   reminders want already needed Vercel Pro. That upgrade is not worth buying for
   a single-gym pilot where the owner is physically present.

Two crons existed (`vercel.json`):

- `/api/cron/materialize` (daily) — extends every active template's concrete
  classes to a rolling **6-week** horizon.
- `/api/cron/remind` (daily) — sends class reminders + dues reminders.

**Key fact that de-risks removal:** materialization also runs **lazily, in-request**
whenever the owner creates or edits a template (`template` router →
`materializeTemplate` on `ctx.db`), and that fills the full **42-day
(`MATERIALIZATION_HORIZON_DAYS`) horizon** on each save. So the schedule keeps
working for a multi-week test with no sweep at all. The sweep only mattered past
week 6 and for cross-academy catch-up — neither is load-bearing for one gym.

The **only** behavior that truly needed a scheduler was the reminders.

## Decision

**Ship v1 with no scheduled jobs.** (Option A of the two considered.)

- **Remove the `crons` array from `apps/nextjs/vercel.json`.** Vercel schedules
  nothing.
- **Keep both route handlers** (`/api/cron/materialize`, `/api/cron/remind`) as
  **dormant, `CRON_SECRET`-guarded seams.** They stay callable by hand
  (`curl -H "Authorization: Bearer $CRON_SECRET" …`) and are trivial to re-attach
  to any host's scheduler (system cron, GitHub Actions, Upstash QStash, a Railway
  cron) later — nothing about them is Vercel-specific. The reminder /
  materialization logic in `packages/db` + `packages/api/src/notify.ts` stays intact
  and tested; no code is deleted.
- **`CRON_SECRET` becomes optional in production** (it only protects the manual
  endpoints now). The routes still refuse to run unprotected in production if it
  is unset, so nothing regresses.
- **Materialization horizon** relies on lazy-on-save (6 weeks from the last
  template edit). Re-saving any template re-extends it. If a future, longer pilot
  ever runs the calendar dry, the cheap fix is Option B below — not a scheduler.

## Consequences

- **Reminders do not fire automatically in v1** — neither the ~2h-before **class**
  reminder nor the due-soon / overdue **dues** reminder. Both are **deferred**.
  For the pilot the owner is on the mat and can nudge in person; automatic
  reminders return with the first real scheduler, wherever we host.
- **De-locked from Vercel Cron.** This supports moving the commercial deployment
  to a self-host (Railway / Render / Fly) — which also sidesteps the Hobby
  commercial-use restriction — with no scheduler to re-plumb.
- No migration, no domain change, no test change. The `reminder_sent_at` /
  `dues_reminder_period` claim columns stay; they simply are not swept.

## Alternatives considered

- **Option B — self-heal on read.** Same removal, plus call `materializeTemplate`
  opportunistically when the owner opens the schedule, so the horizon never runs
  dry with no scheduler at all. Rejected **for now** (a write on a read path for a
  problem a live pilot won't hit — the owner edits templates well within 6 weeks).
  Kept as the documented cheap follow-up if a long pilot needs it.
- **Keep the daily crons + set `CRON_SECRET`.** Rejected: re-commits us to Vercel
  Cron for a benefit (reminders) that the present pilot does not need.
- **Buy Vercel Pro for a sub-daily cadence.** Rejected: not worth $20/mo for one
  gym; premature.
