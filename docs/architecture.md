# matops — Architecture Design Doc (v1)

*The design of record for **matops** (the from-scratch rebuild of the old app **MAT**). A build team starts here. Pairs with the product [spec.md](./spec.md); every decision below is a resolved wayfinder ticket (links go to the rationale).*

> **Naming:** **matops** = this new project (`/Users/kuna/projects/matops`). **MAT** = the old reference app (`/Users/kuna/projects/mat`); "the old app" always means MAT.

> **✅ Folds in the critical-review wave (tickets 12–21).** The three original over-claims are corrected here: tenant isolation is now **Postgres RLS** (§5), booking is an **atomic conditional `UPDATE`** (§7), and future live updates use a **separate always-on worker**, not SSE on the serverless API (§7/§8). Also folded in: push+email notifications (§7), the `pg`+Fluid+pooler connection (§9), dropped `completed` status, lazy+cron materialization, instructor/approval rules, and the multi-academy switcher.
>
> **➕ Low-friction student wave (tickets 22–27) — product detail lives in [spec.md](./spec.md); captured here at reference level.** Technical shape (to be detailed when we move past conceptual): a new **`enrolledProcedure`** tier lets pending members read + provisionally book/check-in (role still only at approval); `class_participation` gains **`booking_tier`** so only *confirmed* (approved-member) bookings count capacity; a **`drop_in`** table + a public per-gym check-in/lead endpoint (an enumerated public entry point); a **QR check-in** endpoint; and **magic-link** auth. See the stack table's "Student low-friction" row and the schema draft.

---

## 0. As-built status (Phases 0–2 + mobile pass — read this first)

Sections 1–11 are the **conceptual design of record** (the "why", written before code). This section is the **reality on disk** after Phases 0–2 and the mobile pass. Where they differ, this section wins for "what exists today"; the sections below still hold for intent and Phases 2+. Slice-by-slice detail: [../CHANGELOG.md](../CHANGELOG.md); live plan + status matrix: [roadmap.md](roadmap.md); how we build + keep docs true: [delivery.md](delivery.md).

**Built and green** (`pnpm lint typecheck test` all pass, 62 tests): the create-t3-turbo monorepo, the DB layer on **Neon** (connected, all migrations applied), the RLS tenant seam (**verified live on Neon**, not only PGlite), Better Auth (org + magic-link), the tRPC procedure tiers, and — as of **Phase 1 (identity & tenancy)** — owner onboarding, per-role invite links, student/instructor self-join → pending, owner approval, roster (approve/reject/remove/suspend/promote), and the multi-academy switcher; and — as of **Phase 2 (scheduling core, web-first)** — recurring class templates, DST-aware materialization (lazy + daily cron), one-off classes, edit/cancel with future-instance propagation, and the schedule reads (owner web + student API). All **web-first and verified live on Neon** (see the as-built notes below). As of the **mobile pass**, the Expo **student app** is built too — sign-in, join → pending, schedule + read-only class detail, profile + switcher (verified by the static gates + code review; no simulator in the build env). As of **slice 1.7**, mobile join is a plain **6-digit academy-code lookup** (ADR 32) — the owner shares the number, the student types it; the custom-scheme deep-link route is kept for a later iteration. **Not built yet:** universal/App links for the invite flow (deferred to a Phase 5 launch-infra task), and everything from Phase 3 on — booking, attendance, notifications.

**Packages that exist:** `apps/{nextjs,expo}` · `packages/{api,auth,db,domain,validators,ui}` · `tooling/{eslint,prettier,tailwind,typescript,github}`. Scope is `@matops/*`. `packages/notifications` does **not** exist yet (Phase 4).

**Concrete facts that refine the conceptual sections below:**

- **DB driver / connection (refines §9):** a `pg` (node-postgres) `Pool` in `packages/db/src/client.ts`, using the Neon **`-pooler`** string in `POSTGRES_URL` (`sslmode=verify-full`). `drizzle.config.ts` strips `-pooler` so **migrations** run on the direct endpoint.
- **RLS mechanism (refines §5), as implemented:** `withTenant(academyId, fn)` in `packages/db/src/tenant.ts` opens a transaction and runs **`SET LOCAL ROLE matops_app`** + `set_config('app.academy_id', <id>, true)`, then the resolver's queries. `matops_app` is a NOLOGIN, non-BYPASSRLS role (migration `0001`); migration `0003` does `GRANT matops_app TO current_user` so the (non-superuser) connection role can `SET ROLE` to it — **required on managed Postgres like Neon**; PGlite (superuser) doesn't need it. `academy_id` is **text**, no `::uuid`. The RLS example + regression table is `tenant_probe`.
- **Procedure tiers (refines §4), as implemented** in `packages/api/src/trpc.ts`: `publicProcedure` · `protectedProcedure` (authed, kept from template) · **`enrolledProcedure`** (any member incl. pending — this is the one that opens the tenant tx) · `memberProcedure` (active) · `staffProcedure` (owner|instructor) · `ownerProcedure`. The `enforceTenant` middleware reads `session.activeOrganizationId`, loads membership via `getMembership`, checks the pure **`canEnroll`** predicate (only `pending`/`active` may enter the enrolled tier — `suspended`/`removed` keep a row but are refused, ADR **33**), then wraps the resolver in `withTenant`. Role/status checks are pure predicates in `@matops/domain` (`canEnroll`/`isActiveMember`/`isStaff`/`isOwner`), unit-tested. **Fail-closed context (ADR 33):** the tRPC base context carries **no db handle** — the only db a resolver sees is the RLS-scoped `ctx.db` injected by `enforceTenant`, so a non-tenant resolver that reaches for it fails at typecheck; a lint rule (`packages/api/eslint.config.ts`) blocks the raw owner `@matops/db/client` in `packages/api/src/router/**`.
- **`@matops/api` and `@matops/auth` are consumed from SOURCE** (no `.d.ts` emit): the `AppRouter` type embeds the whole Better Auth `Auth` type, too large to serialize (TS7056). Their `exports.types` point at `src` and their tsconfig extends `base.json` (noEmit). Do not revert.
- **Migrations (refines §10):** versioned SQL in `packages/db/migrations`, applied with `pnpm -F @matops/db migrate` (**not** `push` — the RLS role/policy are hand-written in `0001`/`0003`). `drizzle-kit check` runs in CI. Current set (`0000`–`0010`): `0000` core tables + `_health`, `0001` RLS role/policy/probe, `0002` Better Auth org tables (organization/member/invitation + `user.phone` + `session.activeOrganizationId`), `0003` role grant, `0004` `academy_invite` + `member.invited_role`, `0005`/`0006` `class_template` + its RLS, `0007`/`0008` `class` + its RLS, `0009` drop the scaffold `post` table, `0010` `organization.public_code`. A **lint guardrail** (ADR 33) blocks the raw owner `db` in routers so the tenant seam can't be bypassed by accident.
- **Auth (refines §6):** magic-link (`sendMagicLink` logs the URL in dev — Resend is Phase 4) + Organization plugin; roles owner/instructor/student in the client-safe `@matops/auth/permissions`; `member.status` defaults `pending`. Discord OAuth was removed.
- **Testing (refines §10):** RLS/DB behavior is tested with **PGlite** (embedded Postgres) in `packages/db/test`; pure logic with vitest in `packages/domain/test`. CI gates: format · lint · typecheck · test · `drizzle-kit check`.

**Phase 1 as-built (identity & tenancy — web-first):**

- **Invite links** are a **custom `academy_invite` table**, not Better Auth invitations (which are email-bound + single-use → active — the wrong shape). Shareable, per-role (student/instructor), rotatable; **one live link per role** via a partial unique index; **no RLS** because the public join screen resolves a token with no active academy (`invite.resolve` is a `publicProcedure` on the base connection). Owner reads filter by `academy_id`. See [issues/28](issues/28-invite-link-model.md).
- **Pending members hold no academy role.** A self-join inserts a `member` row with `status="pending"`, the harmless default `role="member"`, and a server-controlled **`invitedRole`** field carrying the role to grant. Approval (`approveMembership`, pure) writes `role := invitedRole` + `status := "active"`. The academy **creator** is the exception: an `organizationHooks.afterCreateOrganization` hook sets that owner membership `active` at once (seamless onboarding). See [issues/29](issues/29-pending-role-model.md).
- **New routers** (`packages/api/src/router`): `academy` (create/current/listMine/setActive + **`findByCode`**), `invite` (list/create/rotate/revoke + public resolve), `membership` (join + **`joinByCode`** + roster/approve/reject/remove/suspend/promote). Pure rules in `@matops/domain` (`approveMembership`, `canRemoveOrDemote` = never-ownerless, `isInvitableRole`, `isWebLensMembership`, `isValidAcademyCode`/`CODE_JOIN_ROLE`, `slugify`), unit-tested. Owner mutations re-verify the target member's `academy_id` (the `member` table has no RLS). Remove/suspend run the never-ownerless check **atomically** with the write — `setMemberStatusIfNotLastOwner` locks the academy's member rows (`FOR UPDATE`) in one transaction, so concurrent owner removals can't both pass and strand the gym (ADR 33).
- **Numeric academy code** ([issues/32](issues/32-academy-code-join.md)): every academy has a plain 6-digit `organization.public_code` (NOT NULL + UNIQUE, migration `0010`), assigned by the `afterCreateOrganization` hook (`assignAcademyCode`, crypto-random + collision retry) and backfilled for existing academies. It is the **mobile v1** join key: `academy.findByCode` resolves a code → `{academyId, name}` on the base connection (no RLS on `organization`, like the invite resolve); `membership.joinByCode` creates the same pending membership as the invite join (shared `joinPending` step), with the role fixed to **student** — the Expo app is the student app. Invite links stay for the web.
- **Client-is-the-lens** ([issues/18](issues/18-multi-academy-ux.md)): the web switcher lists academies where you are owner/instructor (or a *pending instructor*); the mobile switcher lists the student-lens academies. **Migrations:** `0004` adds `academy_invite` + `member.invited_role` (+ auth indexes). The Expo student join screen, deep links (`matops://join/<code>`), and the mobile switcher shipped in the **mobile pass** (below). The scaffold `post` demo (Expo screen + router + table) was **retired** in that pass — migration `0009` drops the `post` table.

**Phase 2 as-built (scheduling core — web-first, in progress):**

- **2.1 Class templates:** the scheduling domain lives in `packages/db/src/scheduling.ts`. First table `class_template` (recurring weekly def: `days_of_week int[]`, local `starts_at_minutes` + IANA `time_zone`, `duration_minutes`, `capacity`, `status active|paused`, soft-delete, `generated_until` cursor). It is tenant-scoped exactly like `tenant_probe` — migration `0005` (table) + hand-written `0006_scheduling_rls` (ENABLE RLS + academy policy). The `template` tRPC router (staff tier) does all CRUD on the RLS-scoped `ctx.db`. Pure time/format helpers are in `@matops/domain/schedule`; `date-fns`/`date-fns-tz` are in the catalog for the DST-aware materialization math landing in 2.2. Web O3 panel renders for active staff (owner **or** instructor).
- **2.2 Materialization:** second table `class` (concrete instance; `starts_at` UTC, `booking_count` denormalized display count, `status scheduled|cancelled` — "past" is derived, issue 19; `UNIQUE(template_id, starts_at)`; `template_id` null = one-off) — migration `0007` + RLS `0008`. Pure DST math `computeOccurrences` (local wall-clock + IANA zone → UTC, via `date-fns-tz` `fromZonedTime`, iterating local calendar dates off a noon-UTC anchor so DST never drops/doubles a class) in `@matops/domain`. The IO wrapper `materializeTemplate(exec, template)` + `runMaterializationSweep()` live in `@matops/db`: idempotent `onConflictDoNothing` (returns true inserted count), `generated_until` cursor, stale-first ordering + row limit + soft time budget. **Two triggers** (issue 16): LAZY in the template create resolver on the RLS-scoped `ctx.db`; SCHEDULED via `apps/nextjs/.../api/cron/materialize` (Node runtime, `maxDuration 60`, `CRON_SECRET` bearer check) running on the base connection — the trusted service role that bypasses RLS by design (we never `FORCE` RLS on the owner) — wired daily in `apps/nextjs/vercel.json`. `env.ts` gained optional `CRON_SECRET` (required in prod).
- **2.3 Class instances:** `class` tRPC router (staff): `week` read + one-off `create` (`template_id` null; local date+time → UTC via `instantFromLocalDate`) + `update` (edit + optional reschedule) + `cancel` (status-only). Template edits **propagate to future non-cancelled instances** — the pure `templateTimingChanged` predicate picks update-in-place (content change) vs delete-and-regenerate (timing change); `template.delete` soft-deletes + cancels future classes; resume re-materializes (ADR **30**). Notify-on-change flags (`classChange`) are computed but the send is Phase 4. Web O2 "Schedule" panel (staff): week nav, day groups, soft-capacity red, cancel, add one-off. Per-instance edit UI is a follow-up (the `class.update` API exists).
- **2.4 Schedule read:** the owner web full read is `class.week` (staff, shipped in 2.3). The **student read** is `class.mine` on `enrolledProcedure` (spec S4) — same week window, but a *pending* member may browse (view-only, issue 23), and RLS scopes it to the caller's active academy so a student only ever sees their own gym. Student-lens plumbing for the deferred mobile pass: pure `isStudentLensMembership` + `academy.listMineStudent` (mirror of the web lens). **Phase 2 web-first is complete**; the Expo student schedule UI shipped in the mobile pass (below). Materialization + edit-propagation were verified end-to-end on Neon.

**Mobile pass as-built (Expo student app):**

- **Scheme + shell:** the Expo app scheme is `matops` (`apps/expo/app.config.ts`; bundle ids `com.matops.app`); the client auth `expoClient.scheme` matches. `app/index.tsx` is an **auth gate** — no session → sign-in (S1); session but no active academy → "Join a gym" (S2 — mobile v1 is a 6-digit academy-code lookup, ADR 32); else → schedule (S4). A small NativeWind UI kit lives in `apps/expo/src/components/ui.tsx`. The scaffold `post` demo was retired end to end (Expo screen + tRPC router + table; migration `0009` drops `post`).
- **Sign-in (S1):** magic link, email only (`app/sign-in.tsx`). `@better-auth/expo` rewrites the relative `callbackURL` into the `matops://` deep link; the server `trustedOrigins` is `["matops://"]` — **required**, because the expo plugin only appends the session cookie to the verify-redirect when the location starts with a trusted origin (Expo Go's `exp://` is auto-added in dev). `session.user.phone` is typed via the client `inferAdditionalFields` plugin (explicit schema, no server-`Auth`-type import).
- **Join + pending (S2/S3):** **mobile v1 (ADR 32)** joins by academy code — `app/onboarding.tsx` is a two-phase screen: enter the gym's 6-digit ID → `academy.findByCode` → confirm + minimal profile → `membership.joinByCode` → pending **student**. The `matops://join/[token]` deep-link route (RN twin of the web join flow: `invite.resolve` → `membership.join`, with `extractInviteToken` + `?redirect` through sign-in) is **kept for the next iteration** but no longer the promoted path. Slim S3 pending banner on the schedule.
- **Schedule + detail (S4/S5):** `app/schedule.tsx` reads `class.mine` over a rolling week, grouped by day (Today first), rows show "N spots left"; `app/class/[id].tsx` is a **read-only** detail (booking is Phase 3). New read **`class.get`** (enrolled tier, RLS-scoped, left-joins `user` for the instructor name — additive; `class.mine`/`class.week` untouched, honoring the §6 additive-only contract).
- **Profile + switcher (S7):** `app/profile.tsx` — name/phone/email/current academy/sign out + the **student-lens** switcher (`academy.listMineStudent` + `academy.setActive`, shown only with 2+).
- **Deep links:** custom scheme now (`matops://join/<code>`); **universal/App links (AASA + Android assetlinks + EAS submit) are deferred to a Phase 5 launch-infra task** — ADR [31](issues/31-deep-link-approach.md). Things only a device confirms (no simulator in the build env): the magic-link deep-link return, `matops://` link resolution, and the slice-1.7 code-join flow — see the [mobile device-test checklist](mobile-device-test.md).

---

## 1. Principles (the spine)

Four constraints drove every choice; when in doubt, re-derive from these:

1. **Minimal vendor lock** — portable/ejectable core: standard Postgres, open auth, no proprietary reactive engine. (Convex + Clerk deliberately rejected.)
2. **Simple now, expandable without a major refactor** — MVP is small; the *seams* for later domains are placed now (§8).
3. **Solo builder, move fast, DX-first** — fewest moving parts; shared types; no codegen pipelines.
4. **Agentic-coding first** — a maximally conventional, well-documented stack agents know cold → the **create-t3-turbo** pattern.

We also carry forward three *patterns* (not code) from the old app: **domain partitioning**, a **pure policy layer**, and a **structural tenancy seam**.

---

## 2. Stack at a glance

| Layer | Choice | Ticket |
|---|---|---|
| Monorepo | Turborepo + pnpm | [07] |
| Owner web | Next.js (App Router) + shadcn/ui + Tailwind + TanStack Query → **Vercel** | input / [11] |
| Student mobile | Expo (React Native) + NativeWind + react-native-reusables → **EAS** | input / [11] |
| API | **tRPC** colocated in Next.js (internal-only; `trpc-to-openapi` hedge) | [01],[15] |
| Auth | **Better Auth** + Organization plugin (Expo secure-store, org/role) **+ magic-link** | [02],[14],[26] |
| Student low-friction | **provisional (no-spot) booking** for pending; **QR self check-in**; **public drop-in/lead form** | [22]–[26] |
| DB access | **Drizzle** + Postgres (**Neon**); driver **`pg` on Vercel Fluid compute → Neon `-pooler`** | [03],[21] |
| Multi-tenancy | shared DB + `academyId` + **Postgres RLS**; tRPC middleware sets `app.academy_id` per request | [05],[12] |
| Real-time | **none in v1** — TanStack polling. Live-UI later = a **separate always-on worker** (LISTEN/NOTIFY→SSE), not the serverless API | [04] |
| Notifications | **push (Expo) + email (Resend)** in v1, via a thin helper — all serverless HTTPS | [17] |
| Scheduling | recurring templates **materialized lazily on save + a bounded daily Vercel Cron** | [08],[16] |

*Whole stack is TypeScript end to end.*

[01]: issues/01-api-contract-and-runtime.md · [02]: issues/02-auth-stack.md · [03]: issues/03-postgres-access-layer.md · [04]: issues/04-realtime-strategy.md · [05]: issues/05-multitenancy-model.md · [06]: issues/06-hosting-topology.md · [07]: issues/07-monorepo-structure.md · [08]: issues/08-mvp-domain-model.md · [11]: issues/11-design-system.md · [12]: issues/12-tenant-isolation-mechanism.md · [13]: issues/13-booking-write-atomicity.md · [14]: issues/14-better-auth-approval-feasibility.md · [15]: issues/15-api-deployment-shape.md · [16]: issues/16-materialization-job-scaling.md · [17]: issues/17-class-cancellation-notification.md · [18]: issues/18-multi-academy-ux.md · [21]: issues/21-neon-connection-model.md · [22]: issues/22-provisional-booking-capacity.md · [23]: issues/23-pending-capability-never-block.md · [24]: issues/24-qr-self-checkin.md · [25]: issues/25-dropin-lead-form.md · [26]: issues/26-seamless-registration-deeplink.md · [27]: issues/27-home-widget.md

---

## 3. Monorepo layout

```
apps/
  nextjs/        owner web + tRPC API route handler (/api/trpc/[trpc]) + cron endpoint
  expo/          student mobile
packages/
  api/            tRPC routers + procedures (the contract; both apps import its type)
  db/             Drizzle schema (per-domain files) + RLS policies + tenantTx() helper + migrations
  auth/           Better Auth server config (Organization plugin) + client helpers
  validators/     Zod schemas shared by api + clients
  domain/         PURE business logic — booking policy, materialization math (no React/Next/Expo/ctx)
  notifications/  thin helper: notifyUsers() (Expo Push) + sendEmail() (Resend)
  ui/             shared design tokens (Tailwind preset) + shareable headless bits
tooling/
  eslint/ tsconfig/ tailwind/    shared presets
```

**Dependency direction:** `apps/*` → `packages/*`; packages never import apps. `db`, `validators`, `domain` are platform-agnostic leaves. **`packages/domain` must stay framework-free** so the server *and* both clients import the same policy functions — this is the re-derived "pure policy layer" and the key testability seam.

---

## 4. Request lifecycle (the core path)

```
Client (web in-process | Expo over HTTPS)
  → tRPC procedure
    → auth middleware     : Better Auth validates session → ctx.user
    → tenant middleware   : read active academy (Better Auth activeOrganizationId) →
                            load the member row → assert status='active' + role →
                            open a tx and set_config('app.academy_id', id, true)  (ctx.tx)
    → procedure resolver  : calls packages/domain (pure) for decisions;
                            all reads/writes go through ctx.tx — Postgres RLS
                            filters every row to app.academy_id
      → Drizzle (pg) → Postgres (Neon, non-BYPASSRLS role)
```

The **procedure tiers**: `protectedProcedure` (authed) → `memberProcedure` (authed + active membership, opens the RLS tx) → `staffProcedure` (owner **or** instructor) → `ownerProcedure`. Because RLS filters in the database, resolvers can run plain Drizzle queries and still cannot read another academy's rows.

---

## 5. Tenancy — Postgres RLS (the load-bearing idea)

- **Shared DB, `academyId` on every tenant row, academyId-leading indexes.**
- **Postgres RLS is the guarantee.** Every tenant table has RLS enabled + a policy `USING (academy_id = current_setting('app.academy_id'))` (and a matching `WITH CHECK` for writes). Note `academy_id` is **`text`** (it holds Better Auth's `organization.id`, a random string, not a UUID) — the policy compares text to text, no cast. The app connects with a **non-`BYPASSRLS` role**. The tenant middleware opens a per-request transaction and runs `select set_config('app.academy_id', <id>, true)` (transaction-local) — the local scope matches the Neon pooler's checkout boundary, so the setting never leaks to a reused connection ([21]).
- **Why RLS, not an app-side `scopedDb` wrapper:** auto-injecting `where academy_id` into every select/join/update/delete is easy to get wrong (a missed join or raw query leaks). With RLS the middleware sets **one variable** and Postgres does the filtering — app queries stay plain Drizzle and **cannot** leak, even from a buggy query. This is the true by-construction property (the earlier "no RLS, scopedDb" plan was reversed by the review).
- **Deletion test:** remove the middleware and requests lose their `app.academy_id` → RLS returns *nothing* (fails closed), not another academy's rows. Structural, not disciplinary.
- **Guardrails:** a lint rule forbids resolvers opening a connection outside the tenant helper; the CI **cross-tenant leak test** (foreign `academy_id` → assert empty) stays as a regression net on the policies.
- **Identity via Better Auth:** `organization` = academy (`academyId === organization.id`), `member` = membership (role + `status` pending/active), `invitation` = invite link. **These tables keep the plugin's own scoping — do not force RLS on them.** Global/cross-tenant tables (e.g. a future games catalog) get no academy policy and are reached by a trusted **service role** (an enumerated, server-only exception — used by system jobs, never request handlers).
- **Active academy** comes from Better Auth's `activeOrganizationId`; switching academy = `setActive()` → the next request's `app.academy_id` changes ([18]).

---

## 6. Auth flows (web + mobile)

- **Web:** Better Auth cookie session; server components/route handlers read it; tRPC middleware validates.
- **Mobile:** `@better-auth/expo` persists the session in `expo-secure-store` (Keychain/Keystore), auto-attaches it to tRPC calls; refresh validated server-side. **As built (mobile pass):** passwordless **magic link** (email only) — the client rewrites the relative `callbackURL` into the app's `matops://` deep link, so opening the verified link bounces back into the app and the auth gate routes onward. The server `trustedOrigins` must list the app scheme (`["matops://"]`) — the expo plugin only appends the session cookie to the verify-redirect when its location starts with a trusted origin (Expo Go's `exp://` is auto-added in dev). Custom-scheme deep links require a **dev build**, not Expo Go. The client mirrors the server's `user.phone` additional field with the `inferAdditionalFields` plugin (explicit schema) so it stays typed without importing the heavy `Auth` type.
- **Authorization** is *ours*: authN + org/role come from Better Auth; resource-level rules live in the tenant/role tRPC procedures.
- **Approval + the status trap ([14]):** Better Auth's access checks are **role-based and ignore our `status` field** — a `pending` member who holds a role would pass every check. So we **grant the role only at approval**: a student joining via the student link lands `pending` with **no role** (harmless); the owner approves → role assigned + `status='active'`. Instructors join active via the instructor link. Defense-in-depth: `memberProcedure` also rejects `status !== 'active'`. Pin the Better Auth version + an integration test (`additionalFields` inference bugs).
- **Contract discipline (mobile version skew):** store apps linger on old builds → tRPC procedures are **additive-only** (never change/remove a shape a shipped app calls). This is the one operational rule the internal-tRPC choice demands; enforce it in review.

---

## 7. Scheduling engine

- **Materialize lazily on save + extend by cron ([16]):** creating/editing a `class_template` materializes its near-term `class` rows **immediately** (in-request), so schedules appear at once. A **bounded daily Vercel Cron** then extends every active template out to a rolling **~6-week horizon** — processing templates **stale-first** with a `LIMIT` + soft time budget, so it never approaches the serverless duration ceiling; leftovers resume next tick. Idempotent via `UNIQUE(templateId, startsAt)` + cursor `template.generatedUntil`. The cron runs cross-academy under the **service role** (outside the tenant seam). Time math (local `startsAtMinutes` + IANA tz → UTC instant, DST-aware) lives in `packages/domain`.
- **One-off classes:** `templateId` nullable → special classes cost nothing extra.
- **Class status is `scheduled | cancelled` only ([19]).** "Past/done" is **derived** from `starts_at + duration < now()` — no stored `completed`, no sweep job.
- **Booking = idempotent upsert + atomic count claim ([13], [22]) — as built (slice 3.1):** inside the request's RLS transaction (`ctx.db`), the `booking` router (`book`/`cancel` on `enrolledProcedure`) first upserts the `class_participation` row — `INSERT … ON CONFLICT (class_id, student_id) DO UPDATE SET booking_status='booked', … WHERE booking_status <> 'booked' RETURNING id` — so `UNIQUE(class_id, student_id)` prevents double-book, a returned row marks a real transition (new **or** re-book flipping `cancelled → booked`), and no row means already-booked (idempotent, count untouched). Then, **only on a real transition of a `confirmed` booking**, an **atomic `UPDATE class SET booking_count = booking_count + 1`** — v1 **drops the `booking_count < capacity` guard** (soft cap, never blocked, §4); the row lock still serializes concurrent claims (no `SELECT … FOR UPDATE`). **Two tiers ([22]):** `confirmed` (approved member) counts; `provisional` (pending member) is recorded + tagged "pending approval" but never moves the count. Cancel mirrors it (floored `GREATEST(count−1,0)`, confirmed-only). Both statements share the one request tx, so they commit/roll back together. This is why **no real-time is needed** for correctness — only display freshness, handled by polling.
- **Attendance = the second axis of `class_participation` ([08]) — as built (slice 3.3):** the same row carries `attendance_status` (`unmarked|present|absent`) orthogonal to booking, plus a `none` booking value for walk-ins (attended without booking — never counted). The `attendance` router is **staff-only** (owner + instructor see names): `roster` (booked + walk-ins + drop-ins, with header counts via pure `attendanceCounts`), `mark`, and `addWalkIn`. Marking is gated to the **14-day backfill window** (`canMarkAttendance`, spec O5). Roster `visitCount` ("attended N×") is a present-count grouped by student.
- **QR check-in = book + attend ([24]) — as built (slice 3.4):** the `checkin` router (`enrolledProcedure`) reuses the booking write **and** sets `attendance='present'` in one RLS tx — present even if full, idempotent, pending → provisional. `resolveCheckInClass` (pure) picks the current/next class **server-side** so the Expo app needs no domain dep. v1 has no camera: the app uses the active academy; the physical QR carries no-app visitors to the drop-in form.
- **Public drop-in = the one tenant-seam exception ([25], [12]) — as built (slice 3.5):** the `dropIn.submit`/`academyInfo` procedures are **`publicProcedure`** (unauthenticated). Having no session, they can't use `withTenant`; instead they call `@matops/db` helpers that write on the **trusted base connection** (table owner, bypasses RLS — we never `FORCE` it), each pinned to a validated `academy_id`. The `drop_in` table dedupes by `UNIQUE(academy_id, phone)` (repeat visit → `visit_count++`), carries its own contact + implied `present` attendance (a drop-in has no `user.id`), and has the standard RLS policy for **owner reads**. Consent is required (`z.literal(true)` + `canSubmitDropIn`).
- **Notifications ([17]):** class-cancelled → push + email to booked students; class reminder (cron) → push; membership-approved → push. Sent through `packages/notifications` from the relevant mutations/cron. No open connection, no comms domain.
- Full data model + invariants: [08] and [assets/schema-draft.ts](./assets/schema-draft.ts).

---

## 8. Expansion seams — how deferred domains plug in without a refactor

The whole "expandable" constraint lives here. Each deferred domain is **additive**: a new `packages/db/schema/<domain>.ts`, a new tRPC router mounted on the root, optionally new `packages/domain/<domain>` pure logic — no change to the tenancy seam, the request path, or existing tables.

| Deferred domain | Plug-point | Why it's additive |
|---|---|---|
| **Billing / memberships / payments** | new tables (`membership_type`, `subscription`, `payment`) all carrying `academyId`; a `billing` router; a **payment-gate** step composed *before* the booking resolver | booking already funnels through one tenant procedure — insert a gate; nothing existing changes |
| **Curriculum / games** | `games` as a **global, cross-tenant** table (no `academyId`) reached via an explicit `globalProcedure` escape hatch (mirrors the seam's allowlist idea); academy curriculum tables are tenant-scoped and reference it | the seam already anticipates a small enumerated global set |
| **Comms (announcements + in-app DMs)** | `comms` schema + router. *(Transactional push/email already exist in v1 via `packages/notifications`; this adds the in-app messaging surface.)* | no coupling to scheduling beyond reading class/booking ids |
| **Belts / rank** | per-discipline `belt` + `belt_history` tables, tenant-scoped; a `curriculum`/`identity` router | pure additive; attendance recency signal already exists |
| **Live in-app updates (WebSocket/SSE)** | a **separate always-on worker** (Fly/Railway) holds the connections and listens to Postgres `LISTEN/NOTIFY`; mutations publish events to it; clients subscribe. *Cannot* live on the serverless API ([15]) | "serverless publishes, a worker subscribes." v1 polling upgrades in place; the main API doesn't move (kept extraction-ready) |
| **Tiers / entitlements** | a single `getEntitlements(academy)` resolver + a gate; frontend hides nav | one gate, not per-feature tier reads (old app's proven shape) |
| **Cross-academy views / hard isolation** | aggregated "all my gyms" screens are additive reads over existing memberships; harder physical isolation = promote a tenant to its own schema/DB | RLS is already the v1 guarantee (§5); these are further steps, not the baseline |

**Rule of expansion:** a new domain adds a schema file + a router + (maybe) pure logic. If adding one forces edits to the tenancy layer or existing tables, that's the signal the boundary is wrong — fix the boundary, not the caller.

---

## 9. Deployment topology

```
Vercel ────── apps/nextjs (web + tRPC API + cron endpoint)   [Fluid compute]
Neon ──────── Postgres (single shared DB; Better Auth + domain tables)
                connect: pg driver → Neon "-pooler" endpoint, non-BYPASSRLS role
EAS ───────── Expo builds / OTA / store submission
Vercel Cron ─ daily → /api/cron/materialize (protected, service role)
Expo Push ── phone notifications   |   Resend ── email       (both: outbound HTTPS)
```

**Escape hatches (nothing is a one-way door):** Next containerizes off Vercel (Docker → Fly/Railway/self); Postgres migrates by dump/restore; the tRPC routers (pure) extract onto `@hono/trpc-server` if a standalone API is ever wanted; **future live-UI adds a separate always-on worker** without moving the API; EAS is build tooling, not data lock.

---

## 10. Cross-cutting engineering

- **Migrations:** `drizzle-kit generate` (versioned SQL) in CI, applied on deploy; `push` in local dev only.
- **Validation & errors:** Zod at the tRPC boundary; typed error codes (re-derive the old app's `DomainError` set: `NOT_FOUND`, `FORBIDDEN`, `CLASS_FULL`, `BOOKING_NOT_ALLOWED`, …) surfaced as tRPC errors clients map to human toasts.
- **Testing:** unit-test `packages/domain` (pure → trivial); integration-test tRPC procedures against a test Postgres; **cross-tenant leak suite** in CI (asserts the RLS policies deny a foreign `academy_id`); a Better Auth `additionalFields`/approval integration test ([14]). This is why the pure/boundary split matters — the hard logic is testable without the framework.
- **Guardrails:** lint rule forbidding resolvers from opening a db connection outside the tenant helper (so `app.academy_id` is always set); `packages/domain` may not import React/Next/Expo/tRPC.
- **Observability (thin v1):** platform logs (Vercel/Neon) + an append-only `audit_log` table for owner-facing "what happened" — a documented next step, not built day 1.

---

## 11. Open items carried into build (from the map's fog)

Not blockers; sharpen during implementation: offline/sync behavior, CI/observability depth, dev seeding. **Deep-link setup for the invite flow — partly resolved (ADR [31](issues/31-deep-link-approach.md)):** the mobile pass ships **custom-scheme** deep links (`matops://join/<code>`) + an in-app paste fallback, which need no hosting or store accounts. The **universal/App-link** half (Apple App Site Association + Android assetlinks + EAS submit) is deferred to a **Phase 5 launch-infra** task — it needs the user's Apple Developer + Google Play + EAS accounts and a hosted domain. Tracked in the map's *Not yet specified*.

---

*Status: all 27 decision tickets resolved; product scope locked (spec.md); **Phase 0 built** — see §0 for the as-built reality and [roadmap.md](roadmap.md) for what's next (Phase 1). This doc stays the design of record: §0 is what exists, §§1–11 are the intent that guides Phases 1+.*
