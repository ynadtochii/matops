# matops — project guide for Claude

**matops** is a multi-academy admin SaaS for grappling gyms: an **Expo** student app + a **Next.js** owner/instructor web app, one TypeScript monorepo. It is a from-scratch rebuild; the old app **MAT** (`/Users/kuna/projects/mat`) is reference only, never a base.

## Current state — Phase 0 complete (foundations)
The monorepo is scaffolded and the data + auth + API foundation is built and green (`pnpm format lint typecheck test` all pass; 10 tests). A **Neon** database is connected in `.env`, all migrations are applied, and RLS tenant isolation is **verified live on Neon** (not only the embedded PGlite test).

- **Works now:** magic-link sign-in (the link prints to the dev console — email is Phase 4), reading/writing Neon via the `post`/`system` tRPC routers, and the RLS tenant seam under every scoped procedure.
- **Does NOT exist yet:** any UI to create an academy or approve members — that's **Phase 1**. So the tenant-scoped tiers (`enrolled`/`member`/`staff`/`owner`) can't be clicked through in the browser yet, though they are built and type-safe.
- Live plan + per-slice status matrix: `docs/roadmap.md`. What shipped, slice by slice: `CHANGELOG.md`. Design of record (with a Phase-0 "as-built" section 0): `docs/architecture.md`. **Next: Phase 1** (identity & tenancy).

## Run it
- `pnpm install`, then `pnpm dev:next` → http://localhost:3000. Sign in via the magic-link form; copy the `[auth] magic link …` URL from the terminal into the browser.
- `pnpm test` — RLS leak test (PGlite) + health + domain access predicates; no database needed.
- `pnpm -F @matops/db migrate` applies migrations to `POSTGRES_URL`; `pnpm -F @matops/db seed` writes a probe row.
- `.env` holds `POSTGRES_URL` (Neon **pooled** string, `sslmode=verify-full`) + `AUTH_SECRET`. Note: `.env.example` still shows a Supabase placeholder (it was permission-locked during scaffolding).

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
- `pnpm dev` — run everything · `pnpm dev:next` — web only
- `pnpm typecheck` · `pnpm lint` · `pnpm format:fix`
- `pnpm db:push` — push schema · `pnpm db:studio` — Drizzle studio · `pnpm auth:generate` — regen auth schema

## Conventions
- Read a file before editing it. Absolute paths. Follow existing patterns in the package you touch.
- Do not commit unless asked. No AI co-author trailers.
- v1 non-goals stay out: hard caps, waitlists, no-show tracking, billing, belts, live UI, home widget (see `docs/roadmap.md` "Parked").
