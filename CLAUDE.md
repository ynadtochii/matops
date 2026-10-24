# matops: project guide for Claude

**matops** is an admin SaaS for grappling gyms: a **Next.js** owner, instructor and student web app plus an **Expo** student app, in one TypeScript monorepo. It is a from-scratch rebuild. The old app **MAT** (`/Users/kuna/projects/mat`) is reference only, never a base.

## Current state: the first release (ADR 142)

The first release is **one BJJ academy per gym** with **approval-only booking**. An approved, active student books without a plan or payment. Pending, suspended, archived and removed students cannot book. The booking window, class state, soft capacity, cancellation and tenant checks still apply. The record is ADR 142 (`docs/issues/142-first-release-approval-only-booking.md`, with its 2026-09-27 addenda) and `docs/first-release-plan.md` (Decisions and Progress log).

**Payment code is kept but switched off.** `entity.membership_enforced_at` is the one flag, and `bookingGate` (`packages/api/src/payments-gate.ts`) skips the payment check while it is null. New academies get null. No web control turns it on: that needs a later release or a direct database change. While it is off, the web hides every payment screen.

**Tenancy (ADR 124, `docs/architecture.md` §5).** An **organization** is the gym. A typed **entity** (only `bjj_academy`) is the academy. `entity_membership` is one person's role and status at one academy. Every request names the academy in the **`x-matops-entity`** header: web sends the `/entities/[entityId]` segment, the app sends the id it keeps in secure-store. The session never picks the academy. RLS keeps the column name `academy_id`, which holds an entity id. Read §5 before touching tenancy.

- **Web, owner and instructor.** Magic-link or Google sign-in. `/start` creates the gym and its academy in one form (name and time zone) and resumes if the second write failed. Gym creation is invite-only: only emails in `GYM_CREATOR_EMAILS` pass Better Auth's `allowUserToCreateOrganization` (ADR 149); landing and sign-in say Request a demo. Every screen lives under `/entities/[entityId]`; `/` opens the first academy. Sidebar: **Dashboard** (setup checklist for owners and managers, closable; attendance review queue), **Schedule** (week grid, templates, extend the calendar, safe rebuild, poster export), **Students** (requests, members, drop-in leads, archived; import, export; no Add student form, students register through the join link or code; the "Invite students" join link and the drop-in link, each with QR; instructors see only the drop-in link), plus "Share drop-in link" on Dashboard for every staff member, **Coaches**, **Settings** (academy name, location and time zone, the front desk tablet link, delete; bank details only while payment is on), plus **Memberships** (`/memberships`) only while payment is on. **Attendance** and **Profile** are routes with no sidebar item. Instructors get Dashboard, Schedule, Students, Coaches and Attendance; Settings needs an owner or manager (`ROUTE_ACCESS` in `packages/domain/src/entity.ts`). There is no gym overview, people directory, gym settings, academy selector or "Add academy".
- **Web, student.** Schedule (the seven-day week with Book and Cancel), **My classes** (`/training`), **Profile**, class detail at `/class/<id>`, and **Membership** (`/payments`) only while payment is on. Same procedures as the app. Approved students can share a class drop-in link for a friend from a schedule row or the class page, on the web and in the app (ADR 147 addenda).
- **Expo app.** Three tabs (Schedule, Training, Profile); no Scan tab, no `checkin/[academyId]` deep link. Settings, notifications, and local class reminders stay. The `checkin` router is kept for an overlap period so the Scan tab in old mobile builds keeps working; it is removed in a later deploy after the new three-tab build is released.
- **Public surface.** `/join/<token>` (invite link, `invite.resolve`) and `/drop-in/<token>` (the drop-in visitor form, `dropIn.resolve` and `dropIn.submit`: the visitor enters email and phone, sees their first name as confirmation if both match a lead, picks a class on now to mark present or coming up to book, and answers the academy's questions; ADR 147). `/desk/<token>` (the desk check-in tablet, ADR 150: an owner or manager opens the secret link from Settings on a tablet; students tap their name to be marked present for the running or next class, with a 10-second undo; the token alone picks the academy, then the request runs under RLS). `/files/<key>` serves avatars and academy icons from R2 (ADR 152); receipts are never served there. `/privacy` and `/sign-in`. There is no public booking page and no public REST API.
- **Removed in the first release** (ADR 142 addenda, `docs/first-release-plan.md` Progress log): reception, public booking (`/book`), referrals, curriculum, general spaces, the notifications page and delivery retry, the multi-academy screens, the per-academy payment switch, and `booking.bookFor` (owner booking past the window). Owner cancel (`booking.cancelFor`) stays. The wall-QR form at `/checkin/<id>` and the Scan tab are removed by ADR 147, along with `dropIn.promote` (lead promotion).
- **Class notices.** Changing or cancelling a booked class writes a saved notice (`notification_notice`), sends one email batch through Resend after commit, and pushes to the app. There is no retry screen.
- **Migrations.** `packages/db/migrations` holds `0000_baseline` to `0012_stored_file` (thirteen journal entries). `0004` drops the removed features' tables and columns; it shipped in a later deploy than the code that stopped using them. `0009` adds `drop_in_link`, `rate_limit`, and visitor answer columns to `drop_in` (ADR 147); it has not been applied anywhere yet. `0010` adds `desk_link` (ADR 150), `0011` adds `drop_in.shared_by_membership_id` (ADR 151) and `0012` adds `stored_file` and the file id columns (ADR 152); all three are on dev (2026-10-16), none on production yet. Production has zero academies; recheck before the first real invitation.
- **Tests.** The last full run passed 1,188 tests across `@matops/notifications`, `validators`, `domain`, `db` and `api` (2026-09-29).
- **Scheduled jobs.** None. `apps/nextjs/src/app/api` holds only `auth` and `trpc` routes, and `.github/workflows/ci.yml` (lint, format, typecheck, test) is the only workflow. The class horizon is 180 days, filled on each template save and extended or rebuilt by an owner or manager from Schedule. No code reads `CRON_SECRET`.
- **Open items.** Before real invitations: confirm the operator's legal identity and address and publish them on `/privacy` (the page uses the existing support email, not legal env vars), and rehearse backup and restore on an isolated database (first-release plan S7). Rotate `AUTH_SECRET` on the next deploy (ADR 60). The mobile Google browser-to-app hand-off still fails (`docs/mobile-google-login-handoff.md`).

Docs of record: `docs/architecture.md` (§0 as built, §5 tenancy) · `docs/spec.md` (behavior, per ID) · `docs/roadmap.md` (status matrix) · `CHANGELOG.md` · `docs/map.md` (ADR index).

Business reference, **not a build plan**: `docs/business-model.md`. The [gym-owned Stripe design draft](docs/stripe-gym-payments-design.md) starts with one-off drop-in payments, is not implemented, and leaves the pay-to-book rule open. Near term: an unpriced pilot with a few test academies.

## Run it

- `pnpm install`, then `pnpm dev:next` → **http://localhost:3004** (port 3000 is kept free on purpose). Sign in with the magic-link form and copy the `[auth] magic link …` URL from the terminal into the browser (no email provider needed).
- **`pnpm dev:ios`** prepares and runs the iOS stack in one command: installs deps if needed, starts the web and API on 3004, then boots the Expo app in the iOS Simulator (Metro and a dev-client build). Missing email (Resend) or push (EAS) config just no-ops. `pnpm dev:ios "iPhone Air"` picks a simulator.
- `pnpm test` runs `turbo run test` across every package with a suite, **no database needed** (PGlite is embedded): RLS leak tests in `packages/db/test`, router tests in `packages/api/test` (real routers and middleware over PGlite, ADR 60), pure rules in `packages/domain/test`, schemas in `packages/validators/test`, and the notification transport.
- `pnpm -F @matops/db migrate` applies migrations to `POSTGRES_URL`, which on a laptop is always the **dev** database. `pnpm -F @matops/db verify` checks any database it is pointed at (applied count against `_journal.json`, the `matops_app` role, RLS, policy and four grants on every reachable table). `pnpm -F @matops/db report` prints the product-event report.
- **Demo data (`packages/db/src/seed/cli.ts`).** Sign in once first, so your `user` row exists.
  - `seed pilot <your-email>` builds one BJJ academy, "Pilot BJJ" (Europe/Lisbon), approval-only, with no plans. Idempotent. `seed down` removes it. Root aliases: `pnpm db:seed` (pilot), `pnpm db:seed:down` (down).
  - `seed fill <code>` adds about 20 fake students (bookings, attendance, ranks, notes) around the real owner of the academy with that 6-digit code. It never touches real rows. It adds plans, assignments and months only while that academy takes payment. `seed clear <code>` removes only the fakes; `seed status <code>` counts them.
  - `psql "$POSTGRES_URL&sslrootcert=system" -f packages/db/src/seed/wipe-academies.sql` deletes **every** academy (destructive, keeps real `user` rows).
- `.env` holds `POSTGRES_URL` (the Neon **dev** branch, pooled, `sslmode=verify-full`), `DB_ENV=dev` and `AUTH_SECRET` (its own, never production's). `/privacy` uses the existing feedback contact; no legal/privacy env vars are required to start Next.js.

## Branching, databases and deploys

- **Work on `dev`. Merging `dev` into `main` IS the production deploy.** Never commit to `main` directly. Say plainly that a merge deploys.
- **Two Neon branches in one project.** Local `.env` and Vercel **Preview** point at the `dev` branch, which holds test data. Vercel **Production** points at the production branch, which holds only real academies and has none yet. Different host **and** password.
- **`.env` must carry `DB_ENV=dev`.** Without it `assertDevDatabase` (`packages/db/src/env-guard.ts`) makes every drizzle-kit command and the seed CLI refuse. That is the guard working. It is called from `drizzle.config.ts` and `assertSeedableTarget`; `ALLOW_PROD_WRITE=1` is the override.
- **Migrations reach production only through the deploy.** `apps/nextjs/package.json`'s `vercel-build` runs `@matops/db migrate:deploy` before the new deployment is promoted, so a failed migration blocks the deploy and the old one keeps serving. It no-ops unless `VERCEL_ENV=production`, takes an advisory lock, and asserts the applied row count against `_journal.json`, because `drizzle-kit` skips stale-`when` entries and still reports success. **Never run a migration against production from a laptop.**
- **A migration lands while the OLD code is still serving**, for the length of a build. Add columns and tables freely; drop one only in a later deploy, after the code that used it is gone. `0004` is such a drop.
- **Never use Neon's "Reset from parent" on `dev`.** The parent is empty, so it would wipe dev. Rebuild dev data with the seeds.
- Runbook: [docs/beta-launch-plan.md](docs/beta-launch-plan.md) §1.1-1.3.

## Phase 0 gotchas (do not "fix" these)

- **`@matops/api` and `@matops/auth` are consumed from SOURCE.** `exports.types` point at `src`, and tsconfig extends `base.json` (noEmit). The tRPC `AppRouter` embeds the full Better Auth `Auth` type, too large to serialize into a `.d.ts` (TS7056). Do NOT switch them back to `compiled-package.json`.
- **RLS needs `SET LOCAL ROLE matops_app` and a role grant.** The request transaction sets that role, `app.organization_id` and `app.academy_id`. `0000_baseline` runs `GRANT matops_app TO current_user`, because a managed-Postgres connection role is not a superuser; without it you get "permission denied to set role". PGlite (superuser) hides this.
- **Migrations are STRUCTURE ONLY.** Tables, columns, indexes, constraints, RLS policies, grants. **No `UPDATE`, no `INSERT`, no backfill.** A data fill goes in `packages/db/scripts/<date>-<name>.sql` and is run by hand (`psql "$POSTGRES_URL&sslrootcert=system" -f <file>`), because a migration runs everywhere forever while a fill is usually right once, on one database.
- **Use `migrate`, not `db:push`.** The RLS role, policies and grants live in the hand-written parts of `0000_baseline`; `push` only diffs the schema files and skips them.
- **After `drizzle-kit generate`, check the new entry's `when` in `_journal.json`.** `drizzle-kit migrate` skips any entry not newer than the last applied row **and still prints success**. The dev ledger's last row is `1789853331052` (a `stripe`-branch row), so a new entry must be above it and above `0004`'s `1789939731052`. Then re-run and check `select count(*) from drizzle.__drizzle_migrations`.
- **Tests:** RLS and DB behavior → PGlite in `packages/db/test`; router and middleware behavior → `packages/api/test` (PGlite injected as `ctx.baseDb`, ADR 60); pure logic → `packages/domain/test`; schemas → `packages/validators/test`. Each has its own `test/tsconfig.json` (keeps `build`/`typecheck` on `src`).

## Specs are the source of truth

- **Product behavior:** `docs/spec.md` (every rule has an ID: `S1`, `O4`…).
- **System design:** `docs/architecture.md`.
- **Decisions (ADRs):** `docs/issues/NN-*.md`, indexed by `docs/map.md`. Append-only: supersede with a new note, never rewrite.
- **Status matrix:** `docs/roadmap.md`. **The rulebook for how we build:** `docs/delivery.md`.

## Definition of Done (every slice, see delivery.md §4)

Code + migration + tests pass, THEN in the same change:

1. Update `docs/spec.md` if user-visible behavior changed.
2. Update `docs/architecture.md` and add or append an ADR if a technical decision changed.
3. Flip the slice's cells in `docs/roadmap.md` (`— / todo / wip / done`).
4. Add one line to `CHANGELOG.md`.

A slice is not done until its doc is true. No silent scope creep: a new idea is a new slice or ADR.

## Before building a slice

Read the spec IDs and ADRs the slice names in `docs/roadmap.md`. Restate the behavior in one sentence. Write the pure rule in `packages/domain` (with a test) before the API and UI (delivery.md §5).

## Stack (locked, do not re-litigate; see docs/map.md)

- **Monorepo:** Turborepo + pnpm, `create-t3-turbo` layout. Package scope `@matops/*`.
- **API:** tRPC v11 colocated in Next.js (`packages/api`). Both clients consume the same router. Internal-only (no public REST).
- **Auth:** Better Auth + Organization plugin (the organization is the gym; the academy is an `entity` under it, ADR 124) + magic-link, plus **Google** when `GOOGLE_CLIENT_ID`/`SECRET` are set (ADR 35). Expo secure-store sessions.
- **DB:** Drizzle + Postgres (**Neon**). Driver = **`pg`** on the Neon **`-pooler`** endpoint (the per-request RLS transaction needs it; the HTTP driver cannot do interactive transactions).
- **Tenancy:** Postgres **RLS**, one **entity** per request (ADR 124, architecture §5). `withScope({ organizationId, entityId? })` sets `app.organization_id` and, when given, `app.academy_id` in one round trip. Academy tables match `academy_id = current_setting('app.academy_id', true)`; gym tables (`entity`, `entity_membership`, `person`, the membership tables) match `app.organization_id`. `academy_id` is **text** and holds an entity id (the first academy's equals the organization id), never cast to uuid. The client names the entity in `x-matops-entity`; the session never does.
- **Web:** Next.js App Router on Vercel + shadcn/ui + Tailwind. **Mobile:** Expo/React Native (explicit RN styles, ADR 36), via EAS. **State:** TanStack Query.
- **Notifications:** thin `packages/notifications` transport (Expo Push, and Resend for the magic link and class notice emails). No WebSocket or live UI (polling).

## Layout

```
apps/nextjs   owner, instructor and student web (+ tRPC and auth route handlers)
apps/expo     student mobile
packages/{api,auth,db,domain,notifications,ui,validators}
  domain = pure framework-free business rules (booking policy, approval, capacity,
           check-in, stats, payments, rank, setup, schedule/grid + label formatting)
  notifications = pure transport only (Expo Push; Resend email); never throws
tooling/{eslint,github,prettier,tailwind,typescript}
```

## Commands (pnpm)

- `pnpm dev` runs everything · `pnpm dev:next` web only (:3004) · `pnpm dev:ios` web + iOS Simulator
- `pnpm typecheck` · `pnpm lint` · `pnpm format:fix`
- `pnpm db:push` push schema (local only, see gotchas) · `pnpm db:studio` Drizzle studio · `pnpm auth:generate` regen auth schema

## Conventions

- Read a file before editing it. Absolute paths. Follow existing patterns in the package you touch.
- Do not commit unless asked. No AI co-author trailers.
- Non-goals stay out: hard caps, waitlists, no-show tracking, card processing, live UI, the native home widget (see `docs/roadmap.md` "Parked"). Belts and rank (ADR 41) and manual bank-transfer dues (ADR 40, now behind the payment flag) are in.
- Payments: start with provider-hosted screens and the smallest status sync. No app-side refund handling unless asked.
- Schedule-based checkout: a fresh public class list is not server eligibility. Check again before payment and at fulfillment. Staff cancellation UI is separate work.
