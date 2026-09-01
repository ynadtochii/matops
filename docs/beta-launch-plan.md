<!-- matops: the plan for turning the test deployment into a real one. Written 2026-09-01 against main @ d71c896 (v7.1). -->

# From test app to real beta

This replaces [beta-readiness.md](beta-readiness.md), which was written at v2.7
against a deployment that did not yet exist. Most of its list is now built.
What is left is not product. It is the setup around the product.

Three constraints from the brief:

1. Development continues while real gyms use the app. Dev must never touch prod.
2. The app moves to a new domain.
3. Infra and third parties stay as they are: Vercel, Neon, Resend, Sentry,
   GitHub Actions, EAS. No new vendor.

## Verdict

The product is ready. The **operating setup is not**, and it has one hole that
matters more than all the others: **there is one database, and the laptop is
pointed at it**. `.env` holds the production Neon pooled string, every migration
so far was applied by hand from this machine, and `pnpm db:seed fill` writes
fake students into the same rows a real gym would read. Until that is split,
"do not break prod" is a promise held together by care alone.

Everything else on this page is ordinary launch hygiene.

---

## Part 1: split dev from prod

This is the whole point of the exercise. Do it first, do it completely, and the
rest of the list stops being scary.

### 1.1 Two databases, one Neon project

Neon branching comes with the product already in use, so this adds no vendor.

**The current branch stays production.** It keeps the endpoint the live
deployment already points at, it stays the project default, and `dev` is created
as a child of it. That direction matters:

- The `dev` branch is made **first**, so it holds a full copy of everything
  before anything is dropped. The wipe that follows is recoverable.
- A child can be deleted or reset freely; a parent with children cannot. Prod
  should be the one nothing depends on.
- The child inherits the current role password, the one that has lived in a
  laptop `.env` and in shell history for months. It ends up on **dev**, and prod
  gets a fresh one. So the two strings differ in host *and* password.

Production is then emptied and rebuilt from migration `0000`. That is worth
doing for its own sake: the live schema was hand-applied over months across six
backfill migrations and several `when`-stamp corrections, and the 42-migration
chain has only ever been proven against PGlite
(`packages/db/test/helpers.ts:19`). A clean rebuild proves it against real Neon
and removes drift you cannot otherwise see.

#### The runbook

Between step 7 and step 9 the live site is broken. Nobody is using it.

1. **Neon: create the branch.** Branches, Create branch, name `dev`, parent is
   the current default branch, from head. Do **not** change which branch is the
   default.

2. **Copy both pooled connection strings.** The hosts differ by endpoint id
   (`ep-...`). Put production's in a password manager.

3. **Repoint local `.env`** at the **dev** string, and add `DB_ENV=dev`. Add
   `DB_ENV=dev` to `.env.example` too, or a fresh clone refuses every drizzle-kit
   command.

4. **Confirm dev is a full copy.** `pnpm -F @matops/db verify` should report
   42 of 42 migrations, RLS plus a policy plus four grants on every tenant table,
   and the user and academy counts you recognise. **This is your backup. Do not
   go further until it passes.**

5. **Vercel, Preview scope:** `POSTGRES_URL` = the dev string. A pull request
   preview can now never write to production.

6. **Rotate the production role password** in Neon, on the default branch. Then
   re-run `pnpm -F @matops/db verify` locally to confirm dev still connects on
   the old one.

7. **Empty production.** Pass the string inline so `.env` keeps pointing at dev,
   and name the production endpoint id yourself:

   ```
   POSTGRES_URL="<prod string>" I_UNDERSTAND_THIS_DROPS_EVERYTHING=1 \
     node packages/db/scripts/reset-branch.mjs ep-<prod endpoint id>
   ```

   It prints the host and what it is about to drop before it drops anything, and
   refuses if the host does not contain the fragment you named. The `matops_app`
   role survives a schema drop; migration `0001` is idempotent about it.

8. **Vercel, Production scope:** `POSTGRES_URL` = the new production string.
   Rotate **`AUTH_SECRET`** in the same edit. It has been outstanding since ADR
   60 and costs nothing now, because there are no sessions left to invalidate.
   Set `CRON_SECRET` while you are there.

9. **Redeploy production.** The build applies all 42 migrations to the empty
   database and asserts the count. Watch the log for:

   ```
   [migrate:deploy] journal has 42 entries, applying
   [migrate:deploy] ok: 42 migrations applied
   ```

   If those lines are missing, the dashboard Build Command is overriding
   `vercel-build`. Set it to `pnpm vercel-build` and redeploy.

10. **Verify production.**

    ```
    POSTGRES_URL="<prod string>" node packages/db/scripts/verify-db.mjs
    ```

    Expect 42 of 42, RLS everywhere, and **0 users, 0 academies**.

11. **Sign in on the live site and Start a gym.** That is the first row in
    production.

#### Two things this leaves behind

- **The demo academy is now dev-only.** Alma beta, the fake students, the 677
  classes and the five leads all live on `dev`. Demo from a preview deployment
  rather than seeding fakes back into production. If you ever do want it in
  production, it needs `ALLOW_PROD_WRITE=1` **and** `SEED_ALLOW=1`, which is two
  deliberate acts.
- **Never use Neon's "Reset from parent" on `dev` after this.** The parent is
  empty now, so it would empty dev. Rebuild dev's test data with
  `pnpm db:seed` instead, which is what it is for.

### 1.2 The guard that stops a laptop writing to production

**Built.** `packages/db/src/env-guard.ts` holds one function,
`assertDevDatabase`. It allows the call in exactly three cases:

| Condition | Who it is |
| --------- | --------- |
| `ALLOW_PROD_WRITE=1` | the deploy pipeline, or you on purpose |
| `CI` is set | GitHub Actions, which holds no production credentials |
| `DB_ENV=dev` | your laptop, pointed at the Neon dev branch |

Anything else throws, **including an unset `DB_ENV`**. That is the point. The
failure this guards against is a `.env` with a production string pasted into it,
and such a file has no `DB_ENV` line at all, so "unset" has to mean "refuse".

Two callers:

- `packages/db/drizzle.config.ts`. drizzle-kit loads this file for every
  subcommand, so one line covers `migrate`, `push` and `studio` at once.
  `pnpm db:push` against production is now impossible by accident, which matters
  because `push` skips the hand-written RLS migrations.
- `assertSeedableTarget` in `packages/db/src/seed/registry.ts`. Its old
  `NODE_ENV === "production"` check has never once fired on a laptop, because
  `NODE_ENV` is never `production` there. It stays, and the new check runs
  first. Seeding production now needs **both** `ALLOW_PROD_WRITE=1` and
  `SEED_ALLOW=1`.

Verified by hand: unset refuses, `DB_ENV=prod` refuses, `DB_ENV=dev` allows,
both overrides allow. `packages/db/test/env-guard.test.ts` locks that in. Run it
with `pnpm -F @matops/db test env-guard`.

What is still unguarded: `wipe-academies.sql` and the hand-run fills in
`packages/db/scripts/` are raw `psql`, so no JavaScript guard can reach them.
The only defence there is 1.1, not having the production string on the machine.

### 1.3 Migrations: by hand in dev, in the deploy on prod

Your workflow, made literal:

```
feature branch
  → pnpm -F @matops/db migrate     (dev Neon branch, by hand, as often as you like)
  → Vercel preview on the dev branch
  → merge to main
  → Vercel production build runs the migration on prod
  → and only then promotes the new deployment
```

**Built.** `apps/nextjs/package.json` gains a `vercel-build` script, which
Vercel prefers over `build` when it exists:

```
"vercel-build": "pnpm -F @matops/db migrate:deploy && pnpm run build"
```

`packages/db/scripts/deploy-migrate.mjs` is the whole pipeline, and it is
deliberately boring:

1. **It does nothing unless `VERCEL_ENV=production`.** A preview build prints
   `skipped` and exits 0, so previews never migrate. Dev stays yours, by hand.
2. It takes a **Postgres advisory lock**, so two merges landing close together
   cannot migrate at the same time.
3. It runs `drizzle-kit migrate` with `ALLOW_PROD_WRITE=1`, the one legitimate
   caller of that override.
4. It then **counts the rows** in `drizzle.__drizzle_migrations` and compares
   them to the entries in `_journal.json`. Both are 42 today. A mismatch throws.

Step 4 is the reason this is a script and not a `&&`. `drizzle-kit` skips any
entry whose `when` stamp is not newer than the last applied row **and still
prints "migrations applied successfully"**. That has already bitten this repo
enough times to earn a line in `CLAUDE.md`. Now it fails the build instead.

And because it runs inside the build, ordering is Vercel's problem, not yours: a
failed migration fails the build, the new deployment is never promoted, and the
old one keeps serving.

**One thing to verify on the first production deploy.** If the Vercel project
has a Build Command set in the dashboard, `vercel-build` is ignored and the
migration silently never runs. Open the first production build log and look for
the `[migrate:deploy]` lines. If they are not there, set the Build Command to
`pnpm vercel-build`.

**One rule this buys you.** Migrations run against production while the *old*
code is still serving, for the length of a build. So a migration must be
backward compatible with the deployed code: add columns and tables freely, drop
one only in a later deploy, after the code that used it is gone. The existing
"structure only, no backfill" rule already points the same way.

### 1.3b What you have to set by hand

I cannot write `.env` files. These are yours:

- **`.env`** (local): the Neon **dev** branch pooled string, plus `DB_ENV=dev`.
  Without that line every drizzle-kit command now refuses, which is the guard
  working.
- **`.env.example`**: add `DB_ENV=dev` so a fresh clone and CI both work.
- **Vercel, Production**: `POSTGRES_URL` = the production pooled string. Nothing
  else changes; the deploy script passes its own `ALLOW_PROD_WRITE`.
- **Vercel, Preview**: `POSTGRES_URL` = the dev branch, so a preview of a
  feature branch reads the same database you migrated by hand.

### 1.4 Make CI a real gate

CI cannot protect production while it is permanently red. Two gates are red on a
clean tree, and both predate every recent wave:

- **`pnpm lint`** fails at the workspace root on `@matops/nextjs` and
  `@matops/expo` ("type that could not be resolved" in Sentry and expo-camera
  files), while both pass when linted directly with `pnpm -F <pkg> lint`. This
  is a resolver or project-service config problem, not real findings.
- **`pnpm test`** is 597 tests, 27 failing, all 30-second timeouts in
  `packages/api`'s `booking-gate`, `instructor-desk` and `membership-lifecycle`
  suites. `packages/api/vitest.config.ts:11` sets `POSTGRES_URL` to a dummy
  host, so any path that reaches the real `pg` client instead of the injected
  PGlite `baseDb` hangs on DNS.

The second one may not be a test problem. It could be the tests telling you that
three code paths reach the shared pool instead of the request-scoped, RLS-bound
connection. **Find which paths and why before deciding it is a config fix.** A
path that bypasses `ctx.db` is a path that bypasses the tenant seam.

Once both gates are green, turn on branch protection on `main`: no direct push,
CI must pass. That, plus 1.1, is the whole answer to "dev must not break prod".

### 1.5 Branch and deploy flow

Nothing exotic. `main` deploys to production. Work happens on a branch, gets a
Vercel preview on the dev database, and merges through a passing CI.

One habit changes. The note in memory says "commit directly to main in matops".
That was right for a test app. It stops being right the day a real gym signs in.

### 1.6 Backups you have actually tested

Check the Neon plan's point-in-time retention. On the free tier the window is
short enough that a bad migration found on Monday morning is unrecoverable.
Raise it to at least 7 days, then **do one restore rehearsal**: branch from a
timestamp, confirm the data is there, delete the branch. Twenty minutes, once.
An untested backup is a belief, not a backup.

---

## Part 2: the domain move

Do this at the same time as the `AUTH_SECRET` rotation, which is still open from
ADR 60. Both log everyone out, so pay the cost once, before the first gym signs
in rather than during their first week.

### 2.1 Stop hardcoding the domain

Five places carry the string today:

- `apps/nextjs/src/app/layout.tsx:16` (metadata base)
- `apps/nextjs/src/auth/server.ts:20` (the `productionUrl` fallback)
- `.github/workflows/cron.yml:25` (`APP_URL`)
- `apps/expo/eas.json:26` and `:32` (`EXPO_PUBLIC_API_URL`, preview and production)

The web ones should read one variable. `VERCEL_PROJECT_PRODUCTION_URL` already
resolves correctly on Vercel and is what `auth/server.ts` prefers, so the
literal is only a fallback for a local production build. Replace all three web
literals with that variable and drop the fallback, or set one
`NEXT_PUBLIC_APP_URL` and use it everywhere. Then the next move is one setting.

`eas.json` and the cron workflow stay literal. They run outside Vercel and each
is one line.

### 2.2 The rest of the move

- Add the new domain in Vercel and make it the **production** domain, so
  `VERCEL_PROJECT_PRODUCTION_URL` changes with it.
- Keep the old domain as a redirect. Invite links, join QR codes and wall
  posters already printed carry the old host, and a poster on a gym wall does
  not get reprinted because you changed hosts.
- **Resend**: verify the new sending domain, set DKIM and SPF, update
  `RESEND_FROM`. A magic link that lands in spam looks exactly like an app that
  does not work. Send yourself one from the live site to prove it.
- **Google OAuth**: add the new authorized redirect URI before the switch,
  remove the old one after.
- **Public booking**: each academy's origin allowlist and publishable key live
  on the `organization` row. The allowlist covers the gym's own website, not
  yours, so it is unaffected. The `/book/<code>` link you handed anyone is not.
- Rotate `AUTH_SECRET` in the same deploy.
- Set `CRON_SECRET` so `/api/cron/*` is not open, then confirm the daily tick
  still reports `"ok":true` the next morning.

---

## Part 3: safety net before a stranger touches it

### 3.1 Rate limiting that survives a scale-out

`packages/api/src/rate-limit.ts` is an in-process map. On Vercel Fluid compute
each instance keeps its own counters and a cold start forgets them. That was a
deliberate call in ADR 116, which put the cost ceiling at the edge instead. The
call is fine while the only public surface is one wall poster. It stops being
fine when several gyms each hang a QR code in a public room and the public
booking API is documented for their web developers.

Cheapest real fix that adds no vendor: **Vercel's own firewall rate limiting**
on `/api/public/v1/*`, `/api/auth/*` and the drop-in path. That is a dashboard
rule, not code. The `rate_limit` table named in the file's own comment is the
fallback if an edge rule cannot express what you need. Do not add Redis.

### 3.2 Know when it breaks, without being told

- Sentry is installed but reports **web errors only**. Turn on issue alerts to
  email so a new production error reaches you the same day.
- There is no health endpoint. Add `/api/health` that runs one trivial query and
  returns 200, and point an uptime check at it. Ten lines.
- Skip product analytics for now. With three to five gyms you learn more from
  one phone call than from any funnel.

### 3.3 Legal, for real users this time

`/privacy` exists, and ADR 121 already stopped it naming vendors. Still missing:

- **No `/terms`.** For an unpriced pilot a short page is enough: what the
  service is, that it is a pilot, no uptime promise, how to leave with your
  data, how to reach a human.
- **The processor relationship.** The gym controls its students' data; you
  handle it on their instructions. One paragraph in the terms naming that, plus
  a line on sub-processors and EU storage, matches what `/privacy` already says.
- **A student cannot delete their own account.** Only an owner can erase a
  member (ADR 84). For a pilot, "email us and we erase you" written on the
  privacy page is acceptable. Say it plainly rather than leaving it silent.

### 3.4 The demo academy lives in the production database

"Alma beta" (`seed_org_alma`, code `990001`) and about twenty fake students sit
in the same database real gyms will use. RLS keeps them apart, so this is not a
leak. It is a hazard: `seed clear` or `seed fill` against the prod string is one
mistyped command away, and 1.2 above is what stops it.

Decide now whether the demo stays as your sales demo (fine, keep it) or moves to
the dev branch (cleaner). Either way it must stop being maintained from a laptop
pointed at production.

### 3.5 Do not ship the mobile app to the beta

Every Expo wave since v1.8 is static-gates-green only. No simulator has run it
here, `docs/mobile-device-test.md` is outstanding, and the Google
browser-to-app hand-off still does not land. The web student app has been at
parity since v3.2 apart from the in-app scanner, and the poster's
`/checkin/<id>` page works in a phone browser anyway.

Web only. That removes App Store review, EAS submit, universal links and push
from the launch entirely, and costs the beta almost nothing.

---

## Part 4: product, before strangers use it

Short list. The screens all exist.

### 4.1 The schedule can run dry, silently

Classes materialize only when a template is saved
(`packages/api/src/router/template.ts`), 180 days forward, plus the owner's
manual **Rebuild schedule** button. A gym that sets up its week in September and
never edits a template again has an empty calendar in March, with no warning and
no error.

`/api/cron/materialize` and `runMaterializationSweep` already exist and are
tested. They are dormant on purpose (ADR 46, 79). **Add one curl to the daily
GitHub Actions tick that already runs.** Three lines in `cron.yml`, and it
closes the only silent failure a gym would blame on the product.

### 4.2 First run

An owner who signs up lands on an empty dashboard. Empty states exist, but
nothing says what to do next. Three steps on the dashboard, dismissed when done:
add your weekly classes, share your join link, print the QR poster.

The largest product item on this page, and the only one a self-serve gym cannot
get past. If you onboard every pilot gym by hand (see 5.2), it can wait.

### 4.3 A way to reach you

One sidebar item pointing at a mailto. An owner with no channel just stops using
the app, and you never find out why.

### 4.4 Say plainly what is not there

Written down once, in the beta brief:

- No card payments. Dues are a bank transfer the student marks as paid and the
  owner confirms.
- No class reminders on web. Only the phone app schedules those, and the phone
  app is not in this beta. Dues reminders do go out daily.
- No waitlists, no hard capacity, no no-show tracking.
- The taught line on a class (what was actually covered) is not built. The
  curriculum shows what is planned.
- Staff cannot yet book a lead onto a future class.

A pilot gym forgives a missing feature it was told about. It does not forgive
one it discovered.

---

## Part 5: how to run the pilot

### 5.1 Three to five gyms, not thirty

Enough to find the bugs, few enough that you can call each of them.

### 5.2 Onboard each one yourself

Sit with the owner. Create the academy, type in their real weekly schedule,
watch them approve their first student. You learn more in that hour than from
any dashboard, and 4.2 stops being urgent.

### 5.3 Keep the docs true

`docs/spec.md`, `docs/architecture.md`, `docs/roadmap.md` and `CHANGELOG.md` are
why this codebase is still legible after seventy waves. Real users do not change
the Definition of Done in `delivery.md`. They add one rule to it: a slice that
touches a table a live gym writes to needs its migration reviewed as carefully
as its code.

---

## Suggested order

Nothing below Part 1 is safe to do first.

| #   | Item                                                                                        | Where    | Rough size                                          |
| --- | ------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------- |
| 1   | The 11-step runbook: `dev` branch, production emptied and rebuilt, both passwords rotated    | 1.1      | half a day                                           |
| 2   | `DB_ENV=dev` in `.env` and `.env.example`, `POSTGRES_URL` split in Vercel, first deploy log checked | 1.3b | an hour (the code is built)                     |
| 3   | Fix the three `packages/api` suites that reach the real pool, and the root lint resolver     | 1.4      | one to two days, and it may find a real seam bug     |
| 4   | Branch protection on `main` once CI is green                                                | 1.4      | ten minutes                                          |
| 5   | Backup retention raised, one restore rehearsal                                              | 1.6      | half a day                                           |
| 6   | Domain move, `AUTH_SECRET` rotation, Resend and Google reconfigured, hardcoded hosts removed | Part 2   | one day                                              |
| 7   | Edge rate limiting, Sentry alerts, `/api/health` and an uptime check                        | 3.1, 3.2 | half a day                                           |
| 8   | `/terms`, the processor paragraph, the deletion line on `/privacy`                          | 3.3      | half a day                                           |
| 9   | Materialize sweep on the daily cron                                                         | 4.1      | an hour                                              |
| 10  | Feedback link, the beta brief written out                                                   | 4.3, 4.4 | half a day                                           |
| 11  | First-run checklist on the dashboard                                                        | 4.2      | one to two days                                      |

Items 1 to 5 are what lets you keep developing without fear. Items 6 to 10 are
what a stranger needs. Item 11 is what a stranger needs when you are not in the
room.
