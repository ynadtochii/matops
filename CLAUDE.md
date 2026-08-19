# matops — project guide for Claude

**matops** is a multi-academy admin SaaS for grappling gyms: an **Expo** student app + a **Next.js** owner/instructor web app, one TypeScript monorepo. It is a from-scratch rebuild; the old app **MAT** (`/Users/kuna/projects/mat`) is reference only, never a base.

## Current state — Phases 0-4 done, plus every product wave through v2.4
Everything through **v2.4** is built and static-gates green (`pnpm lint` 15/15 · `pnpm typecheck` 17/17 · `next build`). The waves, newest first: **v2.4** frontend review fixes (ADR 59) · **v2.3** backend review fixes + the first `packages/api` tests (ADR 60) · **v2.2** student onboarding funnel — join QR, one-step join, the student week on the **web** (ADR 57) · **v2.0/v2.1** mobile waves — local class reminders, pull-to-refresh, who's in the class (ADR 54/55) · **v1.9** internal referrals (ADR 52/56) · **v1.8** mobile IA (ADR 45) · **v1.4** rank & notes (ADR 41) · **v1.3** manual-transfer payments (ADR 40) · **v1.2** attendance stats (ADR 39) · **v1.1** brand + shells (ADR 37/38). Input sanitization landed across every schema (ADR 58); the schedule week grid + poster export are ADR 53/61.

Docs of record: `docs/architecture.md` §0 (as-built) · `docs/spec.md` (behavior, per ID) · `docs/roadmap.md` (live status matrix) · `CHANGELOG.md` (slice by slice) · `docs/map.md` (ADR index).

**Live DB:** a **Neon** database is connected in `.env`. Migrations **`0000`-`0018` are applied**; **`0019` and `0020` are written but NOT applied yet.** The RLS seam, materialization, template-edit propagation, and the booking / attendance / drop-in / payments / rank / referral schemas are verified live on Neon.

- **Works now (web — owner/instructor):** magic-link or Google sign-in → **Start a gym** → per-role **invite links** (with a QR + printable poster) → self-join **pending, no academy role** → owner **approves**. Screens under `(app)/`: **Dashboard** (O1 queue + insights + who's drifting), **Schedule** (O2 week grid + O3 templates + poster export), **Members** (O4 requests / members / drop-in leads, tabbed member detail, rank + staff notes), **Referrals** (O9), **Payments** (O7 plans + dues + claims), **Settings** (O6 academy, bank details, staff) — plus **Attendance** (O5 roster, mark-all-present), which is a route with **no nav item**, reached from the dashboard queue. Instructors see Dashboard / Schedule / Referrals / Attendance; the rest are owner-only. All under the RLS tenant seam.
- **Works now (web — student):** a non-staff member gets the rolling seven-day week with inline **Book** / **Cancel** and an install-to-home-screen card (ADR 57). Same procedures as the app.
- **Works now (mobile — Expo student app):** **three tabs** — **Schedule** (S4, one-tap booking) · **Training** (S6, my classes + stats) · **Profile** (S7 + rank + **Membership dues** S9), with **Settings** (S12) as a pushed screen and QR walk-in (S8) as a deep-linked screen, not a tab (ADR 45). Class reminders are scheduled **on the device** (ADR 54). Custom-scheme deep links only.
- **Does NOT exist yet:** **Phase 5** launch hardening (universal/App links, booking-count reconciliation, rate limiting), **any scheduler** (both cron routes are dormant, ADR 46), and the **R.2 native home-screen widget** (scaffolded; guide in `docs/home-widget-implementation.md`).
- **Open operational items:** apply migrations `0019`/`0020`; **rotate `AUTH_SECRET`** on the next deploy (the old auth error hook logged it — ADR 60); the mobile **Google browser→app hand-off** still does not land (`docs/mobile-google-login-handoff.md`); every mobile wave since v1.8 is **static-gates-green only** — no simulator here, so `docs/mobile-device-test.md` is outstanding.
- **Infra note (ADR 46):** v1 ships **no scheduler** — the `vercel.json` crons were removed. `/api/cron/materialize` and `/api/cron/remind` remain **dormant, manually-callable seams** (`curl -H "Authorization: Bearer $CRON_SECRET" …`). `CRON_SECRET` is **optional**; if set it guards those endpoints, which still refuse to run unprotected in production. To re-enable scheduling, attach the routes to any host scheduler.

## Run it
- `pnpm install`, then `pnpm dev:next` → **http://localhost:3004** (port 3000 is kept free on purpose). Sign in via the magic-link form; copy the `[auth] magic link …` URL from the terminal into the browser (no email provider needed — it prints to the terminal).
- **`pnpm dev:ios`** — one command to prepare + run the whole iOS stack: installs deps if needed, starts the web/API on 3004, then boots the Expo app in the iOS Simulator (Metro + dev-client build). Env-tolerant: missing email (Resend) / push (EAS) config just no-ops. `pnpm dev:ios "iPhone Air"` picks a simulator.
- `pnpm test` — `turbo run test` across every package that has a suite, **no database needed** (PGlite is embedded): RLS leak tests in `packages/db/test`, router tests in `packages/api/test` (real routers + real middleware over PGlite, ADR 60), pure rules in `packages/domain/test`, schema sanitization in `packages/validators/test`, and the notification transport.
- `pnpm -F @matops/db migrate` applies migrations to `POSTGRES_URL`; `pnpm -F @matops/db seed:health` writes a probe row.
- **Demo data (ADR 51):** two modes.
  - **Fill your real academy (recommended):** `pnpm -F @matops/db seed fill <code>` adds ~20 fake students (+ dues/bookings/attendance/ranks) around the real owner of the academy with that 6-digit code, using its **existing** plans + classes — your real data is never touched. `seed clear <code>` removes only the fakes; `seed status <code>` counts them.
  - **Separate fake academies:** `seed up <your-email>` builds two isolated demo gyms attached to your user (owner of one, student of the other — sign in once first). `seed down` / `seed reset`. Also `pnpm db:seed` / `db:seed:down` / `db:seed:reset` from the root.
- `.env` holds `POSTGRES_URL` (Neon **pooled** string, `sslmode=verify-full`) + `AUTH_SECRET`. **`CRON_SECRET`** is now **optional** (ADR 46 removed the scheduler); set it only to guard the manually-callable `/api/cron/*` seams. Note: `.env.example` still shows a Supabase placeholder (it was permission-locked during scaffolding).

## Phase 0 gotchas (do not "fix" these)
- **`@matops/api` and `@matops/auth` are consumed from SOURCE** — `exports.types` point at `src`, tsconfig extends `base.json` (noEmit). The tRPC `AppRouter` embeds the full Better Auth `Auth` type, too large to serialize into a `.d.ts` (TS7056). Do NOT switch them back to `compiled-package.json`.
- **RLS needs `SET LOCAL ROLE matops_app` + a role grant.** The request tx sets that role and `app.academy_id`. Migration `0003` does `GRANT matops_app TO current_user` because a managed-Postgres connection role isn't a superuser — without it you get "permission denied to set role". PGlite (superuser) masks this.
- **Use `migrate`, not `db:push`.** The RLS role/policy live in hand-written migrations (`0001`, `0003`); `push` only diffs the schema file and skips them.
- **Tests:** RLS/DB behavior → PGlite in `packages/db/test`; router + middleware behavior → `packages/api/test` (PGlite injected as `ctx.baseDb`, ADR 60); pure logic → `packages/domain/test`; schemas → `packages/validators/test`. Each has its own `test/tsconfig.json` (keeps `build`/`typecheck` on `src`).

## Specs are the source of truth
- **Product behavior:** `docs/spec.md` (every rule has an ID: `S1`, `O4`…).
- **System design:** `docs/architecture.md`.
- **Decisions (ADRs):** `docs/issues/NN-*.md`, indexed by `docs/map.md`. Append-only — supersede with a new note, never rewrite.
- **Live plan + scope matrix:** `docs/roadmap.md`. **The rulebook for how we build:** `docs/delivery.md`.

## Definition of Done (every slice — see delivery.md §4)
Code + migration + tests pass, THEN in the same change:
1. Update `docs/spec.md` if user-visible behavior changed.
2. Update `docs/architecture.md` + add/append an ADR if a technical decision changed.
3. Flip the slice's cells in `docs/roadmap.md` (`— / todo / wip / done`).
4. Add one line to `CHANGELOG.md`.

A slice is not done until its doc is true. No silent scope creep — a new idea is a new slice or ADR.

## Before building a slice
Read the spec IDs + ADRs the slice names in `docs/roadmap.md`. Restate the behavior in one sentence. Write the pure rule in `packages/domain` (+ test) before the API/UI (delivery.md §5).

## Stack (locked — do not re-litigate; see docs/map.md)
- **Monorepo:** Turborepo + pnpm, `create-t3-turbo` layout. Package scope `@matops/*`.
- **API:** tRPC v11 colocated in Next.js (`packages/api`). Both clients consume the same router. Internal-only (no public REST).
- **Auth:** Better Auth + Organization plugin (org = academy, `academyId === organization.id`) + magic-link, plus **Google** when `GOOGLE_CLIENT_ID`/`SECRET` are set (ADR 35). Expo secure-store sessions.
- **DB:** Drizzle + Postgres (**Neon**). Driver = **`pg`** on the Neon **`-pooler`** endpoint (needed for the per-request RLS transaction — the HTTP driver can't do interactive tx).
- **Tenancy:** Postgres **RLS**. Per-request tx sets `set_config('app.academy_id', <org id>, true)`; policy `USING (academy_id = current_setting('app.academy_id'))`. `academy_id` is **text** (Better Auth org id), never cast to uuid.
- **Web:** Next.js App Router on Vercel + shadcn/ui + Tailwind. **Mobile:** Expo/React Native + NativeWind, via EAS. **State:** TanStack Query.
- **Notifications (Phase 4):** Expo Push + Resend, thin `packages/notifications`. No WebSocket/live-UI in v1 (polling; a worker comes later).

## Layout
```
apps/nextjs   owner/instructor web (+ tRPC handler + cron)
apps/expo     student mobile
packages/{api,auth,db,domain,notifications,ui,validators}
  domain = pure framework-free business rules (booking policy, approval, capacity,
           stats, payments, rank, referrals, schedule/grid + label formatting)
  notifications = pure transport only (Expo Push + Resend); never throws
tooling/{eslint,prettier,tailwind,typescript,github}
```

## Commands (pnpm)
- `pnpm dev` — run everything · `pnpm dev:next` — web only (:3004) · `pnpm dev:ios` — web + iOS Simulator, one command
- `pnpm typecheck` · `pnpm lint` · `pnpm format:fix`
- `pnpm db:push` — push schema · `pnpm db:studio` — Drizzle studio · `pnpm auth:generate` — regen auth schema

## Conventions
- Read a file before editing it. Absolute paths. Follow existing patterns in the package you touch.
- Do not commit unless asked. No AI co-author trailers.
- v1 non-goals stay out: hard caps, waitlists, no-show tracking, card processing, live UI, the native home widget (see `docs/roadmap.md` "Parked"). Belts/rank came **in** with v1.4 (ADR 41) and manual bank-transfer dues with v1.3 (ADR 40) — they are no longer non-goals.
