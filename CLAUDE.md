# matops — project guide for Claude

**matops** is a multi-academy admin SaaS for grappling gyms: an **Expo** student app + a **Next.js** owner/instructor web app, one TypeScript monorepo. It is a from-scratch rebuild; the old app **MAT** (`/Users/kuna/projects/mat`) is reference only, never a base.

## Current state — Phases 0–4 + mobile pass + v1.1 UX pass complete
Foundations, the identity join loop (Phase 1), the scheduling core (Phase 2), **booking & attendance** (Phase 3), **notifications & polish** (Phase 4), and the **Expo student app** (mobile pass) are built and green (`pnpm lint typecheck test` all pass; plus the Expo static gates). A **v1.1 "make-it-usable" UX pass** then restructured both clients on the same feature set (no new domains) — a fresh **matops brand** (violet signature + basketweave mark + shared tokens, ADR 37), a **web app shell** (Next `(app)/` route group: sidebar + mobile bottom-tabs, 5 routed screens — Dashboard/Schedule/Roster/Attendance/Settings — owner/instructor role split, a new O1 command-center dashboard, and a scannable venue **QR poster** via `qrcode.react`), **academy rename** (`academy.rename`; name = mutable label, code = the immutable identifier), and a **mobile tab bar** (Schedule/Check-in/Profile) with screens ported to explicit RN styles + brand (ADR 38). Planned as the `.scratch/usable-v1/` wayfinder map (all tickets resolved); verified by static gates + `next build`, **device visual check still pending**. See `docs/architecture.md` §0 + `docs/design.md`. A **Neon** database is connected in `.env`, all migrations (`0000`–`0013`) are applied, and materialization, template-edit propagation, and the Phase-3 booking/attendance/drop-in schema are **verified live on Neon**. A tenant-seam hardening pass (ADR 33) made the RLS seam fail-closed (no db handle on the base tRPC context + a lint guardrail on routers), fixed the enrolled-tier fail-open (`canEnroll` excludes suspended/removed), and made "never ownerless" atomic.

- **Works now (Phase 3 — booking & attendance):** student **book/cancel** (soft capacity, `booking` router, mobile S5) with a confirmed/provisional two-tier count; **QR self check-in** = book + attend (`checkin` router, mobile S8); staff **attendance** (`attendance` router, web O5 — mark present/absent, add walk-ins); **public drop-in** lead form (`drop_in` table, the first `publicProcedure`, web `/checkin/[academyId]`, consent + phone dedupe) with owner O4 leads + O6 venue link.

- **Works now (web):** magic-link sign-in → **Start a gym** (creator is an active owner) → per-role **invite links** → self-join **pending, no academy role** (intended role on `member.invitedRole`) → owner **approves** → role granted. Roster (never-ownerless) + multi-academy switcher. **Scheduling (staff):** recurring **class templates** (O3), **one-off classes** + edit/cancel (O2), DST-aware **materialization** (lazy on save + a daily Vercel Cron), and the **schedule read** (`class.week`). All under the RLS tenant seam.
- **Works now (mobile — Expo student app):** magic-link **sign-in** (S1) → **join** via `matops://join/<code>` deep link or in-app paste (S2) → **pending** with the S3 banner → **schedule** (S4, `class.mine`) → read-only **class detail** (S5, `class.get`) → **profile + student-lens switcher** (S7). Custom-scheme deep links (universal/App links deferred to Phase 5 — ADR 31). Verified by the Expo static gates + code review; a device-test checklist was handed off (no simulator in the build env).
- **Does NOT exist yet:** Phase 4 (notifications & polish), Phase 5 (launch hardening + booking-count reconciliation + the **universal/App links** — the app uses a custom scheme today), and one flagged follow-up — rendering the O6 venue check-in link as a scannable QR image (needs a QR lib). The scaffold `post` demo is **retired** (Expo screen + router + table dropped, migration `0009`).
- Key ADRs: Phase 1 — `docs/issues/28` (custom invite table) + `29` (pending holds no role). Phase 2 — `08`/`16` (data model + materialization) + `19` (no `completed` status) + `30` (template-edit propagation).
- **Infra note:** set **`CRON_SECRET`** in the Vercel project so the daily `/api/cron/materialize` job runs (it refuses to run unprotected in production).
- Live plan + per-slice status matrix: `docs/roadmap.md`. What shipped, slice by slice: `CHANGELOG.md`. Design of record (with an "as-built" section 0, incl. Phases 1–3 + the mobile pass): `docs/architecture.md`. **Next: Phase 4** (notifications & polish).

## Run it
- `pnpm install`, then `pnpm dev:next` → **http://localhost:3004** (port 3000 is kept free on purpose). Sign in via the magic-link form; copy the `[auth] magic link …` URL from the terminal into the browser (no email provider needed — it prints to the terminal).
- **`pnpm dev:ios`** — one command to prepare + run the whole iOS stack: installs deps if needed, starts the web/API on 3004, then boots the Expo app in the iOS Simulator (Metro + dev-client build). Env-tolerant: missing email (Resend) / push (EAS) config just no-ops. `pnpm dev:ios "iPhone Air"` picks a simulator.
- `pnpm test` — PGlite RLS leak tests (probe + `class_template` + `class`) + health + pure domain logic (access, approval, invite, schedule, DST materialization, edit rules); no database needed.
- `pnpm -F @matops/db migrate` applies migrations to `POSTGRES_URL`; `pnpm -F @matops/db seed` writes a probe row.
- `.env` holds `POSTGRES_URL` (Neon **pooled** string, `sslmode=verify-full`) + `AUTH_SECRET`, plus **`CRON_SECRET`** for the materialization cron (required in production; optional in dev). Note: `.env.example` still shows a Supabase placeholder (it was permission-locked during scaffolding).

## Phase 0 gotchas (do not "fix" these)
- **`@matops/api` and `@matops/auth` are consumed from SOURCE** — `exports.types` point at `src`, tsconfig extends `base.json` (noEmit). The tRPC `AppRouter` embeds the full Better Auth `Auth` type, too large to serialize into a `.d.ts` (TS7056). Do NOT switch them back to `compiled-package.json`.
- **RLS needs `SET LOCAL ROLE matops_app` + a role grant.** The request tx sets that role and `app.academy_id`. Migration `0003` does `GRANT matops_app TO current_user` because a managed-Postgres connection role isn't a superuser — without it you get "permission denied to set role". PGlite (superuser) masks this.
- **Use `migrate`, not `db:push`.** The RLS role/policy live in hand-written migrations (`0001`, `0003`); `push` only diffs the schema file and skips them.
- **Tests:** RLS/DB behavior → PGlite in `packages/db/test`; pure logic → vitest in `packages/domain/test`. Each has its own `test/tsconfig.json` (keeps `build`/`typecheck` on `src`).

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
- **Auth:** Better Auth + Organization plugin (org = academy, `academyId === organization.id`) + magic-link. Expo secure-store sessions.
- **DB:** Drizzle + Postgres (**Neon**). Driver = **`pg`** on the Neon **`-pooler`** endpoint (needed for the per-request RLS transaction — the HTTP driver can't do interactive tx).
- **Tenancy:** Postgres **RLS**. Per-request tx sets `set_config('app.academy_id', <org id>, true)`; policy `USING (academy_id = current_setting('app.academy_id'))`. `academy_id` is **text** (Better Auth org id), never cast to uuid.
- **Web:** Next.js App Router on Vercel + shadcn/ui + Tailwind. **Mobile:** Expo/React Native + NativeWind, via EAS. **State:** TanStack Query.
- **Notifications (Phase 4):** Expo Push + Resend, thin `packages/notifications`. No WebSocket/live-UI in v1 (polling; a worker comes later).

## Layout
```
apps/nextjs   owner/instructor web (+ tRPC handler + cron)
apps/expo     student mobile
packages/{api,auth,db,validators,domain,ui}
  domain = pure framework-free business rules (booking policy, approval, capacity)
tooling/{eslint,prettier,tailwind,typescript,github}
```

## Commands (pnpm)
- `pnpm dev` — run everything · `pnpm dev:next` — web only (:3004) · `pnpm dev:ios` — web + iOS Simulator, one command
- `pnpm typecheck` · `pnpm lint` · `pnpm format:fix`
- `pnpm db:push` — push schema · `pnpm db:studio` — Drizzle studio · `pnpm auth:generate` — regen auth schema

## Conventions
- Read a file before editing it. Absolute paths. Follow existing patterns in the package you touch.
- Do not commit unless asked. No AI co-author trailers.
- v1 non-goals stay out: hard caps, waitlists, no-show tracking, billing, belts, live UI, home widget (see `docs/roadmap.md` "Parked").
