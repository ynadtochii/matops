# Organization and entity pivot, run file

This is the executable half of [organization-entity-pivot.md](organization-entity-pivot.md).
The plan says what to build and why. This file says what to do next and holds
the state between turns.

**The file is the source of truth, not the conversation.** State lives here so
it survives compaction and `/clear`. Never keep plan state only in context.

---

## How to run it

Start the session with no permission prompts, then start the loop:

```
claude --permission-mode bypassPermissions
/loop /epic docs/organization-entity-pivot-epic.md
```

One invocation does **one whole wave**, then runs that wave's `GATE` and, when
the gate is green, ends the turn. The loop re-invokes and the next wave starts.
It does not stop for a human between waves.

**This overrides the `epic` skill's "one item per invocation" rule, on purpose.**
State is safe because this file is written after every item, not after every
wave. Read the skill's rule, then follow this section instead.

The turn runs like this:

1. Read the plan doc once, then this file. Take the first unchecked `- [ ]` item
   in the current wave.
2. Do it in full, to the per-item Definition of done.
3. **Write the file before starting the next item.** Flip the item to `- [x]`
   and append its entry to `## Log`. Never carry two finished items in context
   with neither written down.
4. Repeat until the wave's `GATE` item is next.
5. Run the gate. Green: commit, write the wave summary, end the turn. Red: see
   below.

Say one or two lines per item as you go. The full detail goes in `## Log`.

To do a single item by hand, without the loop:

```
/epic docs/organization-entity-pivot-epic.md
```

### A red gate

The loop fixes and retries. Read the failure, fix the cause, rerun the gate.
After **three** red runs of the same gate, mark the `GATE` item `- [!]`, write
what failed and what was tried in `## Log`, and call `ScheduleWakeup({stop: true})`.

### When to stop early

Stop mid-wave, without reaching the gate, in three cases. In all three, write
the file first, then call `ScheduleWakeup({stop: true})`.

- **The same item fails twice in a row.** Mark it `- [!]`, put the reason in
  `## Log`.
- **A locked decision turns out unsafe.** The plan's Decisions 1 to 16 and the
  answers under Authorizations are locked. If one cannot hold, add the choice to
  the plan's `Open Questions`, say what it is, and stop. Do not guess.
- **The wave has grown past what one turn can hold well.** Stop at the last
  clean item and say which one is next. The loop resumes there.

### When the last gate is green

Write the final summary in `## Log`, update the plan's `Progress`, and call
`ScheduleWakeup({stop: true})`. Say plainly that the epic is done and that the
next step is the human's: click through the web app, run the device test, and
merge `dev` into `main` when satisfied.

---

## Goal

Move MatOps from academy-as-organization to an organization that owns typed
entities. Creating a gym creates one organization and one default BJJ academy
entity. Owners can add a second BJJ academy and see an organization overview.
Full model and decisions: the plan doc.

Why now, as answered on 2026-09-01: **Alma beta**, the seed academy, stands in
for a gym opening a second location. Its owner needs one login for both mats,
staff and students who can belong to either or both, and one overview that
shows pending actions, dues and attendance for each location and the totals.

---

## Authorizations

Answered by the human on 2026-09-01. These are explicit asks, so the loop may
do them without asking again.

- **Run tests at every GATE.** `pnpm test` at the workspace root, plus
  `pnpm -F <package> test` for the packages the wave touched. An item whose
  whole job is to verify a fix may run its specific file with
  `pnpm -F <package> exec vitest run <file>`. No other test runs.
- **Write to the dev Neon branch.** `pnpm -F @matops/db migrate`,
  `pnpm db:seed reset`, and `psql "$POSTGRES_URL&sslrootcert=system" -f packages/db/src/seed/wipe-academies.sql`
  are allowed whenever a wave needs them. Dev data is disposable. `.env` must
  carry `DB_ENV=dev`; if `assertDevDatabase` refuses, stop, do not override.
- **Commit on `dev` after each green gate.** One commit per wave, subject line
  `Pivot wave N: <what it did>`, no body unless needed, no trailers. **Never
  push. Never touch `main`.** Merging `dev` into `main` deploys production and
  is the human's act.
- **Route prefix is `/entities/[entityId]`.** Locked.
- **Static gates only.** No dev server, no browser check, no simulator. The
  human clicks through the web app and runs `docs/mobile-device-test.md` after
  the last wave.
- **Wave 6 (mobile) passes on lint, typecheck and tests alone.**

---

## Constraints

Repo rules, from `CLAUDE.md` and `docs/delivery.md`:

- Read a file before editing it. Absolute paths.
- Zero comments on edited lines. No JSDoc added because a field is new. The
  only exception is a genuine non-obvious why: a workaround, an external
  constraint, a gotcha. Zero comments in test files, always.
- Deliberate shortcuts with a known ceiling get a `ponytail:` comment naming the
  ceiling and the upgrade path.
- Plain English in every doc, ADR, and commit message. Short sentences, active
  voice, no em dashes.
- Write the pure rule in `packages/domain` with a test **before** the API or UI
  that uses it (`delivery.md` §5).
- Migrations are structure only. No `UPDATE`, no `INSERT`. There is no data to
  fill, so nothing should tempt one.
- After `drizzle-kit generate`, set the new entry's `when` in `_journal.json`
  one day past the previous entry, then confirm the row count in
  `drizzle.__drizzle_migrations` after `migrate`.
- `pnpm lint` at the workspace root is red before this epic on `@matops/nextjs`
  and `@matops/expo` (unresolved types in Sentry and expo-camera files). Lint
  per package with `pnpm -F <pkg> lint`. Do not report that as a regression.
- The plan's Follow-up slices are out of scope: no `person` table, no
  `academy_id` rename, no metrics projection.

Working rules specific to this epic:

- Work on the `dev` branch in the main checkout. Nothing else is in flight.
- The plan doc's file paths were verified on 2026-09-01. Re-grep before editing;
  if a path or symbol has moved, say so in `## Log` and adjust.
- Keep `docs/organization-entity-pivot.md` in step: flip its wave checkboxes
  and `Current Wave` at each gate. Its task lists and this file's must not
  drift; if an item is added here, add it there.

---

## Definition of done

### Per item

1. The change is in, and it does what the item says.
2. `pnpm typecheck` passes for the packages touched.
3. `pnpm -F <package> lint` passes for the packages touched.
4. If the item changes behaviour or a rule, a test exists for it.
5. The item is flipped to `- [x]` and its entry is in `## Log`, written before
   the next item starts.

### Per wave (the GATE item)

1. `pnpm typecheck` at the root passes.
2. `pnpm -F <pkg> lint` passes for every package the wave touched.
3. `pnpm test` at the root is green. Record the passing count in `## Log`.
4. The wave's gate conditions from the plan doc hold, each checked and named in
   `## Log`.
5. Doc work for the wave is done (the plan's Wave 7 lists the final set; earlier
   waves update `CHANGELOG.md` with one line and the plan's checkboxes).
6. One commit on `dev`.
7. A short wave summary block in `## Log`: what landed, what surprised, what is
   carried forward.

---

## Tasks

### Wave 0: Contract and impact map

- [x] Write the `Why` paragraph into the plan doc (already drafted under Goal above; copy it in).
- [x] Add an ADR under `docs/issues/` (next free number after 123) that defines organization, entity, entity membership, default academy creation, the `x-matops-entity` header, the two GUCs, exact entity RLS, and carries the `Why` paragraph.
- [x] Update `docs/architecture.md` to mark `organization = academy` as the current model and this plan as the approved replacement.
- [x] Correct `docs/issues/18-multi-academy-ux.md`: its claim that aggregate dashboards need no model change is superseded by the new ADR.
- [x] Add the plan, this run file, and the ADR to `docs/map.md`.
- [x] Fix the `CLAUDE.md` summary paragraph that still reports 27 failing tests; the suite is green as of the 2026-09-01 commit.
- [x] Inventory every table with `academy_id`, every RLS policy, every public identifier, and every erase or seed registry entry. Write the list into the ADR.
- [x] Inventory every caller of `activeOrganizationId`, `ctx.academyId`, `withTenant`, `AcademyProvider`, and `useAcademy`. Write the counts into the ADR.
- [x] Record the final migration matrix in the ADR: for each table, organization-scoped, entity-scoped, or global, and which `member_id` columns move to `entity_membership.id`.
- [x] GATE 0: no code or schema changed; docs have no conflicting target model; `pnpm typecheck` green; commit.

### Wave 1: Foundation schema, authorization split, and provisioning

Schema:

- [ ] Add `entity`, `academy_profile`, and `entity_membership` as focused schema files under `packages/db/src/`, exported from `schema.ts`, with the constraints the plan lists and no cascade on any new foreign key.
- [ ] Add the unique constraint on Better Auth `member(organization_id, user_id)`. Query dev for duplicates first; if any exist, delete the newer row and note it in `## Log`.
- [ ] Add composite uniqueness and foreign-key support for organization-safe references.
- [ ] Generate the migration, stamp `when`, apply to dev, confirm the row count.
- [ ] Update Drizzle relations and exports.
- [ ] Update the seed so a new organization gets one default entity whose id equals the organization id, an academy profile, and owner entity memberships.

Authorization:

- [ ] Replace `withTenant` in `packages/db/src/tenant.ts` with `withScope({ organizationId, entityId? })`, setting `app.organization_id` and, when given, `app.academy_id` in one `set_config` round trip.
- [ ] Read `x-matops-entity` in `createTRPCContext` and expose `ctx.requestedEntityId`.
- [ ] Add organization membership and entity membership readers in `packages/db/src/membership.ts`.
- [ ] Add the organization and entity procedure tiers in `packages/api/src/trpc.ts`, following the existing tier names.
- [ ] Fail closed: missing header is `BAD_REQUEST`, foreign entity is `FORBIDDEN`, both before any transaction opens.
- [ ] Organization ownership grants access to every organization entity; everyone else needs an active `entity_membership`.
- [ ] Authorization tests: sibling entities, unrelated organizations, suspended memberships, organization owners, missing header, foreign header.
- [ ] Extend the structural RLS coverage test to the new tables and to the organization GUC.

Provisioning:

- [ ] Replace academy creation with an idempotent organization provisioner in `packages/auth/src/index.ts` and `packages/api/src/router/academy.ts`.
- [ ] The provisioner creates the default BJJ entity, owner entity membership, academy profile, public code, and default curriculum track, and repairs any missing step on retry.
- [ ] Return both `organizationId` and `entityId` from the creation flow.
- [ ] Add owner-only `entity.create`, allowing only `bjj_academy`, giving the new academy its own settings, public code, schedule, curriculum, and membership rows.
- [ ] Provisioning and retry tests.
- [ ] GATE 1: plan's Wave 1 gate conditions; per-wave Definition of done; commit.

### Wave 2: Move invites and memberships

- [ ] Entity invites resolve an organization and an entity.
- [ ] On join, create or reuse the Better Auth organization membership and create one pending entity membership.
- [ ] Move approval, suspension, archive, restore, and removal to entity membership in `packages/api/src/router/membership.ts`.
- [ ] Last-owner protection at organization level; entity-owner protection at entity level where needed.
- [ ] Erase: deleting one entity membership preserves sibling memberships; the global user is deleted only when no surviving organization relationship requires it.
- [ ] Extend `erase-coverage.test.ts` to the new tables.
- [ ] Update member, invite, and erase tests.
- [ ] GATE 2: plan's Wave 2 gate conditions; per-wave Definition of done; commit.

### Wave 3: Convert BJJ domain tables and RLS

- [ ] Keep `academy_id` on every BJJ table; add the foreign key to `entity.id` and the composite `(organization_id, academy_id)` reference where the ADR requires `organization_id`.
- [ ] Point `member_id` columns on payments, rank, notes and referrals at `entity_membership.id`.
- [ ] Replace academy policies and indexes with entity equivalents that carry the organization match where a join needs it.
- [ ] Composite integrity checks so child and parent rows cannot belong to different organizations or entities.
- [ ] Move scheduling, curriculum, attendance, bookings, ranks, notes, referrals, notifications, public booking, and manual dues to the entity procedures.
- [ ] Cron and public routes resolve and validate entity scope without the header.
- [ ] Update seed, teardown, erase coverage, policy coverage, and cross-entity tests.
- [ ] Generate the migration, stamp `when`, wipe and reseed dev, confirm the row count.
- [ ] GATE 3: plan's Wave 3 gate conditions; per-wave Definition of done; commit.

### Wave 4: Restructure web routes and shell

- [ ] Organization and entity providers in the web shell, replacing `AcademyProvider` reads.
- [ ] Set `x-matops-entity` in `apps/nextjs/src/trpc/react.tsx` and `server.tsx` from the route segment.
- [ ] Move every `(app)` route, owner and student alike, under `/entities/[entityId]`, keeping `/profile` and adding `/overview`.
- [ ] `ROUTE_ACCESS` matches on the path after the entity segment; `/overview` is gated on organization role and lists a non-owner's entities only.
- [ ] Entity selector with the overview and the authorized entities; owner-only `Add entity` with only BJJ academy enabled.
- [ ] Preserve prefetch, loading, mobile web tabs, deep links, and invalidation behaviour.
- [ ] Route and shell tests.
- [ ] GATE 4: plan's Wave 4 gate conditions; per-wave Definition of done; commit.

### Wave 5: Add the organization dashboard

- [ ] A small entity summary type in `packages/domain/src/dashboard.ts`, reused by organization aggregation.
- [ ] An entity summary reader behind the existing BJJ dashboard calculations.
- [ ] Organization dashboard procedure: authorize the owner, enumerate entities, read each through exact entity context, combine on the server, dedupe members by `user_id`, keep currency grouping and entity time zones, group pending actions by entity with links.
- [ ] Overview screen: organization totals plus one card per entity.
- [ ] Aggregation tests with sibling entities and an unrelated organization.
- [ ] GATE 5: plan's Wave 5 gate conditions; per-wave Definition of done; commit.

### Wave 6: Update mobile and public surfaces

- [ ] List student entity memberships instead of academy organizations.
- [ ] Replace `academy.setActive` with a stored entity pick in secure-store, sent as `x-matops-entity` from `apps/expo/src/utils/api.tsx`.
- [ ] Join codes, QR check-in, public booking keys, and booking links resolve to entities.
- [ ] Push registration and notifications keep organization and entity context.
- [ ] Public and mobile contract tests.
- [ ] GATE 6: plan's Wave 6 gate conditions on static gates alone; per-wave Definition of done; commit.

### Wave 7: Contract cleanup and documentation

- [ ] Contract migration: remove academy fields from `organization`; drop `member.status` and `member.invited_role`; keep `member.role`.
- [ ] Remove `AcademyProvider`, the old academy switcher, `withTenant`, and stale exports.
- [ ] Remove obsolete indexes, policies, and seed mappings.
- [ ] Search all file types for stale `ctx.academyId`, `withTenant`, and `organization = academy` assumptions.
- [ ] Update `docs/architecture.md`, `docs/spec.md`, `docs/roadmap.md`, `docs/map.md`, `docs/public-api.md`, `CHANGELOG.md`, and `CLAUDE.md`.
- [ ] Update the plan doc's `Progress` and this file's final summary.
- [ ] GATE 7: plan's Wave 7 gate conditions; per-wave Definition of done; commit; then stop the loop and hand over the click-through, the device test, and the merge.

---

## Log

Format: one line per item. What changed, files touched, anything that surprised
you. At a gate, add a short wave summary block.

<!-- Append below. Newest at the bottom. -->

### Wave 0

- Item 1: the `Why` paragraph was already in `docs/organization-entity-pivot.md` under `## Why`, matching the run file's Goal. Nothing to copy in, flipped as done.
- Items 2, 7, 8, 9: wrote `docs/issues/124-the-organization-owns-typed-entities.md`. It defines organization, entity, entity membership and default academy creation, the `x-matops-entity` header and its fail-closed rules, the two GUCs with a table of which transaction sets which, and exact entity RLS. It carries the `Why` paragraph. The inventories were read from the dev Neon branch and from greps over `apps/` and `packages/`, not from the plan doc.
- Inventory surprises worth carrying forward: **21** tables carry `academy_id`, not the 19 real product tables. `notification_pref` is still on dev and must be dropped, and `tenant_probe` is the seed health probe. `academy_invite` carries `academy_id` with **no RLS policy on purpose** (the join screen resolves a token with no session), so it is the one entity-scoped table with no policy. Only **14** foreign keys exist in the whole schema and only `academy_invite.academy_id` ties a product table to the tenant, so every other `academy_id` is loose text today.
- Migration matrix decision recorded in ADR 124 §8: **no BJJ table gains `organization_id`**. The `academy_id -> entity.id` key plus `entity.organization_id` already proves one organization per row, and Decision 14 means no product query filters by organization without an entity. The organization match is carried only on `entity_membership(organization_id, entity_id) -> entity(organization_id, id)` and on the composite `(academy_id, member_id) -> entity_membership(entity_id, id)`. This saves Wave 3 from adding 20 redundant columns and indexes.
- Migration matrix, `member_id` columns: **12 columns across 7 tables** move to `entity_membership.id`. **10 columns keep pointing at `user.id`** because they name a person and not a membership (`instructor_id` twice, `student_id`, `marked_by` twice, `converted_user_id`, `notification.user_id`, `sent_by`, `assigned_by`, `actor_id`).
- Caller counts: `ctx.academyId` 63 hits in 19 files, `useAcademy` 53 in 24, `withTenant` 28 in 13, `activeOrganizationId` 9 in 6, `AcademyProvider` 4 in 2.
- Item 3: `docs/architecture.md` gets two banners, not a rewrite. One under §0's "read this first" line and one at the head of §5 "Tenancy". Both say the same thing plainly: `organization = academy` is what runs today and is not the target, the plan and ADR 124 are the approved replacement, and §5 is rewritten at the pivot's last wave. Rewriting §5 now would put a false present tense in the doc of record.
- Item 4: `docs/issues/18-multi-academy-ux.md` gets a dated correction block under its v1 non-goals. ADRs are append-only, so the wrong sentence stays and the block says why it is wrong. It also corrects two more things in that note that this pivot changes and that the epic did not name: the active academy stops living on the session (the header replaces `setActive`), and client-as-role-lens stops being the switch (the web app lists every entity, `/overview` shows an owner all of them).
- Item 5: `docs/map.md` gets one entry in `## Decisions so far` for ADR 124, linking the plan and this run file, at the house length. The entry states the header rule, the exact-RLS rule, the "no BJJ table gains `organization_id`" decision and the out-of-scope list, so a reader who opens only `map.md` gets the shape.
- Item 6: `CLAUDE.md` line 6 claimed **597 tests, 27 failing** and blamed `packages/api/vitest.config.ts:11`. Both halves were stale. Commit `0626fd9` (2026-09-01) fixed the failures; the dummy `POSTGRES_URL` is still in the config and is **correct by design**, since every base-connection helper takes a required `exec` and the tests inject PGlite as `baseDb`. The paragraph now says the suite is green and that lint is the one remaining pre-existing red gate. The passing count goes in at GATE 0, from the run the gate makes anyway.
- GATE 0 green. `pnpm typecheck` 17/17. `pnpm test --force` **1040 tests across 93 files, all passing** (domain 528/35, api 348/33, db 129/23, validators 32/1, notifications 3/1). No package lint was run because no package was touched: this wave changed eight markdown files and nothing else. `git status` before the commit showed no file outside `docs/` and `CLAUDE.md`/`CHANGELOG.md`, so the "no code or schema changed" condition holds by inspection. Prettier reformatted four of the eight; three of its edits were pre-existing drift in `docs/architecture.md` (`*booking*` to `_booking_`, `*ahead*` to `_ahead_`, one stray blank line) and are in the diff.

**Wave 0 summary.**

**What landed.** ADR [124](issues/124-the-organization-owns-typed-entities.md), the contract: the three words, the header rule with its two failure codes, the two GUCs with a table of which transaction sets which, exact entity RLS, four inventories read off the dev database rather than guessed, and the migration matrix. `docs/architecture.md` and ADR 18 now say which model is current and which is the target. `docs/map.md` and `CHANGELOG.md` carry one entry each. `CLAUDE.md`'s stale "27 failing tests" is corrected. The plan doc's Wave 0 is ticked, `Current Wave` reads Wave 1, and `Progress` has Wave 0 complete. One commit, `3087b1b`.

**What surprised.** Three things the plan did not know. **21** tables carry `academy_id`, not the ~19 product tables: `notification_pref` is dead since v3.8 and still on dev (it must be dropped), and `tenant_probe` is the `seed:health` row. **Only 14 foreign keys exist in the entire schema**, and only `academy_invite.academy_id` ties a product table to the tenant, so every other `academy_id` is loose text and Wave 3 is adding the first real keys rather than repointing existing ones. And `academy_invite` is the one table with `academy_id` and **no RLS policy**, on purpose, because the join screen resolves a token with no session; the pivot must not "fix" that.

**What is carried forward.** The matrix decision that **no BJJ table gains an `organization_id`** (ADR 124 §8) is the one Wave 3 must not quietly reverse: the `academy_id -> entity.id` key plus `entity.organization_id` already proves one organization per row, and Decision 14 means no product query filters by organization without an entity. The organization match rides on two composite keys only. Wave 1 starts at the `entity` / `academy_profile` / `entity_membership` schema files and must check dev for duplicate `member(organization_id, user_id)` rows before adding that unique constraint. `erase-coverage.test.ts` reads the schema for an `academy_id` column, so its filter has to widen to catch the new tables, which key on `entity_id`. The passing count to beat from here is **1040**.
