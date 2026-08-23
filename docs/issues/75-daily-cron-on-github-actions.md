# ADR 75: A daily cron on GitHub Actions, dues reminders only

**Status:** accepted · **Date:** 2026-08-22 · **Supersedes:** the "v1 ships no
scheduled jobs" decision in ADR [46](46-no-scheduler-v1.md) (its removal of
**Vercel Cron** stands; only "no scheduler at all" is replaced)

## Context

ADR 46 removed both Vercel Cron jobs before the pilot: Vercel Cron is
proprietary, Hobby forbids commercial use, and Hobby caps crons at one per day.
Both route handlers stayed as dormant, `CRON_SECRET`-guarded seams. The cost of
that decision is in ADR 46's own consequences: **dues reminders never fire**. For
a pilot whose whole payment loop is manual bank transfer, the owner has to chase
every member in person.

Two things changed the calculus:

1. **The scheduler does not have to be the host.** A GitHub Actions `schedule:`
   workflow is free, already configured in this repo, and calls an HTTPS endpoint.
   It re-locks us to nothing, which was ADR 46's real objection to Vercel Cron.
2. **Cron frequency is a Neon bill, not a cron bill.** Neon Free sleeps after 5
   minutes idle and grants ~100 compute-hours/month (`docs/infra-costs.md`). Each
   ping wakes the compute for at least 5 minutes, so a 15-minute cadence keeps the
   database awake permanently (~730 h/month) and **hard-suspends** it. Daily costs
   ~2.5 h/month. The cheap scheduler is the rare one.

## Decision

**One scheduled job: `.github/workflows/cron.yml`, daily, one curl.**

- `/api/cron/remind` → **dues reminders**. The sweep claims each member due
  within `DUE_SOON_DAYS` (3) or already overdue and not yet reminded this period,
  stamping `dues_reminder_period` as the `YYYY-MM` of the due date. So a member
  gets **at most one message per billing period**, and a member who stays overdue
  is not nagged again. Daily is the correct cadence: the claim is per period, not
  per tick.
- `/api/cron/materialize` → **not scheduled.** Two mechanisms already fill the
  horizon: lazy-on-save (every template edit fills 42 days) and the schedule read
  itself (`healHorizon`, ADR 46 Option B). What would be left for a sweep is an
  academy that nobody edits **and** nobody opens, which is an academy nobody
  misses. The route stays a dormant, callable seam, exactly as ADR 46 left it.
- The route stays `CRON_SECRET`-guarded, and that token is the **only** GitHub
  repo secret. The production URL is written into the workflow, because a domain
  is public and hiding it in a secret buys nothing while adding a thing to set up.
  `curl -fsS` means a failed sweep fails the workflow, which is free monitoring.
- **09:00 in Lisbon**, the pilot's time zone. GitHub cron is UTC-only and Portugal
  moves between UTC+0 and UTC+1, so **both** hours are scheduled (`0 8` and `0 9`)
  and one guard line keeps whichever tick is 09:00 local today. A skipped tick
  exits 0, so a red run always means the sweep itself failed. If GitHub delays a
  tick past the hour, the guard drops it and the sweep runs tomorrow: the claim is
  per billing period, so no reminder is lost, only moved a day.

**Class reminders stay off**, even though they ride the same route. The route
passes `leadMinutes: 0`, which makes the claim window empty
(`startsAt > now AND startsAt <= now`), so no class is claimed and **no class is
stamped**, so turning them on later loses nothing. Three reasons:

- The phone app already schedules them **on the device** (ADR
  [54](54-local-class-reminders.md), same 2h lead). The server sweep only adds
  web-only students.
- The benefit is fewer no-shows, and **no-show tracking is a v1 non-goal**, so it
  cannot be measured.
- It is the highest annoyance per unit of value in the set: a push about a class
  the student chose and booked. And the cadence it wants (~15 min) is exactly the
  one that suspends the Neon Free database.

## Consequences

- **Dues reminders fire automatically**, push + email, due-soon and overdue.
  This is the first behavior in the product that reaches a student with no human
  action. Spec §4 and O7/R.1 stop saying "does not fire in v1".
- **No new vendor, no new dependency, no cost.** The workflow is one job. Still
  portable: the routes take a bearer token over HTTPS, so any scheduler anywhere
  can drive them.
- **GitHub's scheduler drifts** by minutes (sometimes more) under load and can
  skip a tick. The sweep is idempotent and the claim is per billing period, so a
  dropped tick moves a reminder to the next day and never loses one. It does mean
  this is not a mechanism to build a time-sensitive feature on.
- **Neon Free stays inside its compute budget** at this cadence. Anything
  sub-hourly needs a paid Neon plan first, not a different cron.
- No migration, no domain change, no schema change. One line changed in the
  reminder route, and `CRON_SECRET` is now genuinely required in production
  rather than optional in practice.

## Alternatives considered

- **Vercel Cron.** Rejected again, for ADR 46's reasons, unchanged.
- **Upstash QStash / cron-job.org.** A new vendor and an account to manage for
  what a YAML file in this repo already does.
- **Neon `pg_cron`.** Needs an always-on compute, which is the expensive part.
- **Run the class sweep anyway on the daily tick.** Rejected: it would send a
  reminder to whichever classes happened to fall in the next 2 hours and nothing
  to the rest, which reads as broken rather than as a feature.
- **Owner alert when a join request arrives.** Higher pilot value than any cron
  here, but it is **event-driven**, not scheduled: a call beside the existing
  `notifyMembershipApproved`. Out of scope for this ADR; not built.
