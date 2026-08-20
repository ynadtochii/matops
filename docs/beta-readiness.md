# Beta readiness — web-only backlog

Gap analysis for running a beta with an **external potential customer**, on the
**web app only** (no Expo app), using the seeded demo academy as the example.
Written 2026-08-20 against the working tree at v2.7, and against the live
deployment at `https://matops.grapplerscollective.com`.

This is a backlog, not a decision record. Nothing here is an ADR. When an item
is picked up it becomes a roadmap slice; when it changes a decision it gets its
own ADR.

## Verdict

The product is further along than the launch setup. Every screen a beta customer
needs already exists. What is missing is everything around the app: a place to
run it, a way to send email, and a way to see what went wrong.

A web-only beta is a complete product. The student half runs on the web since
v2.2 (join link, rolling seven-day week, inline book and cancel, in
`apps/nextjs/src/app/_components/student-screen.tsx`). The Expo app is not
needed to show both loops.

---

## 1. Blockers — nothing works without these

### 1.1 Deployment — done, but stale

**Live** at `https://matops.grapplerscollective.com` on Vercel, serving the same
Neon database. Verified 2026-08-20: `/sign-in` returns 200, `system.health`
answers, and `dropIn.academyInfo` on `seed_org_alpha` returns "Ironside BJJ
Academy", so the demo seed is already in the production database.

**The deployed build is behind the working tree.** It is `df77c89`, and
`/coaches` returns 404. The v2.5, v2.6, and v2.7 waves (Coaches screen, Settings
split, invite roles and the coach queue) are 54 uncommitted files on disk and
have never shipped. `next build` was last run for v2.4.

So: commit, run a production build, redeploy.

**Still to confirm:** the Vercel plan. Hobby forbids commercial use, and its
definition counts "any method of requesting or processing payment from
visitors", which is the dues screen (ADR [46](issues/46-no-scheduler-v1.md)).
A beta needs Pro, or a self-host.

### 1.2 Transactional email — done

Domain and Resend are set up. `RESEND_API_KEY` and `RESEND_FROM` are in `.env`,
and the sender domain matches the app domain, so DKIM and SPF line up.

**Still to confirm:** that both variables are also set in the Vercel project
environment, not only locally. `sendEmail` no-ops silently when they are missing
(`packages/notifications/src/env.ts`), so a missing key in production looks like
"the magic link never arrives" with no error anywhere. Send yourself one magic
link from the live site to prove it.

### 1.3 Database and secret hygiene

- Migrations `0019` and `0020` are written but not applied to Neon.
  `0019_regular_black_cat.sql` is one index on `member(organization_id, user_id)`.
  `0020_auth_table_grants.sql` revokes the restricted `matops_app` role's write
  access to the identity tables (ADR [60](issues/60-backend-review-fixes.md)).
  `0020` is safe to apply: every invite and identity write goes through the base
  connection helpers in `@matops/db`, never through `ctx.db`, confirmed in
  `packages/api/src/router/invite.ts`.
- `AUTH_SECRET` still needs rotating: the old auth error hook logged it (ADR 60).
  Rotating invalidates every live session, so do it before the beta starts, not
  during it.

### 1.4 No error boundary

There is no `error.tsx`, `not-found.tsx`, or `global-error.tsx` anywhere under
`apps/nextjs/src/app`. In production a client exception shows the prospect a
blank "Application error" page.

Cheapest fix on this list and the most visible failure. The site is publicly
reachable right now, so this is live behaviour, not a hypothetical.

## 2. Should fix before a stranger touches it

### 2.1 The schedule runs dry at week 6

Classes materialize only when a template is written
(`packages/api/src/router/template.ts:70`), filling
`MATERIALIZATION_HORIZON_DAYS` (42) forward. If the prospect does not edit a
template for six weeks their calendar silently empties.

ADR 46 already names the fix as its Option B: call the sweep opportunistically
on schedule read. The alternative is one daily cron on whatever host is picked.
The route and the sweep already exist and are tested.

### 2.2 Nothing reminds anyone

No scheduler, so no class reminders and no dues reminders (ADR 46). On web-only
there is not even the on-device fallback the Expo app has (ADR 54).

A gym owner's first question about admin software is whether it chases people
for them. Either wire `/api/cron/remind` to a host cron, or state plainly in the
beta brief that reminders come later.

### 2.3 No rate limiting anywhere

`dropIn.submit` and `invite.resolve` are public unauthenticated endpoints, and
magic-link send is public. A QR poster on a gym wall means anyone can flood the
lead table and burn the Resend quota.

This is now urgent rather than theoretical: the app is already live on a public
domain with a working Resend key behind it.

Better Auth ships a rate limiter as one config block. Already tracked as roadmap
slice 5.2.

### 2.4 No error tracking and no analytics

Neither Sentry nor any product analytics is installed. In a beta this is the
highest-value addition after email. Without it the prospect hits a bug, shrugs,
and the signal is lost.

### 2.5 No privacy policy and no terms

The drop-in form collects a stranger's name, phone, and email behind one line of
copy: "OK for the gym to contact me about training"
(`apps/nextjs/src/app/checkin/[academyId]/drop-in-form.tsx:152`). There is no
link to anything.

If a real gym hangs that QR on a wall in the EU, matops is a data processor with
no published policy. There is also no account deletion and no data export.

### 2.6 No in-app feedback link

One sidebar item pointing at a mailto or a form turns a frustrated prospect into
a bug report.

---

## 3. Product gaps the prospect will name in the first hour

### 3.1 No guided first run

After **Start a gym** the owner lands on an empty dashboard. Empty states exist
(slice 4.3), but nothing says "1. add your weekly classes, 2. share your join
link, 3. print the QR". For a self-serve beta this is the single biggest product
addition on this page.

### 3.2 Settings is nearly empty — **closed** (ADR [68](issues/68-academy-time-zone-address-and-delete.md))

Settings now carries the academy time zone, a free-text address with an Open in
Maps link, and a danger zone that soft-deletes the academy behind a typed
`delete <academy name>`. Still absent, and still post-beta: currency and a logo.

### 3.3 Timezone is free text, per template — **closed** (ADR [68](issues/68-academy-time-zone-address-and-delete.md))

The zone lives on the academy, picked from `Intl.supportedValuesOf("timeZone")`.
The template form no longer asks for one: a new template inherits the academy
zone, an existing one keeps its own, and Settings names any that disagree.

### 3.4 Instructors cannot reach Members

So a head coach who is not the owner cannot approve a new student and cannot set
a belt rank. In most gyms the head coach does exactly that. ADR
[64](issues/64-invite-role-and-coach-queue.md) gave owners a role picker but did
not move approval or rank to instructors.

---

## 4. Running the demo academy

The seed builds **Ironside BJJ Academy**, public code `990001`, attached to the
builder's own user (`packages/db/src/seed/registry.ts`).

- `assertSeedableTarget` refuses to run when `NODE_ENV=production`. Seeding the
  demo into the deployed database needs `SEED_ALLOW=1`.
- To let the prospect in, invite them into the demo academy. **Give them
  instructor, not owner**, unless they should see Members, Payments, and
  Settings. For the full owner view, promote them with `membership.promote` and
  accept that they can then remove people.
- The demo drifts as they use it. `seed clear 990001` then `seed fill 990001`
  resets it, but only from a local machine pointed at the production database.
  Decide whether running that by hand between demos is acceptable.

---

## 5. Suggested order

| # | Item | Section | Kind |
| - | ---- | ------- | ---- |
| 1 | Commit v2.5-v2.7, run `next build`, redeploy | 1.1 | infra |
| 2 | Confirm Vercel plan, confirm Resend vars in Vercel, apply `0019`/`0020`, rotate `AUTH_SECRET` | 1.1, 1.2, 1.3 | infra |
| 3 | `error.tsx` plus `global-error.tsx` plus Sentry | 1.4, 2.4 | infra |
| 4 | Rate limiting on the three public endpoints | 2.3 | infra |
| 5 | Privacy page plus a real consent line on the drop-in form | 2.5 | infra |
| 6 | Materialization self-heal on read (ADR 46 Option B) | 2.1 | product |
| 7 | First-run checklist on the empty dashboard | 3.1 | product |
| 8 | Feedback link | 2.6 | product |

Items 1 to 5 are launch hygiene, roughly a day. Items 6 to 8 are product,
roughly two days. Section 3 beyond 3.1 is post-beta unless the prospect asks.
