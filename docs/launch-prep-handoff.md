# Handoff — launch prep for the first real academy

**Not a doc of record.** This is a session handoff, written 2026-08-24 against
the working tree at v4.1 (commit `340276d` plus the uncommitted icon work).
Delete it once its open items land in [roadmap.md](roadmap.md) or an ADR.

The question that started the session: *what has to happen before a real academy
uses matops, and does the current Neon plan allow starting from a fresh
database?*

---

## What is already written down

Read these first. This file does not repeat them.

- [pilot-plan.md](pilot-plan.md) — the active plan. Blocker table, the written
  deal to send each gym, what to measure, how the pilot fails.
- [beta-readiness.md](beta-readiness.md) — the gap analysis it supersedes. Written
  at v2.7, so its deployment and migration blockers are closed and the rest is
  still open.
- [infra-costs.md](infra-costs.md) — vendor free-tier limits and the Vercel Hobby
  commercial-use trap.
- [roadmap.md](roadmap.md) — Phase 5 and the open operational items.

Still open from `pilot-plan.md`, unchanged by this session: **Vercel Pro**,
**rotate `AUTH_SECRET`**, and the three `[PLACEHOLDER]` markers on
`/privacy` (`[ENTITY]`, `[ADDRESS]`, `[CONTACT EMAIL]` in
`apps/nextjs/src/app/privacy/page.tsx:38`).

---

## Findings from this session, in no other doc

1. **`wipe-academies.sql` is stale.** It predates the `notification` table
   (migration `0023`) and leaves those rows behind after a reset. Needs
   `DELETE FROM "notification";`. The dead `notification_pref` table also still
   needs `DROP TABLE IF EXISTS notification_pref;` on Neon.
2. **Local development and production share one database.** Confirmed in
   `beta-readiness.md` §1.1 and unchanged since. `assertSeedableTarget` only
   refuses when `NODE_ENV=production`, so a local `seed fill` or the wipe script
   hits the live database with no guard. This is the highest-risk item on the
   page once a real gym exists.
3. **Neon compute hours can take the app down.** Free is roughly 100 hours a
   month and it **hard-suspends** rather than throttling. Neon sleeps after 5
   minutes idle, so each visit buys 5 minutes. A gym browsing across a 12-hour
   day can burn 3+ hours daily. Watch the usage graph in week one.
4. **No backup story exists.** Nothing in any doc covers restore. Check the
   point-in-time restore window in the Neon console; under 7 days means a weekly
   `pg_dump` somewhere.
5. **Migrations are run by hand from a laptop.** There is no migrate step in the
   Vercel build (`apps/nextjs/package.json` `build` is `next build` only). This
   is the right call at one gym, but it means nothing runs them for you.
6. **The class horizon does not refill itself.** 180 days on template save plus
   the owner's Rebuild schedule button (ADR 79). Six months out the calendar
   empties with no warning unless someone presses it. Wiring
   `/api/cron/materialize` into the existing daily GitHub Actions tick is small,
   since the route and sweep are built and tested.

---

## The Neon answer

**No plan change is needed to start fresh.** Wiping data is free on any plan, and
a new Neon project is not required. The recommended shape:

- **`main` branch = production.** Only Vercel's `POSTGRES_URL` points here.
- **`dev` branch, created from `main`** = local development. Local `.env`
  `POSTGRES_URL` points here permanently. A branch copies data, roles and grants,
  so `matops_app` and every RLS policy come along.
- **`.env.prod`** holds only the production `POSTGRES_URL`. `.gitignore` already
  covers `.env*`. It is the file you aim at deliberately, never by accident.
- **Reset for a clean start:** `wipe-academies.sql` on the target branch, then
  `seed up <email>`.

Tests need no Neon at all (PGlite is embedded), so the live database is only ever
reachable by a command explicitly pointed at `.env.prod`.

## The migration workflow while a gym is live

1. Edit `packages/db/src/schema.ts`, then `pnpm -F @matops/db generate`.
2. **Read the generated SQL.** Drizzle emits `DROP COLUMN` and rename-as-drop-add
   without comment. On a live gym that is data loss.
3. **Add the RLS block by hand** for any tenant-scoped table. `drizzle-kit` does
   not know about the seam. Copy `0023_notification.sql`: `GRANT` to
   `matops_app`, `ENABLE ROW LEVEL SECURITY`, then the `*_isolation` policy on
   `current_setting('app.academy_id', true)`. Prove it in `packages/db/test`.
4. `pnpm -F @matops/db migrate` then `pnpm test` against `dev`.
5. **Rehearse against real data:** Neon "Reset from parent" on `dev` re-copies
   `main` as it is now, then run `migrate` again.
6. **Take a restore point:** branch `main` as `pre-NNNN` before touching
   production. One click, free, delete it a week later.
7. Apply to production, then deploy the code:
   `pnpm -F @matops/db exec dotenv -e ../../.env.prod -- drizzle-kit migrate`.
   `drizzle.config.ts` strips `-pooler` for DDL on its own.

**Rules that keep a live gym working:**

- Additive only. New tables, nullable columns, columns with a default, indexes.
- Never drop or rename in the same deploy as the code change. Split it in two.
- `NOT NULL` needs a `DEFAULT` (see `0025`).
- Forward only. There is no `down`. The `pre-NNNN` branch is the rollback.
- Never `db:push` against production. It skips the hand-written RLS migrations.

---

## Suggested next actions

Small and already scoped. The user was asked and has not answered yet.

- [ ] Add `DELETE FROM "notification";` to
      `packages/db/src/seed/wipe-academies.sql`.
- [ ] Add `with-env:prod` and `migrate:prod` scripts to
      `packages/db/package.json` so the production command is not retyped.
- [ ] Wire `/api/cron/materialize` into `.github/workflows/cron.yml`, or decide
      the Rebuild schedule button is enough and say so in the gym brief.
- [ ] Fill the three privacy placeholders once the entity name, address and
      contact email are known.

Larger, and a decision rather than a task:

- [ ] Whether the Neon `dev` branch split lands as a documented slice with an ADR,
      or stays an operational note here.

## Suggested skills

- **`debug`** if anything on the live deployment misbehaves during setup. It
  pulls real evidence from Sentry, Neon, Vercel logs and cron history before
  naming a cause, which is exactly the shape of a remote-pilot bug report.
- **`ponytail`** stays active. Every item above is a few lines or a dashboard
  click. None of them wants a new abstraction.
- **`plain-english`** or **`writer`** for the privacy page copy and the gym brief
  email, both of which a non-technical gym owner reads.

## Notes for the next agent

- Reading `.env` is permission-denied in this environment. Ask the user for the
  Neon host or plan rather than trying to grep it.
- No credentials, keys or personal data appear in this file, and none should be
  added to it.
- Uncommitted at handoff time: the icon regeneration work (`scripts/gen-icons.sh`
  plus the generated PNG/SVG assets and the loader tweaks). `next build` was last
  run for v3.9, so it has not been built or deployed.
