# matops: Architecture Design Doc

_The design of record for **matops**, the from-scratch rebuild of the old app **MAT** (`/Users/kuna/projects/mat`). Pairs with the product [spec.md](./spec.md). §0 is what the code does now. §§1-11 are the design intent behind it; where they differ, §0 wins. History lives in the ADRs ([map.md](map.md)) and [../CHANGELOG.md](../CHANGELOG.md)._

---

## 0. As-built status (read this first)

### The first release (ADR 142)

[ADR 142](issues/142-first-release-approval-only-booking.md) and [first-release-plan.md](first-release-plan.md) define the release: **one BJJ academy per gym** and **approval-only booking**, on the web. The Expo app is not changed but calls the same API.

**Admission.** `entity.membership_enforced_at` is the one payment flag. `provisionEntityRows` in `packages/db/src/provision.ts` writes the caller's value or null, so every new academy starts with payment off. `bookingGate` in `packages/api/src/payments-gate.ts` refuses a membership that is not active, then skips the payment check when the flag is null. `booking.book` and `checkin.checkIn` run on `memberProcedure` and always call the gate. No procedure sets the flag: turning payment on needs a later release or a direct database change, and the gate then applies with no other code change.

**Readers follow the flag.** `accessPlan.mine` returns no warning and the roster returns no payment verdict for an academy with the flag off. `entity.list` rows carry `membershipEnforced`. Academy screens read `academy.current().membershipEnforced`; gym screens read `useAnyBranchTakesPayment()` in `apps/nextjs/src/app/_components/entity.tsx`. With the flag off, the payment queries are disabled, the Membership and Memberships menu items are hidden, and `/entities/<id>/payments` and `/memberships` show a plain "not in use" state.

**Owner cancel.** `booking.cancelFor` is a staff-tier procedure that refuses anyone but an owner. It locks the schedule revision, cancels the named person's `booked` row, releases a confirmed seat and bumps the revision. Nobody books for a student past the window.

**Setup.** Gym creation is invite-only (ADR 149): Better Auth's `allowUserToCreateOrganization` runs `canCreateGym` (`packages/domain/src/gym-creator.ts`) against `GYM_CREATOR_EMAILS`, which covers both `organization.create` and the raw auth endpoint, and `/start` shows a Request a demo message instead of the form to anyone not listed. `/start` renders `create-gym.tsx`: one form that calls `organization.create`, then `entity.create` with type `bjj_academy`, the same name and a time zone. It opens `/entities/<id>`. A gym with no academy lands on `/start` in resume mode, which calls only `entity.create`. `organizationSetup` in `packages/domain/src/organization-setup.ts` lists academy, location and time zone, schedule, invite, first approved student and first booking; `organization.setup` passes `paymentsOn`, which adds plan, bank, assign and ready. The dashboard shows `SetupChecklist` to owners and managers until it is complete or closed.

**Landing and navigation.** `apps/nextjs/src/app/(app)/page.tsx` opens the first academy the caller can reach, sends an owner with none to `/start`, and shows the join-by-code form to anyone else. `app-shell.tsx` draws one flat sidebar for the academy. Staff see Dashboard, Schedule, Students, Coaches and Settings (Settings for owners and managers only), plus Memberships while payment is on. Students see Schedule, My classes, Profile, and Membership while payment is on. `ROUTE_ACCESS` in `packages/domain/src/entity.ts` decides what a role is offered; the tRPC tier is the guard.

**Removed.** The reception screens, public booking (`/book/<code>` and the `visitor` router), referrals, curriculum, general spaces, the gym overview, People, person and gym settings screens with the academy selector, the notifications page and its delivery retry procedures, `entity.setMembershipEnforced`, and `booking.bookFor`. The list, with procedures, is in the ADR 142 addendum "dead code removed".

### Routes

- **Signed-in web (`apps/nextjs/src/app/(app)`):** `/entities/[entityId]` (dashboard for staff, schedule for students) and its `attendance`, `class/[id]`, `coaches`, `members`, `payments`, `profile`, `schedule`, `settings` and `training` pages; `/memberships`; `/profile` (forwards into the current academy); `/` (the landing rule above).
- **Public:** `/sign-in`, `/start`, `/join/[token]` (invite link), `/drop-in/<token>` (the drop-in visitor form, ADR 147), `/desk/<token>` (the desk check-in tablet, ADR 150), `/privacy`, and `/linear-ds` (the unlinked design-system reference page, ADR 141).
- **Route handlers:** `/api/auth/[...all]` (Better Auth) and `/api/trpc/[trpc]`. There are no cron or public REST routes.

### API

`packages/api/src/root.ts` mounts `academy`, `entity`, `organization`, `accessPlan`, `account`, `invite`, `membership`, `template`, `class`, `dataTransfer`, `booking`, `attendance`, `checkin`, `person`, `rank`, `note`, `notification`, `dropIn`, `pushToken` and `stats`. The procedure tiers and their checks are in §5. The only `publicProcedure`s are `invite.resolve`, `dropIn.resolve`, `dropIn.submit` (ADR 147), and `dropIn.academyInfo`, with different rate limiters: `invite.resolve` and `dropIn.academyInfo` use an in-process counter per instance; `dropIn.resolve` and `dropIn.submit` use a Postgres fixed-window counter shared across instances (ADR 147, `rate_limit` table, keyed by IP + token SHA-256 hash, 10 tries per 10 minutes per link). Every procedure the Expo app calls is kept.

### Data

Migrations live in `packages/db/migrations`: `0000_baseline` (the base schema, the `matops_app` and `matops_debug_ro` roles, `GRANT matops_app TO current_user`, default privileges, RLS policies) and `0001` to `0011`. `0004_first_release_drops.sql` drops the tables `reception_link`, `curriculum_track`, `curriculum_block_template`, `curriculum_block`, `member_referral`, `member_referral_audit`, the enum `referral_action`, and the removed features' columns on `organization`, `academy_profile`, `class_template`, `class` and `drop_in_visit`. **Deploy order:** a migration runs while the old build still serves, so `0004` ships in a later deploy than the code that stopped reading those tables. `0006_erasure_request` adds the nullable `entity_membership.erasure_requested_at` (ADR 145). `0009_drop_in_link` adds `drop_in_link` (one live token per academy, no RLS), `rate_limit` (fixed-window counter, no RLS), and columns to `drop_in` for visitor answers (belt, stripes, health, email_updates_at, waiver_id, waiver_accepted_at; ADR 147). `0010_desk_link` adds `desk_link` (one live desk token per academy, no RLS, no grant to `matops_app`; ADR 150). `0011_drop_in_shared_by` adds `drop_in.shared_by_membership_id` (foreign key to `entity_membership`, `ON DELETE SET NULL`, partial index `di_by_sharer`; ADR 151). Dev has `0000` to `0009` applied; production has none applied yet.

The tenant model (organization, entity, `entity_membership`, `person`, academy and gym tables) is in §5. Other tables worth knowing:

- **Schedule:** `class_template` and `class`. A template save fills classes out to `MATERIALIZATION_HORIZON_DAYS` (180, `packages/domain/src/schedule.ts`). `template.extend` adds future instances; `template.rebuildPreview` and `template.rebuild` take a preview version, recheck the schedule revision, cancel stale scheduled rows, keep past and one-off classes, never revive a cancellation, and refuse stale classes with active bookings. Both are owner-or-manager. New classes are soft capacity.
- **Booking and attendance:** one `class_participation` row per person per class carries both the booking and the attendance. The academy's `booking_window_days` (1-90, default 7) limits how far ahead a student books; `academy.updateSettings` accepts it, and the web has no control for it. `attendanceWriteAccess` (`packages/domain/src/attendance.ts`) lets staff mark within 14 days; older changes need an owner or manager and a reason, recorded in `attendance_correction`.
- **Attendance review (ADR 133):** `class.attendance_reviewed_at`, `attendance_reviewed_by` and `attendance_review_fingerprint`. A class needs review when it has no saved review or its roster changed since. `attendance.finish` compares the fingerprint before saving, refuses stale rosters, unresolved rows, cancelled classes and classes that have not ended, and needs explicit confirmation for a zero-present register. `attendance.reviewQueue` lists what is waiting.
- **Drop-in leads and the public link (ADR 147):** `drop_in` (one row per phone per academy, with stage, source, and answers: belt, stripes, health note, news opt-in, waiver acceptance), `drop_in_visit` (one row per lead per class, with visit status), and `drop_in_link` (one live token per academy, with creation and revocation times). `dropIn.resolve` takes a token and returns academy details. `dropIn.classes` lists eligible classes within three local days. A class link adds `?class=<id>` to the same public URL; the form passes the id to `dropIn.classes`, which then looks seven local days ahead and returns only that class, without granting class-specific access. `dropIn.link` is open to any active member, so staff (Schedule) and approved students (web schedule and class page) copy the same token; only owners and managers rotate it. `dropIn.submit` re-resolves the token and checks academy, class state and the seven-day link window inside the write transaction; a current class marks the visitor present, a future one books them. Rate-limiting uses the `rate_limit` table (Postgres fixed-window counter, shared across instances).
- **Class notices:** `notification_notice`, `notification_recipient` and `notification_attempt`. Changing or cancelling a booked class writes the notice in the class transaction. An after-commit callback sends one bounded email batch through Resend (`deliverNoticeBatch`, with leases so a recipient is not sent twice) and pushes to the app. There is no staff retry. `notification` is the in-app inbox the Expo app reads.
- **Payments (behind the flag):** `access_plan` and its price and coverage tables, `access_assignment` and `access_assignment_change`, `membership_policy`, `membership_month` with its audit, and `membership_access_hold`. They carry `organization_id`.
- **Rank and notes:** `member_rank`, `rank_promotion`, `rank_correction`, `member_note`.
- **Measurement:** `product_event`, written after commit by `recordMilestone` and `recordActivity` (`packages/db/src/product-event.ts`), which never throw. It holds no user id, email, phone or amount, and `matops_app` has no grants on it. `pnpm -F @matops/db report` prints the report.
- **Staff identity (ADR 132):** `rosterOf` is the academy roster; `directoryRosterOf` adds inherited gym roles without writing student rows; `loadStaffAccess` resolves academy staff and gym authority.

### Operations

- **No scheduled jobs.** Nothing runs on a timer. `.github/workflows/ci.yml` (lint, format, typecheck, test) is the only workflow, and no code reads `CRON_SECRET`. Owners and managers extend the calendar by hand. Class reminders are local notifications on the phone (ADR 54).
- **Deploy.** `vercel-build` in `apps/nextjs/package.json` runs `@matops/db migrate:deploy` before the build. It runs only when `VERCEL_ENV=production`, takes an advisory lock, and checks the applied count against the journal. `apps/nextjs/vercel.json` pins the functions to `fra1`.
- **Privacy policy.** `/privacy` and the public-form dialogs share `PrivacyText`; its MatOps contact is the same support email used by `FeedbackLink`. No public legal environment variables are required at startup. Confirm and publish the operator's legal identity and address before real invitations (first-release plan S7).
- **Errors.** `@sentry/nextjs` on the web only; the Expo app reports nothing (ADR 72).
- **Tests.** PGlite for RLS and router tests, vitest for pure rules and schemas. The last full run passed 1,168 tests across `notifications`, `validators`, `domain`, `db` and `api` (2026-09-27).
- **Not built:** universal and App links (the app uses the `matops://` scheme), a shared rate-limit store, booking-count reconciliation, and the native home-screen widget. The mobile Google browser-to-app hand-off still fails (ADR 35).

## 1. Principles (the spine)

Four constraints drove every choice; when in doubt, re-derive from these:

1. **Minimal vendor lock** — portable/ejectable core: standard Postgres, open auth, no proprietary reactive engine. (Convex + Clerk deliberately rejected.)
2. **Simple now, expandable without a major refactor** — MVP is small; the _seams_ for later domains are placed now (§8).
3. **Solo builder, move fast, DX-first** — fewest moving parts; shared types; no codegen pipelines.
4. **Agentic-coding first** — a maximally conventional, well-documented stack agents know cold → the **create-t3-turbo** pattern.

We also carry forward three _patterns_ (not code) from the old app: **domain partitioning**, a **pure policy layer**, and a **structural tenancy seam**.

---

## 2. Stack at a glance

| Layer                | Choice                                                                                                                         | Ticket         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| Monorepo             | Turborepo + pnpm                                                                                                               | [07]           |
| Owner web            | Next.js (App Router) + shadcn/ui + Tailwind + TanStack Query → **Vercel**                                                      | input / [11]   |
| Student mobile       | Expo (React Native) + explicit RN styles (ADR 36) → **EAS**                                                                    | input / [11]   |
| API                  | **tRPC** colocated in Next.js (internal-only; `trpc-to-openapi` hedge)                                                         | [01],[15]      |
| Auth                 | **Better Auth** + Organization plugin (Expo secure-store, org/role) **+ magic-link**                                           | [02],[14],[26] |
| Student low-friction | approval before booking (ADR 142); **QR self check-in**; **public drop-in/lead form**                                          | [22]–[26]      |
| DB access            | **Drizzle** + Postgres (**Neon**); driver **`pg` on Vercel Fluid compute → Neon `-pooler`**                                    | [03],[21]      |
| Multi-tenancy        | shared DB + `academyId` + **Postgres RLS**; tRPC middleware sets `app.academy_id` per request                                  | [05],[12]      |
| Real-time            | **none in v1** — TanStack polling. Live-UI later = a **separate always-on worker** (LISTEN/NOTIFY→SSE), not the serverless API | [04]           |
| Notifications        | **push (Expo) + email (Resend)** in v1, via a thin helper — all serverless HTTPS                                               | [17]           |
| Scheduling           | recurring templates **materialized on save** (180-day horizon), extended or rebuilt by hand; no cron (ADR 46, 79)              | [08],[16]      |

_Whole stack is TypeScript end to end._

[01]: issues/01-api-contract-and-runtime.md · [02]: issues/02-auth-stack.md · [03]: issues/03-postgres-access-layer.md · [04]: issues/04-realtime-strategy.md · [05]: issues/05-multitenancy-model.md · [06]: issues/06-hosting-topology.md · [07]: issues/07-monorepo-structure.md · [08]: issues/08-mvp-domain-model.md · [11]: issues/11-design-system.md · [12]: issues/12-tenant-isolation-mechanism.md · [13]: issues/13-booking-write-atomicity.md · [14]: issues/14-better-auth-approval-feasibility.md · [15]: issues/15-api-deployment-shape.md · [16]: issues/16-materialization-job-scaling.md · [17]: issues/17-class-cancellation-notification.md · [18]: issues/18-multi-academy-ux.md · [21]: issues/21-neon-connection-model.md · [22]: issues/22-provisional-booking-capacity.md · [23]: issues/23-pending-capability-never-block.md · [24]: issues/24-qr-self-checkin.md · [25]: issues/25-dropin-lead-form.md · [26]: issues/26-seamless-registration-deeplink.md · [27]: issues/27-home-widget.md · [34]: issues/34-notifications-layering.md

---

## 3. Monorepo layout

```
apps/
  nextjs/        web app + tRPC route handler (/api/trpc/[trpc]) + Better Auth handler (/api/auth)
  expo/          student mobile
packages/
  api/            tRPC routers + procedures (the contract; both apps import its type)
  db/             Drizzle schema (per-domain files) + RLS policies + tenantTx() helper + migrations
  auth/           Better Auth server config (Organization plugin) + client helpers
  validators/     Zod schemas shared by api + clients
  domain/         PURE business logic — booking policy, materialization math (no React/Next/Expo/ctx)
  notifications/  thin transport: sendPush() (Expo Push) + sendEmail() (Resend) — no DB dep (ADR 34)
  ui/             shared design tokens (Tailwind preset) + shareable headless bits
tooling/
  eslint/ github/ prettier/ tailwind/ typescript/    shared presets and CI setup
```

**Dependency direction:** `apps/*` → `packages/*`; packages never import apps. `db`, `validators`, `domain` are platform-agnostic leaves. **`packages/domain` must stay framework-free** so the server _and_ both clients import the same policy functions — this is the re-derived "pure policy layer" and the key testability seam.

---

## 4. Request lifecycle (the core path)

```
Client (web in-process | Expo over HTTPS)
  → tRPC procedure
    → auth middleware     : Better Auth validates session → ctx.user
    → tenant middleware   : read the gym (Better Auth activeOrganizationId) and the
                            academy (x-matops-entity header) → check the caller's
                            standing there → open a tx and set app.organization_id,
                            app.academy_id and the matops_app role  (ctx.db)
    → procedure resolver  : calls packages/domain (pure) for decisions;
                            all reads/writes go through ctx.db — Postgres RLS
                            filters every row to app.academy_id
      → Drizzle (pg) → Postgres (Neon, non-BYPASSRLS role)
```

The **procedure tiers** are listed in §5: `protectedProcedure` (authed) → `enrolledProcedure` (pending or active, opens the RLS tx) → `memberProcedure` (active) → `staffProcedure` (owner, manager or instructor) → `branchManagerProcedure` (owner or manager), plus gym-level tiers. Because RLS filters in the database, resolvers can run plain Drizzle queries and still cannot read another academy's rows.

Alongside them sit the **identity tiers**, `staffIdentityProcedure` and `ownerIdentityProcedure` (ADR [92](issues/92-identity-writes-leave-the-tenant-transaction.md)). They authorize identically but open **no** transaction, because their job is writing `member` / `organization` — tables `matops_app` may not write (`0000_baseline`), so the write needs the base connection, and taking it from inside a tenant transaction holds two pool connections at once (ADR [66](issues/66-identity-reads-run-on-the-tenant-transaction.md)). A resolver that also touches tenant tables calls `ctx.withScope(fn)` itself, around just that part, so the ORDER of the identity write versus the tenant write stays with the resolver: it is the only thing that knows which order leaves a repairable state. Inside a tenant procedure `ctx.baseDb` is typed `undefined`, so reaching for the base connection is a compile error; the one legitimate route is `ctx.afterCommit((exec) => …)`, which receives the handle after COMMIT.

---

## 5. Tenancy: Postgres RLS

The decision is ADR [124](issues/124-the-organization-owns-typed-entities.md), amended by ADR [125](issues/125-the-pivot-review-fixes.md) and ADR [129](issues/129-the-manager-runs-every-branch.md). This section describes the model as the code runs it.

### Data model

- **`organization`** is the gym, the owner group. It is Better Auth's organization row and keeps only `id`, `name`, `slug`, `logo`, `metadata`, `created_at` and `deleted_at`.
- **`entity`** is the academy, the place people train. It holds the name every screen shows, the time zone, country, address, map link, the six-digit `public_code`, `booking_window_days` and `membership_enforced_at`. Its `organization_id` names the gym. The only type the app accepts is `bjj_academy` (`ENTITY_TYPES` in `packages/domain/src/entity.ts`). Unique indexes cover `(organization_id, id)`, `(organization_id, slug)`, `public_code`, and one live default entity per organization.
- **`academy_profile`** is one row per entity, keyed by `entity_id`, for per-academy settings.
- **`entity_membership`** is the access record: one person's role and status at one entity. `role` is `owner`, `instructor` or `student`. `status` is `pending`, `active`, `suspended`, `archived` or `removed`. It is unique on `(entity_id, user_id)` and on `(entity_id, person_id)`. A composite foreign key on `(organization_id, entity_id)` proves the entity belongs to the same gym.
- **`person`** is the gym's student record. It may link to one login. `entity_membership.person_id` points at it.
- **BJJ tables** (classes, bookings, attendance, rank, notes, drop-in leads, notifications) keep a text `academy_id` column. It holds an **entity** id and has a foreign key to `entity.id`. Every `member_id` column points at `entity_membership.id` through a composite key `(academy_id, member_id) -> entity_membership(entity_id, id)`. No BJJ table has an `organization_id`.
- **Membership tables** (`access_plan`, `access_assignment`, `membership_month` and their siblings) belong to the gym and carry `organization_id`.
- No foreign key in this model cascades. `packages/db/src/erase.ts` deletes in an explicit order, and `erase-coverage.test.ts` checks that every table is covered.

**One academy per gym.** `/start` calls `organization.create`, then `entity.create` with type `bjj_academy`. `createEntity` in `packages/db/src/provision.ts` gives the first academy the organization's own id when that id is free, marks it the default, and writes the caller's `entity_membership` as an active `owner`. The web app has no screen to add a second academy.

### Authorization

A request passes two checks, both before any transaction opens (`packages/api/src/trpc.ts`).

1. **Gym.** `resolveOrganization` reads Better Auth's `activeOrganizationId` and requires a live `member` row for the caller. The Better Auth role (`owner`, `manager`, `instructor`, `student`) is the gym role.
2. **Academy.** `resolveEntity` reads the academy id from the **`x-matops-entity`** header. The web app sends the `[entityId]` route segment. The Expo app sends the id it keeps in secure-store. The session never picks the academy. A missing header is `BAD_REQUEST`. An id that is unknown or belongs to another gym is `FORBIDDEN`, with the same message, so a caller cannot probe for other gyms.

An active gym **owner** or **manager** reaches every academy of the gym without an `entity_membership` row. Their standing there reads `owner` or `manager`, and `memberId` stays null when they have no row, so management access never makes them a student. Anyone else needs an `entity_membership` whose status is `pending` or `active`.

The procedure tiers build on this:

- `enrolledProcedure`: any `pending` or `active` standing at the academy. Opens the scoped transaction.
- `memberProcedure`: `active` only.
- `staffProcedure`: an active owner, manager or instructor (`isStaff`). Runs the schedule and attendance.
- `branchManagerProcedure`: an active owner or manager (`runsBranch`). Runs members, approvals, plans and settings.
- `organizationMemberProcedure` and `organizationManagerProcedure`: gym-level reads that open a transaction with no academy.
- The identity tiers (`staffIdentityProcedure`, `ownerIdentityProcedure`, `branchManagerIdentityProcedure` and the `organization*IdentityProcedure` tiers) authorize the same way but open no transaction. They write `member` or `organization`, which `matops_app` may not write (see §4).

Owner-only actions ask `isOwner`: making an owner (`membership.promote`), permanent erase (`membership.purge`), deleting the academy (`academy.remove`) and creating an academy (`entity.create`).

### RLS

- **Postgres RLS is the guarantee.** The app runs every tenant query as `matops_app`, a role without `BYPASSRLS`. `withScope({ organizationId, entityId? })` in `packages/db/src/tenant.ts` opens the transaction and, in one `set_config` round trip, sets `app.organization_id`, sets `app.academy_id` when an entity is given, and switches to `matops_app`. All three settings are transaction-local, so they reset at COMMIT and never leak to a reused pooled connection.
- **Two kinds of policy** (`packages/db/migrations/0000_baseline.sql`):
  - Academy tables match `academy_id = current_setting('app.academy_id', true)`, and `academy_profile` matches `entity_id` the same way. Every BJJ table is in this group.
  - Gym tables match `organization_id = current_setting('app.organization_id', true)`: `entity`, `entity_membership`, `person`, `product_event` and the membership tables.
- **Gym tables need their own filter.** Inside an academy transaction, a bare select of `entity` or `entity_membership` returns every academy of the gym. This lets academy queries join to them. Every read of those tables must filter by entity itself.
- **A gym transaction cannot read academy rows.** `withScope` without an `entityId` leaves `app.academy_id` unset, so every academy policy matches nothing.
- **Fails closed.** Without the middleware there is no `app.academy_id`, and RLS returns no rows, not another academy's rows.
- **Why RLS and not a query wrapper.** Adding `where academy_id` to every query by hand is easy to get wrong in a join or raw query. With RLS the middleware sets one value and Postgres filters every statement, so resolvers use plain Drizzle.
- **Guardrails.** Inside a tenant procedure `ctx.baseDb` is typed `undefined`, so a resolver cannot reach the unscoped connection by mistake. The one route out is `ctx.afterCommit((exec) => ...)`, which runs after COMMIT. The RLS tests in `packages/db/test` (`rls.test.ts`, `rls-coverage.test.ts` and the per-area `*-rls.test.ts` files) check that a foreign id reads nothing.
- **Identity tables keep Better Auth's own scoping.** `user`, `organization`, `member` and `invitation` carry no RLS policy. `matops_app` may read `user`, `organization` and `member` but not write them. The base connection writes them.
- **Public exceptions.** The drop-in link (`dropIn.resolve`, `dropIn.submit`) and `invite.resolve` have no session, so they cannot open a scoped transaction. They run on the base connection through `@matops/db` helpers that take the academy id as a required parameter, resolved from a validated token or invite before any query runs. `dropIn.resolve` returns only the academy name. `dropIn.submit` creates or updates a lead and a visit record, never a member. None of them can change a member, read member data or move money.
- **The desk link (ADR 150)** is the one public exception that opens a scoped transaction. `deskProcedure` resolves the token on the base connection to one active entity, then runs `withScope({ organizationId, entityId })` with no session, so every desk query is filtered by RLS like a signed-in request. It ignores `x-matops-entity` and the session. It can read active members' names and mark attendance through `checkInMember`; it cannot read contact or health data, book a future class, or change a membership. `desk.link` and `desk.rotateLink` are owner and manager procedures.

---

## 6. Auth flows (web + mobile)

- **Web:** Better Auth cookie session; server components/route handlers read it; tRPC middleware validates.
- **Mobile:** `@better-auth/expo` persists the session in `expo-secure-store` (Keychain/Keystore), auto-attaches it to tRPC calls; refresh validated server-side. **As built (mobile pass):** passwordless **magic link** (email only) — the client rewrites the relative `callbackURL` into the app's `matops://` deep link, so opening the verified link bounces back into the app and the auth gate routes onward. The server `trustedOrigins` must list the app scheme (`["matops://"]`) — the expo plugin only appends the session cookie to the verify-redirect when its location starts with a trusted origin (Expo Go's `exp://` is auto-added in dev). Custom-scheme deep links require a **dev build**, not Expo Go. The client mirrors the server's `user.phone` additional field with the `inferAdditionalFields` plugin (explicit schema) so it stays typed without importing the heavy `Auth` type.
- **Authorization** is _ours_: authN + org/role come from Better Auth; resource-level rules live in the tenant/role tRPC procedures.
- **Approval + the status trap ([14]):** Better Auth's access checks are **role-based and ignore our `status` field** — a `pending` member who holds a role would pass every check. So we **grant the role only at approval**: a student joining via the student link lands `pending` with **no role** (harmless); the owner approves → role assigned + `status='active'`. Instructors join active via the instructor link. Defense-in-depth: `memberProcedure` also rejects `status !== 'active'`. Pin the Better Auth version + an integration test (`additionalFields` inference bugs).
- **Contract discipline (mobile version skew):** store apps linger on old builds → tRPC procedures are **additive-only** (never change/remove a shape a shipped app calls). This is the one operational rule the internal-tRPC choice demands; enforce it in review.

---

## 7. Scheduling engine

- **Materialize on save ([16], ADR 46, 79):** creating or editing a `class_template` materializes its `class` rows out to the **180-day** horizon in the same request, so a schedule appears at once. Idempotent through `UNIQUE(templateId, startsAt)` and the cursor `template.generatedUntil`. No cron extends the horizon: an owner or manager extends the calendar or runs the safe rebuild from Schedule (§0). The schedule read does **not** materialize. Time math (local `startsAtMinutes` + IANA zone → UTC instant, DST-aware) lives in `packages/domain`.
- **One-off classes:** `templateId` nullable → special classes cost nothing extra.
- **Academy-defined disciplines (ADR 144):** `class_template.discipline` and `class.discipline` are nullable text. An academy-scoped list starts empty, and schedule writes accept only its names or null. Rename and delete update templates and future scheduled classes in one scoped transaction; historical classes keep their saved text. The migration clears existing template tags while preserving existing class tags. The list uses the academy RLS policy, and seeded rank systems remain separate.
- **Class status is `scheduled | cancelled` only ([19]).** "Past/done" is **derived** from `starts_at + duration < now()` — no stored `completed`, no sweep job.
- **Booking = idempotent upsert + atomic count claim ([13], [22]) — as built (slice 3.1):** inside the request's RLS transaction (`ctx.db`), the `booking` router (`book` on `memberProcedure`, `cancel` on `enrolledProcedure`) first upserts the `class_participation` row — `INSERT … ON CONFLICT (class_id, student_id) DO UPDATE SET booking_status='booked', … WHERE booking_status <> 'booked' RETURNING id` — so `UNIQUE(class_id, student_id)` prevents double-book, a returned row marks a real transition (new **or** re-book flipping `cancelled → booked`), and no row means already-booked (idempotent, count untouched). Then, **only on a real transition of a `confirmed` booking**, an **atomic `UPDATE class SET booking_count = booking_count + 1`** — v1 **drops the `booking_count < capacity` guard** (soft cap, never blocked, §4); the row lock still serializes concurrent claims (no `SELECT … FOR UPDATE`). **Two tiers ([22]):** `confirmed` (approved member) counts; historical `provisional` rows remain readable but new pending bookings are refused under ADR 130. Cancel mirrors it (floored `GREATEST(count−1,0)`, confirmed-only). Both statements share the one request tx, so they commit/roll back together. This is why **no real-time is needed** for correctness — only display freshness, handled by polling.
- **Attendance = the second axis of `class_participation` ([08]) — as built (slice 3.3):** the same row carries `attendance_status` (`unmarked|present|absent`) orthogonal to booking, plus a `none` booking value for walk-ins (attended without booking — never counted). The `attendance` router is **staff-only** (owner + instructor see names): `list` (booked + walk-ins + drop-ins, with header counts via pure `attendanceCounts`), `mark`, and `addWalkIn`. Marking is gated to the **14-day backfill window** (`canMarkAttendance`, spec O5). Members `visitCount` ("attended N×") is a present-count grouped by student.
- **QR check-in = book + attend ([24]):** the `checkin` router (`today` on `enrolledProcedure`, `checkIn` on `memberProcedure`) reuses the booking write **and** sets `attendance='present'` in one RLS transaction. It is idempotent and subject to approval, the payment gate while the flag is on, and capacity. `resolveCheckInClass` (pure) picks the current or next class **server-side**, so the Expo app needs no domain dependency. The Expo Scan tab reads the wall QR; a visitor with no app lands on the drop-in form.
- **Public drop-in, a tenant-seam exception ([25], [12]):** `dropIn.submit` and `dropIn.academyInfo` are **`publicProcedure`** (unauthenticated). With no session they cannot open a scoped transaction, so they call `@matops/db` helpers that write on the **trusted base connection**, each pinned to a validated `academy_id` (§5 lists every public exception). `drop_in` dedupes by `UNIQUE(academy_id, phone)`; each visit is a `drop_in_visit` row. Consent is required (`z.literal(true)` + `canSubmitDropIn`).
- **Notifications ([17], [34]):** a class change or cancellation → a saved notice, one email batch to booked students and a push; membership approved → push. Class reminders are local notifications the phone books at booking time (ADR 54); no server sweep runs. Three layers (ADR 34): transport (`packages/notifications`, no DB dependency, never throws), message text (pure builders in `packages/domain`), recipients and orchestration (`packages/api/src/notify.ts` and `packages/db/src/notification-notice.ts`).
- Full data model + invariants: [08] and the schema files in `packages/db/src/`.

---

## 8. Expansion seams — how deferred domains plug in without a refactor

The whole "expandable" constraint lives here. Each deferred domain is **additive**: a new `packages/db/schema/<domain>.ts`, a new tRPC router mounted on the root, optionally new `packages/domain/<domain>` pure logic — no change to the tenancy seam, the request path, or existing tables.

| Deferred domain                          | Plug-point                                                                                                                                                                                                              | Why it's additive                                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Billing / memberships / payments**     | **Built, switched off** (ADR 142): the membership tables carry `organization_id`, and `bookingGate` runs before the booking write. `entity.membership_enforced_at` turns it on per academy; no procedure sets it today  | booking already funnels through one gate; nothing else changes                                                               |
| **Curriculum / games**                   | Not built. A curriculum was built and then removed in ADR 142. A new one would add tenant-scoped tables and a router; `games` as a **global, cross-tenant** table would need an explicit `globalProcedure` escape hatch | the seam already anticipates a small enumerated global set                                                                   |
| **Comms (announcements + in-app DMs)**   | `comms` schema + router. _(Transactional push/email already exist in v1 via `packages/notifications`; this adds the in-app messaging surface.)_                                                                         | no coupling to scheduling beyond reading class/booking ids                                                                   |
| **Belts / rank**                         | **Built** (ADR 41): `member_rank`, `rank_promotion` and `rank_correction`, tenant-scoped, with the `rank` router                                                                                                        | pure additive; attendance recency signal already exists                                                                      |
| **Live in-app updates (WebSocket/SSE)**  | a **separate always-on worker** (Fly/Railway) holds the connections and listens to Postgres `LISTEN/NOTIFY`; mutations publish events to it; clients subscribe. _Cannot_ live on the serverless API ([15])              | "serverless publishes, a worker subscribes." v1 polling upgrades in place; the main API doesn't move (kept extraction-ready) |
| **Tiers / entitlements**                 | a single `getEntitlements(academy)` resolver + a gate; frontend hides nav                                                                                                                                               | one gate, not per-feature tier reads (old app's proven shape)                                                                |
| **Cross-academy views / hard isolation** | aggregated "all my gyms" screens are additive reads over existing memberships; harder physical isolation = promote a tenant to its own schema/DB                                                                        | RLS is already the v1 guarantee (§5); these are further steps, not the baseline                                              |

**Rule of expansion:** a new domain adds a schema file + a router + (maybe) pure logic. If adding one forces edits to the tenancy layer or existing tables, that's the signal the boundary is wrong — fix the boundary, not the caller.

---

## 9. Deployment topology

```
Vercel ────── apps/nextjs (web + tRPC API + Better Auth)                 [Fluid compute]
Neon ──────── Postgres (single shared DB; Better Auth + domain tables)
                connect: pg driver → Neon "-pooler" endpoint, non-BYPASSRLS role
EAS ───────── Expo builds / OTA / store submission
GitHub Actions ── CI only (lint, format, typecheck, test). No scheduled job runs:
                    the class horizon is extended by hand (ADR 79).
Expo Push ── phone notifications   |   Resend ── email       (both: outbound HTTPS)
```

**Escape hatches (nothing is a one-way door):** Next containerizes off Vercel (Docker → Fly/Railway/self); Postgres migrates by dump/restore; the tRPC routers (pure) extract onto `@hono/trpc-server` if a standalone API is ever wanted; **future live-UI adds a separate always-on worker** without moving the API; EAS is build tooling, not data lock.

---

## 10. Cross-cutting engineering

- **Migrations:** `drizzle-kit generate` (versioned SQL) in CI, applied on deploy; `push` in local dev only.
- **Validation & errors:** Zod at the tRPC boundary; typed error codes (re-derive the old app's `DomainError` set: `NOT_FOUND`, `FORBIDDEN`, `CLASS_FULL`, `BOOKING_NOT_ALLOWED`, …) surfaced as tRPC errors clients map to human toasts.
- **Testing:** unit-test `packages/domain` (pure → trivial); integration-test tRPC procedures against a test Postgres; **cross-tenant leak suite** in CI (asserts the RLS policies deny a foreign `academy_id`); a Better Auth `additionalFields`/approval integration test ([14]). This is why the pure/boundary split matters — the hard logic is testable without the framework.
- **Guardrails:** lint rule forbidding resolvers from opening a db connection outside the tenant helper (so `app.academy_id` is always set); `packages/domain` may not import React/Next/Expo/tRPC.
- **Query windows (ADR [88](issues/88-server-prefetch-and-the-clock-contract.md)):** a date range that is a tRPC input is a **cache key**, so it is built in `packages/domain/src/query-window.ts` and snapped to a **UTC day**, never to a local midnight. A server prefetch runs in UTC and the browser runs in the academy's zone; two local midnights make two keys and the page fetches twice. Display boundaries stay local: `/schedule`, `/attendance` and the student schedule filter the fetched rows to their own local range, and those filters are load bearing.
- **Rendering contract (ADR [91](issues/91-cache-components-and-the-static-shell.md)):** `cacheComponents: true` is on, so every route serves a prerendered static shell and streams its dynamic parts behind `<Suspense>`. Three rules follow and the build enforces all three. **No page may read request data at its top level** — split it into a page component returning a `<Suspense>` and a child that awaits. **No route segment may set `dynamic` or `runtime`**. **`HydrateClient` can never sit in a prerendered shell**, because `dehydrate()` stamps `Date.now()`, so any page carrying it must read request data first: eleven do it through `currentAcademy()`, `params` or `getSession()`, and `/training` carries an `await connection()` that exists for this reason alone. What this bought is the shell on `/checkin/[academyId]` and `/join/[token]`, the printed-QR landings, which now come from the CDN without a function. The authed routes gained nothing, measured. `/sign-in` gave up its server-side redirect for it. **Returning to a route is cached for 30 seconds** (`experimental.staleTimes: { dynamic: 30 }`, ADR [100](issues/100-the-client-router-keeps-a-page-for-30-seconds.md)): Next 16 reuses no dynamic navigation at its default of `0`, so every tab click was re-rendering the page on the server and re-running its `prefetch()` queries for data the browser already held. Freshness is decided by `freshness.ts` below, not here.
- **Server prefetch never blocks (ADR [89](issues/89-streaming-the-panels.md)):** `prefetch()` in `apps/nextjs/src/trpc/server.tsx` returns `void`, so no page can await it. A page awaits only what decides its shape: `currentAcademy()` for the role branch, and in the `(app)` layout `entity.list`, which `AppShell` needs before it can choose between the shell and the academy gate (ADR [80](issues/80-loading-states.md)). The `(app)` layout ships only `entity.list`, as `initialData` for `OrganizationBoundary`, and has no `HydrateClient`: the request shares one query client, and a snapshot that caught the entity layout's in-flight `academy.current` made a late hydration mismatch the server HTML and freeze the tab (ADR 89 addendum, 2026-09-29). So `AppShell` fetches `academy.current` after hydration and the route under it is client rendered, on purpose; a warm hard load pays about 600 ms for it. Everything else dehydrates while still **pending** and streams: the QueryClient's `shouldDehydrateQuery` allows a pending query, React carries the in-flight promise through the RSC stream, and `hydrate` rebuilds the query around that promise instead of issuing a request. So the page shell reaches the browser in ~130 ms rather than ~700 ms, and each panel fills in as its own query lands. The screens' per-panel `isPending` branches are the loading contract; there are no `<Suspense>` boundaries yet, and adding them is a `cacheComponents` prerequisite, not a rendering fix.
- **Client freshness (ADR [87](issues/87-one-freshness-policy.md)):** how long a cached query stays fresh is decided in ONE place, `packages/domain/src/freshness.ts`, keyed by tRPC path. Both QueryClients (`apps/nextjs/src/trpc/query-client.ts`, `apps/expo/src/utils/api.tsx`) pass `staleTime: (query) => staleTimeForQueryKey(query.queryKey)`, so the two clients cannot drift. Reference data (`academy.*`, `template.*`, `rank.*`, `invite.*`, the payment plan reads) is fresh for 5 minutes, `stats.*` for 2, the two badge counters for 1, and everything a second person can change mid-session keeps the 30 s default. Screens do not set `staleTime`; change the table instead. The web router's 30-second navigation cache (ADR [100](issues/100-the-client-router-keeps-a-page-for-30-seconds.md)) is set to match this table's default on purpose, so a revisited tab is never staler than the policy already allows.
- **Observability (thin v1):** platform logs (Vercel/Neon) + an append-only `audit_log` table for owner-facing "what happened" — a documented next step, not built day 1.
- **Error tracking as-built (ADR [72](issues/72-sentry-error-tracking.md)):** `@sentry/nextjs` on the **web only**. `src/instrumentation.ts` loads the server or edge config by `NEXT_RUNTIME` and exports `onRequestError`, so a throw inside a tRPC procedure is reported with its request. `src/instrumentation-client.ts` covers the browser and App Router navigations; `src/app/global-error.tsx` catches a crash that escapes the root layout. `next.config.js` is wrapped in `withSentryConfig` for source-map upload, which needs `SENTRY_AUTH_TOKEN` set in Vercel (the local copy lives in the gitignored `apps/nextjs/.env.sentry-build-plugin`). The DSN is hardcoded on purpose: it is public, and a required env var would fail the build when unset. Tracing samples every request while the pilot is small. The Expo app reports nothing. **Session Replay is loaded through a dynamic import after `Sentry.init`, not in `integrations[]`** (ADR [86](issues/86-sentry-replay-out-of-the-entry-bundle.md)): statically importing it linked rrweb into the entry bundle of all 18 routes, 123 kB each. Its buffer therefore starts a few milliseconds after boot. Note also that the `webpack.treeshake` block in `next.config.js` does nothing under Turbopack, so neither Sentry debug logging nor the unused tracing code is actually stripped today.

---

## 11. Open items carried into build (from the map's fog)

Not blockers; sharpen during implementation: offline/sync behavior, CI/observability depth, dev seeding. **Deep-link setup for the invite flow — partly resolved (ADR [31](issues/31-deep-link-approach.md)):** the mobile pass ships **custom-scheme** deep links (`matops://join/<code>`) + an in-app paste fallback, which need no hosting or store accounts. The **universal/App-link** half (Apple App Site Association + Android assetlinks + EAS submit) is deferred to a **Phase 5 launch-infra** task — it needs the user's Apple Developer + Google Play + EAS accounts and a hosted domain. Tracked in the map's _Not yet specified_.

---

_This doc is the design of record: §0 is what exists, §§1-11 are the intent behind it. Status matrix: [roadmap.md](roadmap.md)._
