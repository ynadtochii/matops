# Organization and Entity Architecture Pivot

Canonical implementation plan: `/Users/kuna/projects/matops/docs/organization-entity-pivot.md`.

## Goal

Change MatOps from an academy-as-organization model into an organization with shared owners and multiple typed entities. Creating a gym must create one organization and one default BJJ academy entity. Owners can later add more supported entities and view organization-wide or entity-specific dashboards.

## Why

Why now: Alma beta, the seed academy, stands in for a gym opening a second location. Its owner needs one login for both mats, staff and students who can belong to either or both, and one overview that shows pending actions, dues and attendance for each location and the totals. Answered 2026-09-01.

ADR 18 deferred cross-academy views and said the data model needed no change. This plan supersedes that claim because per-entity settings, per-entity memberships and a shared owner do need new tables. The ADR written in Wave 0 carries the same paragraph.

## Context

Today, Better Auth `organization` is also the academy, tenant, settings record, public identity, member scope, and active session context. Every product table is scoped by `academy_id`, and Postgres RLS reads one `app.academy_id` value.

The target model separates these concepts:

```text
Organization
|-- Shared owners
|-- General dashboard
`-- Entities
    |-- Default BJJ academy
    |-- Additional BJJ academy
    `-- Future typed bookable spaces
```

Production is empty and dev is rebuilt with `pnpm db:seed`. No data is preserved. Old migrations stay untouched. New migrations drop, rename and recreate freely.

## Scope

### In scope

- Better Auth organization as the owner and authentication scope.
- A typed `entity` below the organization.
- Automatic creation of one default BJJ academy entity.
- Per-entity roles, status, scheduling, booking, attendance, and settings.
- Organization overview plus entity dashboards.
- Explicit entity selection in web routes, carried to the API in a request header.
- Updated RLS, authorization, erase, seed, and structural checks.

### Out of scope

- Stripe or another payment provider.
- Payment-provider interfaces, webhook processing, and provider tables.
- New recurring-payment behavior.
- The simple bookable-space module.
- Gym, sauna, cowork, or other non-BJJ entity interfaces.
- A generic booking schema shared by all future entity types.
- A `person` table. See Follow-up slices.
- Data migration of any existing row.

The schema must leave a clean future integration point. Future subscriptions will belong to an organization-level user and grant access to one or more entities. No speculative payment code should be added during this pivot.

## Decisions

1. Better Auth `organization` remains the organization identity and active organization in the session.
2. `entity` is the operational facility. The initial supported type is `bjj_academy`.
3. New entity types must come from a fixed application and database list.
4. The first entity created for an organization is its default entity.
5. Existing rows are not migrated. The seed creates one default BJJ entity per organization whose id equals the organization id, so QR posters and check-in links in dev keep working.
6. Organization owners can manage every entity in their organization.
7. Operational role and status move from Better Auth `member` to `entity_membership`.
8. Better Auth membership records organization access. `entity_membership` records owner, instructor, or student access to one entity for one user.
9. Leads and visitors stay in `drop_in`, scoped to one entity. A shared login-less profile is a follow-up slice.
10. A user can hold memberships in several entities of one organization with different roles and statuses.
11. BJJ tables remain BJJ-specific. They move from academy scope to entity scope without becoming generic facility tables. The column name `academy_id` stays: on a BJJ table it names the `bjj_academy` entity the row belongs to.
12. The client names the entity on every request with the `x-matops-entity` header. Web sets it from the `[entityId]` route segment. Mobile sets it from the entity the student picked, stored in secure-store. The session never selects the entity. The entity procedure reads the header, checks the caller's access, and fails closed when the header is missing or names an entity the caller cannot use.
13. Entity RLS remains exact. Organization-wide reads must not weaken entity isolation.
14. The first organization dashboard aggregates authorized entity summaries on the server. It must not ask the browser to load and combine every entity dashboard.
15. Public join, booking, check-in, and codes belong to an entity.
16. The pivot is a hard application cutover on an empty database. No old path is kept alive between waves.

## Target Data Model

### `organization`

Keep Better Auth fields and organization branding:

```text
id
name
slug
logo
metadata
created_at
deleted_at
```

Remove academy location, curriculum, public code, and public booking settings in the cleanup wave.

### `entity`

```text
id
organization_id
type
name
slug
is_default
time_zone
country
address
map_url
public_code
status
created_at
updated_at
deleted_at
```

Required constraints:

- Unique `(organization_id, id)` for composite references.
- Unique `(organization_id, slug)`.
- Unique `public_code`.
- One non-deleted default entity per organization.
- `type` accepts only implemented entity types.

### `academy_profile`

```text
entity_id
curriculum_for_students
public_booking_enabled
public_api_key
public_api_origins
created_at
updated_at
```

`entity_id` is the primary key and references a `bjj_academy` entity. Application writes must reject an academy profile for another entity type.

### `entity_membership`

```text
id
organization_id
entity_id
user_id
role
status
invited_role, nullable
joined_at
created_at
updated_at
```

Required constraints:

- Unique `(entity_id, user_id)`.
- Composite references must prove the entity and membership belong to the same organization.
- Roles initially remain `owner`, `instructor`, and `student`.
- Status initially keeps the current pending, active, suspended, archived, and removed behavior.
- All new foreign keys use `ON DELETE RESTRICT` or `NO ACTION`, never cascade. `packages/db/src/erase.ts` deletes rows in an explicit order and `erase-coverage.test.ts` proves each table is covered. A cascade would hide a table from that proof.

### BJJ domain tables

Every table that carries `academy_id` today keeps the column. It gains a foreign key to `entity.id` and, where the ADR requires it, an `organization_id` with a composite reference on `(organization_id, academy_id)`. `member_id` columns on payments, rank, notes and referrals point at `entity_membership.id`.

## Authorization Model

Use two explicit contexts.

### Organization context

- Resolves Better Auth `activeOrganizationId`.
- Verifies the caller has a live organization membership.
- Provides `organizationId` and the organization role.
- Supports organization overview, entity creation, and future billing integration.

### Entity context

- Starts from an authorized organization context.
- Reads `entityId` from the `x-matops-entity` header in `createTRPCContext`, next to `x-trpc-source`.
- Rejects a missing header with `BAD_REQUEST` and a foreign entity with `FORBIDDEN`, before opening any transaction.
- Loads the requested entity and checks it belongs to the active organization.
- Allows an active organization owner automatically.
- Otherwise requires an active `entity_membership`.
- Opens a transaction scoped to the exact entity.
- Provides `organizationId`, `entityId`, entity role, and entity status.

Public and cron routes keep their own resolution and never read the header.

Keep the existing procedure tiers but split them by scope. Suggested names:

```text
organizationMemberProcedure
organizationOwnerProcedure
entityEnrolledProcedure
entityMemberProcedure
entityStaffProcedure
entityOwnerProcedure
```

The exact names can follow nearby conventions. The split between organization and entity scope must remain clear.

## RLS Model

- The GUC name `app.academy_id` stays. Only the TypeScript constant and the context field are renamed to `entityId`.
- Add `app.organization_id` as a second GUC.
- The entity transaction sets both `app.organization_id` and `app.academy_id`. The organization transaction sets only `app.organization_id`. Organization-shared tables match on `app.organization_id`, so a read inside an entity transaction can join to them. An entity-table policy never reads the organization GUC alone.
- One `withScope({ organizationId, entityId? })` helper in `packages/db/src/tenant.ts` replaces `withTenant`, setting one or both GUCs in the single `set_config` round trip ADR 81 established.
- Keep exact entity matching in every entity-table policy.
- Add `organization_id` to entity rows for integrity, indexes, and safe joins.
- Do not add an RLS mode that silently reads every entity table in an organization.
- Organization dashboard reads should authorize the owner, enumerate entities, execute entity-scoped summaries, and combine results on the server.
- A later metrics projection may remove repeated entity reads. It is not part of this pivot unless measurements show a real need.

## Agent Execution Rules

Every implementation session must:

1. Read this file before changing code.
2. Work only on the current wave.
3. Inspect every target file before editing it.
4. Update tests. Run them only where the run file's Authorizations allow: at a GATE, and for the one file an item exists to verify.
5. Run lint and typecheck for the affected packages before completing a wave.
6. Update `Current Wave` and wave checkboxes before stopping.
7. The run file `docs/organization-entity-pivot-epic.md` governs gates, commits, and when to stop. Follow it.
8. Preserve unrelated user changes in the worktree.
9. Do not commit unless the user explicitly asks.
10. Add no source comments unless they explain a non-obvious external constraint or workaround. Add no comments in tests.
11. After `drizzle-kit generate`, set the new entry's `when` in `_journal.json` one day past the previous entry. Drizzle skips a stale entry and still reports success.

If a wave reveals that a locked decision is unsafe, stop and update `Open Questions`. Do not silently change the architecture.

## Implementation Waves

### Wave 0: Contract and impact map

Status: done

Goal: lock names, invariants, affected tables, and cutover order before schema code.

Tasks:

- [x] Add an ADR under `/Users/kuna/projects/matops/docs/issues/` that defines organization, entity, entity membership, default academy creation, the entity header, the two GUCs, and exact entity RLS. It carries the `Why` paragraph.
- [x] Update `/Users/kuna/projects/matops/docs/architecture.md` to mark `organization = academy` as the current model and this plan as the approved replacement.
- [x] Correct `/Users/kuna/projects/matops/docs/issues/18-multi-academy-ux.md`. Its claim that aggregate dashboards need no model change does not cover shared organizations and entities.
- [x] Add this plan and the ADR to `/Users/kuna/projects/matops/docs/map.md`.
- [x] Fix the `/Users/kuna/projects/matops/CLAUDE.md` summary paragraph that still reports 27 failing tests. The suite is green as of the 2026-09-01 commit.
- [x] Inventory every table with `academy_id`, every RLS policy, every public identifier, and every erase or seed registry entry.
- [x] Inventory every caller of `activeOrganizationId`, `ctx.academyId`, `withTenant`, `AcademyProvider`, and `useAcademy`.
- [x] Record the final migration matrix in the ADR before Wave 1.

Gate:

- The ADR names every affected table and resolves whether each row is organization-scoped, entity-scoped, or global.
- No code or schema behavior has changed.
- Documentation has no conflicting target model.

### Wave 1: Foundation schema, authorization split, and provisioning

Status: done

Goal: add the new tables, the two-scope authorization, and the provisioner in one dev-only wave. No old path has to keep working in between.

Primary files:

- `/Users/kuna/projects/matops/packages/db/src/auth-schema.ts`
- New focused schema files under `/Users/kuna/projects/matops/packages/db/src/`
- `/Users/kuna/projects/matops/packages/db/src/schema.ts`
- New migration files under `/Users/kuna/projects/matops/packages/db/migrations/`
- `/Users/kuna/projects/matops/packages/db/src/tenant.ts`
- `/Users/kuna/projects/matops/packages/api/src/trpc.ts`
- `/Users/kuna/projects/matops/packages/db/src/membership.ts`
- `/Users/kuna/projects/matops/packages/api/src/members.ts`
- `/Users/kuna/projects/matops/packages/domain/src/access.ts`
- `/Users/kuna/projects/matops/packages/auth/src/index.ts`
- `/Users/kuna/projects/matops/packages/api/src/router/academy.ts`
- `/Users/kuna/projects/matops/packages/db/src/curriculum.ts`

Tasks:

Schema:

- [x] Add `entity`, `academy_profile`, and `entity_membership`.
- [x] Add the missing unique constraint on Better Auth `member(organization_id, user_id)`. Check dev for duplicate rows first.
- [x] Add composite uniqueness and foreign-key support for organization-safe references, without cascade.
- [x] Enable RLS and add the policies for `entity`, `academy_profile` and `entity_membership`.
- [x] Update Drizzle relations and exports.
- [x] Update seeds so new organizations contain the new foundation rows, with the default entity id equal to the organization id.

Authorization:

- [x] Replace `withTenant` with `withScope` and add `app.organization_id`.
- [x] Read `x-matops-entity` in `createTRPCContext` and expose `ctx.requestedEntityId`.
- [x] Add organization membership and entity membership readers.
- [x] Add the organization and entity procedure tiers defined above.
- [x] Keep entity RLS exact and fail closed when the header is missing or foreign.
- [x] Make organization ownership grant access to every organization entity.
- [x] Require explicit entity membership for non-owner staff and students.
- [x] Add structural checks for organization and entity policy coverage.

Provisioning:

- [x] Replace academy creation with an idempotent organization provisioner.
- [x] Create the default BJJ entity, owner entity membership, academy profile, public code, and default curriculum track.
- [x] Return both `organizationId` and `entityId` from the creation flow.
- [x] Make incomplete provisioning recoverable by retrying missing steps.
- [x] Add an owner-only `entity.create` mutation.
- [x] Allow only `bjj_academy` during this pivot.
- [x] Ensure another BJJ academy gets independent settings, public code, schedule, curriculum, and membership rows.
- [x] Add authorization tests for sibling entities, unrelated organizations, suspended memberships, organization owners, a missing header, and a foreign header.
- [x] Add provisioning and retry tests.

Gate:

- Creating a gym always yields one active organization and one default BJJ academy.
- Retrying after a simulated partial failure creates no duplicates.
- Creating another BJJ academy leaves the first unchanged.
- The new procedures authorize one organization and one entity, and cross-organization and cross-entity reads fail closed.
- Affected package lint and typecheck pass.
- `pnpm test` is green at the GATE, run by the loop under the run file's Authorizations.

### Wave 2: Move invites and memberships

Status: done

Goal: make `entity_membership` the operational access record.

Primary files:

- `/Users/kuna/projects/matops/packages/api/src/router/membership.ts`
- `/Users/kuna/projects/matops/packages/api/src/router/invite.ts`
- `/Users/kuna/projects/matops/packages/db/src/invite.ts`
- `/Users/kuna/projects/matops/packages/db/src/erase.ts`

Tasks:

- [x] Make entity invites resolve an organization and entity.
- [x] On join, create or reuse the Better Auth organization membership and create one pending entity membership.
- [x] Move approval, suspension, archive, restore, and removal to entity membership.
- [x] Keep last-owner protection at organization level and entity-owner protection at entity level where needed.
- [x] Leads stay in `drop_in` per entity.
- [x] Update erase behavior so deleting one entity membership preserves sibling memberships.
- [x] Delete the global user only when no surviving organization relationship requires it.
- [x] Extend `erase-coverage.test.ts` to the new tables.
- [x] Update member, invite, and erase tests.

Gate:

- One user can belong to two BJJ entities with different roles or statuses.
- Removing one entity membership does not damage the other.
- Affected package lint and typecheck pass.
- `pnpm test` is green at the GATE, run by the loop under the run file's Authorizations.

### Wave 3: Convert BJJ domain tables and RLS

Status: done

Goal: move all BJJ behavior from academy scope to entity scope in one controlled cutover.

Primary areas:

- `/Users/kuna/projects/matops/packages/db/src/`
- `/Users/kuna/projects/matops/packages/db/migrations/`
- `/Users/kuna/projects/matops/packages/api/src/router/`
- `/Users/kuna/projects/matops/packages/api/src/public/`
- `/Users/kuna/projects/matops/packages/domain/src/`
- `/Users/kuna/projects/matops/packages/validators/src/`

Tasks:

- [x] Keep the column name `academy_id` on BJJ tables. It now references `entity.id` where `entity.type = 'bjj_academy'`. Add the foreign key and the composite `(organization_id, academy_id)` reference.
- [x] Add `organization_id` where the ADR requires it.
- [x] Point `member_id` columns at `entity_membership.id`.
- [x] Replace academy policies and indexes with entity equivalents that also carry the organization match where a join needs it.
- [x] Add composite integrity checks so child and parent rows cannot belong to different organizations or entities.
- [x] Move scheduling, curriculum, attendance, bookings, ranks, notes, referrals, notifications, public booking, and current manual dues to entity context.
- [x] Keep BJJ product terms such as academy, class, instructor, rank, and curriculum inside the BJJ module.
- [x] Update cron and public exceptions to resolve and validate entity scope.
- [x] Update seed, teardown, erase coverage, policy coverage, and cross-entity tests.
- [x] Make the test suite repeatable under `pnpm test` again (db-suite PGlite contention).
- [x] Wipe and reseed the dev database.

Gate:

- No product query reads academy settings from `organization`.
- Exact entity RLS protects every entity table.
- Existing BJJ behavior remains unchanged through the new entity procedures.
- Public booking and check-in resolve the intended entity.
- Affected package lint and typecheck pass.
- `pnpm test` is green at the GATE, run by the loop under the run file's Authorizations.

### Wave 4: Restructure web routes and shell

Status: done

Goal: add an organization overview and explicit entity routes without changing BJJ screens.

Primary files:

- `/Users/kuna/projects/matops/apps/nextjs/src/app/`
- `/Users/kuna/projects/matops/apps/nextjs/src/app/_components/app-shell.tsx`
- `/Users/kuna/projects/matops/apps/nextjs/src/app/_components/academy.tsx`
- `/Users/kuna/projects/matops/apps/nextjs/src/app/_components/academy-switcher.tsx`
- `/Users/kuna/projects/matops/apps/nextjs/src/app/_components/routes.ts`
- `/Users/kuna/projects/matops/apps/nextjs/src/trpc/react.tsx`
- `/Users/kuna/projects/matops/apps/nextjs/src/trpc/server.tsx`

Target routes:

```text
/overview
/profile
/entities/[entityId]
/entities/[entityId]/schedule
/entities/[entityId]/members
/entities/[entityId]/coaches
/entities/[entityId]/payments
/entities/[entityId]/settings
/entities/[entityId]/training
/entities/[entityId]/class/[id]
/entities/[entityId]/attendance
/entities/[entityId]/referrals
/entities/[entityId]/notifications
```

`/profile` stays organization-level because name and phone belong to the user. `/overview` for a non-owner lists the entities they belong to and nothing else.

Tasks:

- [x] Add organization and entity providers to the web shell.
- [x] Set `x-matops-entity` in `react.tsx` and `server.tsx` from the route segment.
- [x] Replace session-only academy selection with explicit entity routes.
- [x] Add an entity selector containing organization overview and authorized entities.
- [x] Move current BJJ routes, owner and student alike, under the entity route segment.
- [x] Move `ROUTE_ACCESS` in `routes.ts` to match on the path after the entity segment, and gate `/overview` on organization role.
- [x] Keep entity type checks in the route access configuration.
- [x] Add owner-only `Add entity`, with only BJJ academy enabled.
- [x] Preserve query prefetch, loading, mobile web tabs, deep links, and invalidation behavior.
- [x] Add route and shell tests using current patterns.

Gate:

- Two browser tabs can display different entities.
- The entity URL is shareable and reload-safe.
- BJJ navigation appears only for a BJJ entity.
- Organization overview is reachable without selecting an entity.
- Affected package lint and typecheck pass.
- `pnpm test` is green at the GATE, run by the loop under the run file's Authorizations.

### Wave 5: Add the organization dashboard

Status: done

Goal: give owners a general dashboard without weakening entity isolation.

Primary files:

- `/Users/kuna/projects/matops/packages/api/src/router/stats.ts`
- `/Users/kuna/projects/matops/packages/domain/src/dashboard.ts`
- `/Users/kuna/projects/matops/apps/nextjs/src/app/_components/dashboard-screen.tsx`
- New organization overview route and screen under `/Users/kuna/projects/matops/apps/nextjs/src/app/`

Tasks:

- [x] Define a small entity summary result shared by organization aggregation.
- [x] Reuse existing BJJ dashboard calculations behind an entity summary reader.
- [x] Authorize the organization owner before enumerating entities.
- [x] Read each entity through exact entity context and combine results on the server.
- [x] Deduplicate member totals by `user_id`.
- [x] Preserve currency grouping and entity time zones.
- [x] Group pending actions by entity and return entity links.
- [x] Show organization totals plus one card per entity.
- [x] Do not add a metrics projection until measurements justify it.
- [x] Add aggregation tests with sibling entities and an unrelated organization.

Gate:

- The organization dashboard includes every owned entity and no foreign entity.
- A user in two entities counts once in organization totals.
- Entity dashboards still return entity-only values.
- Affected package lint and typecheck pass.
- `pnpm test` is green at the GATE, run by the loop under the run file's Authorizations.

### Wave 6: Update mobile and public surfaces

Status: done

Goal: make the student app and public links entity-aware.

Primary areas:

- `/Users/kuna/projects/matops/apps/expo/src/`
- `/Users/kuna/projects/matops/apps/expo/src/utils/api.tsx`
- `/Users/kuna/projects/matops/apps/nextjs/src/app/book/`
- `/Users/kuna/projects/matops/apps/nextjs/src/app/checkin/`
- `/Users/kuna/projects/matops/apps/nextjs/src/app/join/`
- `/Users/kuna/projects/matops/apps/nextjs/src/app/api/public/`

Tasks:

- [x] List student entity memberships instead of academy organizations.
- [x] Replace `academy.setActive` with a stored entity pick in secure-store, and send it as `x-matops-entity` from `api.tsx`.
- [x] Resolve join codes, QR check-in, public booking keys, and booking links to entities.
- [x] Update push registration and notifications to retain organization and entity context.
- [x] Add public and mobile contract tests.

Gate:

- A student can belong to and switch between two entities in one organization.
- Public links cannot resolve another organization or entity by mistake.
- Existing BJJ mobile behavior remains intact.
- Affected package lint and typecheck pass.
- `pnpm test` is green at the GATE, run by the loop under the run file's Authorizations.

### Wave 7: Contract cleanup and documentation

Status: done

Goal: remove the old architecture and leave one source of truth.

Tasks:

- [x] Remove academy fields moved out of `organization` through a contract migration.
- [x] Drop `member.status` and `member.invited_role` (added in migration `0002`) once every caller reads `entity_membership`. Keep `member.role`: Better Auth's organization plugin owns it, `packages/auth/src/permissions.ts` defines its values, and `creatorRole: "owner"` writes it.
- [x] Remove `AcademyProvider`, the old academy switcher, old tenant helpers, and stale exports.
- [x] Remove obsolete indexes, policies, and seed mappings.
- [x] Search all file types for stale `ctx.academyId`, `withTenant`, and `organization = academy` assumptions.
- [x] Keep BJJ-facing academy language, including the `academy_id` column and GUC, where it names the product domain rather than the tenant architecture.
- [x] Update `/Users/kuna/projects/matops/docs/architecture.md`, `/Users/kuna/projects/matops/docs/spec.md`, `/Users/kuna/projects/matops/docs/roadmap.md`, `/Users/kuna/projects/matops/docs/map.md`, `/Users/kuna/projects/matops/docs/public-api.md`, `/Users/kuna/projects/matops/CHANGELOG.md`, and `/Users/kuna/projects/matops/CLAUDE.md`.
- [x] Update this plan with final outcomes and any follow-up work.

Gate:

- One architecture path remains.
- Repository-wide searches find no stale tenant assumptions outside migration history and historical documentation.
- Workspace lint and typecheck pass, accounting for documented pre-existing failures.
- `pnpm test` is green at the GATE, run by the loop under the run file's Authorizations.
- The user receives the exact targeted test commands needed for final verification.

## Test Plan

Agents write tests during the relevant wave and run the suite only at a GATE, as the run file authorizes.

Required coverage across the pivot:

- Organization creation produces exactly one default BJJ entity.
- Provisioning retries without duplicates.
- One organization owns several entities.
- An organization owner can access every entity.
- Entity staff cannot access an unassigned entity.
- A missing or foreign `x-matops-entity` header fails closed.
- One user can join several entities.
- Entity role and status changes do not affect sibling memberships.
- Removing one membership preserves other memberships.
- Entity RLS blocks sibling and unrelated entity rows.
- Organization-shared RLS blocks unrelated organizations.
- Organization dashboard excludes unrelated organizations.
- Organization member totals deduplicate users.
- Existing scheduling, booking, attendance, curriculum, rank, referral, notification, and public booking rules stay unchanged.
- Public codes, joins, booking links, and check-ins resolve the correct entity.
- Erase operations remove only the intended scope, and every new table is covered.

Static verification for each wave:

```text
pnpm lint
pnpm typecheck
```

Use affected-package commands first. The root guide documents existing workspace lint failures. Do not misreport those as pivot regressions.

## Edge Cases and Risks

- A Better Auth organization may exist after application provisioning fails. Provisioning must be idempotent and repairable.
- Old migrations stay untouched. New migrations may drop and recreate freely because no database holds data worth keeping.
- A user can own one organization and train in another. Organization and entity roles must not leak across those relationships.
- Entity deletion must not delete the organization.
- Organization deletion must define the order for entities, entity data, and Better Auth rows.
- General dashboard reads must not open unrestricted entity-table access.
- The current payment module stays functional as entity-scoped manual dues during this pivot. Do not redesign it for future providers.

## Rollout

Hard cutover on an empty database. Each wave lands on `dev` as one commit after a green gate. After Wave 3 the dev database is wiped and reseeded. Nothing is pushed and nothing merges to `main` before Wave 7; the merge is the human's act.

## Follow-up slices

Not part of this pivot. Each needs its own ADR and gate.

- `person`: one profile per organization for a login-less lead who visits two entities. Build when a gym reports that case.
- Renaming `academy_id` to `entity_id`: 818 hits across 131 files and 77 GUC references. Do it only if the kept name confuses a reader, and as its own wave.
- A metrics projection for the organization dashboard, if measurements show repeated entity reads are slow.

## Open Questions

- None. Answered questions live under Authorizations in the run file.

## Current Wave

None. The pivot is complete; the click-through, the device test and the merge to `main` are the human's.

## Outcome

Built over seven waves on `dev`, one commit each, migrations `0042`-`0047`, from 1040 tests to 1147. Nothing was pushed and nothing merged to `main`.

**What the pivot bought.** One gym can run two academies from one login. Each has its own name, time zone, address, schedule, roster, dues, curriculum, six-digit join code and public booking link, and shares nothing with its sibling but the owner. A person can own one mat and train at the other. The URL names the academy, so two browser tabs show two mats, a reload keeps the one you were on, and a link opens the right place. An owner gets `/overview` across all of them without a single query that reads two academies at once.

**What it cost.** Six migrations, a hard cutover with no old path kept alive, and a wipe of the dev database between `0045` and `0046`. Both clients were down for part of the run: the web from Wave 3 until Wave 4, mobile from Wave 3 until Wave 6.

**The bugs it found, none of which came from a bug report.** A permanent erase left the erased person's id in other students' referral history. `softDeleteAcademy` closed the organization and left every entity live, so a shut gym stayed findable by its code. `joinPending` set the active organization only when the session had none, so a student joining a second gym could not reach it. The web's RSC tRPC context was cached per request, freezing the entity at a prefetch that runs before any entity is known. `academy.rename` renamed the organization rather than the mat. `dropIn.promote` passed an entity id as an organization id. `wipe-academies.sql` was two waves out of date. Five of the seven were caught by a foreign key or a type, not by a test.

**Follow-up work, unchanged from the list below.** A `person` record for a login-less lead who visits two mats. Renaming `academy_id` to `entity_id`, 818 hits across 131 files. A metrics projection for the overview, once a measurement asks for one. Each needs its own ADR and gate.

## Progress

- [x] Architecture reviewed.
- [x] Target direction approved.
- [x] Durable wave plan created.
- [x] Plan reviewed and revised for an empty production database.
- [x] Wave 0 complete.
- [x] Wave 1 complete.
- [x] Wave 2 complete.
- [x] Wave 3 complete.
- [x] Wave 4 complete.
- [x] Wave 5 complete.
- [x] Wave 6 complete.
- [x] Wave 7 complete.
