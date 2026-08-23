# 76 — Pilot blockers: the head coach runs the desk, the calendar heals itself, and the wall poster has a brake

**Status:** accepted · **Date:** 2026-08-22 · **Area:** `packages/api`, `packages/auth`, `apps/nextjs` · **Extends:** [46](46-no-scheduler-v1.md), [64](64-invite-roles-and-coach-queue.md), [72](72-sentry-error-tracking.md), [74](74-web-shell-seams.md)

## Context

The pilot plan (`docs/pilot-plan.md`) is an unpriced run at two or three friends'
academies, starting 5 September, with nobody from matops in the room. That last
part is what makes this list what it is. Every item below is either "a stranger
sees something broken" or "you cannot see that it broke".

Five problems, found by reading the code against that plan.

- **Sentry was installed on the wizard's defaults.** ADR 72 wired the DSN and
  the error boundaries, and left `tracesSampleRate: 1`, `enableLogs: true` and
  10% session replay in all three configs. The free Developer plan is 5,000
  errors and 50 replays a month. Traces and logs are separate quotas on the same
  plan. Three gyms will not come near the error limit; the wizard defaults can
  exhaust the rest of it in a week, and the failure mode is silence exactly when
  you need the opposite.
- **The calendar runs dry at week six and says nothing.** Classes are
  materialized only when a template is saved, 42 days ahead
  (`MATERIALIZATION_HORIZON_DAYS`). ADR 46 removed the scheduler. A gym that
  sets up its week in September and does not touch a template again sees an empty
  October, with no error, no log line, and no reason to call you. ADR 46 named
  this fix in its own consequences and deferred it.
- **The join QR goes on a public wall.** `dropIn.submit` is an unauthenticated
  insert, `invite.resolve` is an unauthenticated token lookup, and magic-link
  send spends a Resend quota shared by every academy. None had a limit. One
  bored person with the poster could fill the lead table or break sign-in for
  every gym at once.
- **The drop-in form collects a stranger's name, phone and email behind one
  sentence.** "OK for the gym to contact me about training", with no link to
  anything. Friends' gyms in the EU means GDPR, and matops is the processor.
- **In most gyms the head coach runs the desk, not the owner.** Approving a
  member was `ownerProcedure`, and `/members` was an owner route. At a friend's
  gym where the owner teaches four evenings a week, that bites in week one.

## Decision

### Sentry sampling is capped for the free plan

`tracesSampleRate: 0` and `enableLogs: false` in all three configs;
`replaysSessionSampleRate: 0` with `replaysOnErrorSampleRate: 1.0`, so a replay
exists when something breaks and never otherwise. `ignoreErrors` drops browser
extension noise and aborted fetches. `sampleRate` stays 1.0: at three gyms every
error is worth having.

The two limits that will bite before the quota does are the plan's, not ours:
**one seat** (no second person, no gym-owner access) and **30-day retention** (a
bug reported "a couple of months ago" is already gone). Both are reasons to open
Sentry daily rather than weekly.

### The schedule read heals its own horizon

`healHorizon(db, to)` in `packages/api/src/router/class.ts`, awaited by both
`class.week` (staff) and `class.mine` (enrolled) before they read. It selects
the academy's active, non-deleted templates whose `generated_until` no longer
covers the window being asked for, and runs the existing
`materializeTemplate(ctx.db, template)` on each.

Three things make this the cheap version:

- **It reuses what exists.** `materializeTemplate` already takes an `Executor`,
  is bounded by the horizon, and is idempotent through
  `UNIQUE(template_id, starts_at)` + `onConflictDoNothing`.
- **It stays inside the tenant seam.** RLS scopes the template select to the
  active academy, so there is no academy filter to forget and no service-role
  connection to open. `runMaterializationSweep` could not be used here: it closes
  over the module-level `db`, and opening a second pool connection inside
  `withTenant` checks out a connection for the whole transaction and deadlocks
  outright on single-connection PGlite.
- **It costs nothing when nothing is wrong.** On a healthy academy the select
  returns zero rows and no write happens.

Both resolvers became `async`, which they were not: they returned the Drizzle
builder unawaited.

**Known ceiling:** two concurrent readers can both materialize the same
template. The unique index absorbs it, so the result is correct and only the
work is duplicated. There is no claim and no advisory lock, and there cannot be
one on a transaction-mode pooler (ADR 21).

`/api/cron/materialize` stays a dormant, manually-callable seam. ADR
[75](75-daily-cron-on-github-actions.md) schedules `/api/cron/remind` daily for
dues and deliberately leaves materialize unscheduled, because the read path now
covers it and a sweep would only ever reach an academy nobody edits and nobody
opens.

### Rate limiting, in memory, on both public surfaces

Two surfaces, because they are two different servers.

- **Better Auth** gets a `rateLimit` block: 60 requests per minute per IP, with
  `/sign-in/magic-link` at 5 per 5 minutes and `/magic-link/verify` at 20 per
  minute. Better Auth enables rate limiting in production only, so this is
  invisible in `pnpm dev:next`.
- **tRPC** gets `packages/api/src/rate-limit.ts`, a fixed-window counter in a
  `Map`, and a `rateLimited(max, windowMs)` middleware keyed on procedure path
  plus the first `x-forwarded-for` entry. Applied to `dropIn.submit` (5 per 10
  minutes), `dropIn.academyInfo` and `invite.resolve` (30 per minute).

**Known ceiling, and why we accept it:** storage is per process. On Vercel Fluid
compute a scaled-out instance keeps its own counters and a cold start forgets
them, so this is a flood brake, not a global ceiling. The alternative
(`storage: "database"`) needs a `rateLimit` table, a migration, and a schema
export, to defend three gyms against a threat that is one person with a phone
camera and a grudge. The upgrade path is a table, and it is a day's work when a
gym needs it.

No new dependency. Upstash, Redis and `lru-cache` are all absent from this repo,
and adding one to count to five would be the wrong trade.

### A privacy page, linked from every form that collects a stranger's data

`/privacy` is a plain server component outside the `(app)` group, so it is
public by existing: there is no middleware and no shared public layout to
change. It names the controller, says the academy controls its members' data and
matops processes it, lists what is stored and why, names the actual
subprocessors (Neon, Vercel, Resend, Sentry, Expo, and Google only if you sign in
with Google), and says how to get a copy or a deletion.

It ships with `[ENTITY]`, `[ADDRESS]` and `[CONTACT EMAIL]` **visible in the
page**. A half-true privacy notice is worse than an obviously unfinished one, and
a visible placeholder cannot be forgotten before the pilot goes live.

Linked from the drop-in consent line and from the join form. On the drop-in
form the link sits in a sibling paragraph, **outside** the `<label>`: a link
inside a label toggles the checkbox when clicked.

### The head coach runs the desk

`approve`, `reject`, `members` and `memberHistory` move from `ownerProcedure` to
`staffProcedure`. `rank.set`, `rank.clear` and `note.*` were already staff and
needed no change; they were unreachable only because `/members` was an owner
route. `packages/auth/src/permissions.ts` is untouched, because it is
decorative: nothing in the repo calls `hasPermission`, and `instructor` and
`student` are literally the same role object there. The tRPC tier is the guard.

**Owner-only, deliberately:** `remove`, `suspend`, `restore`, `staff`,
`dropIn.list`, `invite.*`, `promote` (which adds a co-owner, not a belt), and
`setRole`. That last one matters: an instructor who could set roles could mint
instructors, and could demote every owner down to the last one that the
never-ownerless guard protects.

**One redaction.** `membership.members` returns each member's plan, price, next
due date and payment status. It returns `dues: null` when the caller is not an
owner. Money is the owner's business; the coach's job is the queue and the belt.
The field was already nullable and both consumers already branched on it, so
this cost one line and no types. `stats.gym` already does the same thing with
`newMembers`.

Contact details stay visible to staff. A head coach chasing a student who
stopped showing up is a normal gym job, and the owner chose to invite them.

`/members` moves to `isStaff` in the route access table (ADR 74). Because that
table is no longer the guard for what is inside the screen, four blocks grew
their own `isOwner` check: Invites, the Drop-in leads tab, Export CSV, and the
suspend / restore / remove / role controls. The instructor's dashboard queue now
shows pending approvals, which is the whole point of the change.

### Two things that make the pilot legible

- **A feedback link** in the sidebar footer and on Profile (the footer is
  desktop-only, and mobile reaches Profile through the header avatar). A
  `mailto:` with the academy, role and current screen in the body, because a
  report that says "it doesn't work" costs a phone call to place.
- **A first-run checklist** on the dashboard when an owner has no members and no
  classes. That state currently renders "All clear.", which reads as finished
  rather than empty. Three links: add your weekly classes, share your join link,
  print the QR poster. Nobody is standing next to a new owner saying it out loud.

## Consequences

- An instructor sees every member's name, email, phone, attendance, rank and
  staff notes. That is a real widening of who can read student contact data, and
  it is the point: the person at the desk needs it. An owner who does not want
  that should invite the coach as a student.
- The schedule read does one extra indexed select. On a healthy academy it
  returns nothing. On a stale one it materializes inside the request, so the
  first read after a long gap is slower than the ones after it.
- Rate limits are per instance. A determined flood from many IPs, or across a
  scale-out, still gets through. It stops the realistic case.
- The privacy page is not live-ready until the three placeholders are filled in.
  This is deliberate and visible.
- Sentry sends no traces at all now. If a performance question comes up during
  the pilot, `tracesSampleRate` is one line, and the quota is the thing to check
  before flipping it.


## Review fixes (same wave)

- **`approve` and `reject` refuse a pending coach unless the caller is an owner.**
  Moving both to the staff tier opened a hole the wave had explicitly closed one
  file over: `approve` grants `invitedRole`, so an instructor clearing a pending
  **instructor** mints a colleague, which is exactly why the role picker stayed
  owner-only. The Members screen already hid those rows, and the route table says
  in its own comment that the screen is not the guard. `requireOwnerForCoachSeat`
  in `packages/api/src/router/membership.ts` is the guard, covered by
  `instructor-desk.test.ts`.
- **The rate limiter's 5,000-key cap now caps.** It swept expired buckets and
  inserted anyway, so a flood from rotating addresses (every bucket live, nothing
  to sweep) grew the map without a ceiling. If the sweep frees nothing the map is
  cleared. Forgetting a window is fine for a brake.
- **The CSV object URL is revoked on a timer.** The download is queued, not
  synchronous, so revoking in the same tick as the click can cancel it before the
  browser fetches the blob. Chrome usually wins that race and Firefox does not.
