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

- [x] Add `entity`, `academy_profile`, and `entity_membership` as focused schema files under `packages/db/src/`, exported from `schema.ts`, with the constraints the plan lists and no cascade on any new foreign key.
- [x] Add the unique constraint on Better Auth `member(organization_id, user_id)`. Query dev for duplicates first; if any exist, delete the newer row and note it in `## Log`.
- [x] Add composite uniqueness and foreign-key support for organization-safe references.
- [x] Generate the migration, stamp `when`, apply to dev, confirm the row count.
- [x] Enable RLS and add the policies for `entity`, `academy_profile` and `entity_membership` in a second migration; stamp `when`, apply to dev, confirm the row count.
- [x] Update Drizzle relations and exports.
- [x] Update the seed so a new organization gets one default entity whose id equals the organization id, an academy profile, and owner entity memberships.

Authorization:

- [x] Replace `withTenant` in `packages/db/src/tenant.ts` with `withScope({ organizationId, entityId? })`, setting `app.organization_id` and, when given, `app.academy_id` in one `set_config` round trip.
- [x] Read `x-matops-entity` in `createTRPCContext` and expose `ctx.requestedEntityId`.
- [x] Add organization membership and entity membership readers in `packages/db/src/membership.ts`.
- [x] Add the organization and entity procedure tiers in `packages/api/src/trpc.ts`, following the existing tier names.
- [x] Fail closed: missing header is `BAD_REQUEST`, foreign entity is `FORBIDDEN`, both before any transaction opens.
- [x] Organization ownership grants access to every organization entity; everyone else needs an active `entity_membership`.
- [x] Extend the structural RLS coverage test to the new tables and to the organization GUC.

Provisioning:

- [x] Replace academy creation with an idempotent organization provisioner in `packages/auth/src/index.ts` and `packages/api/src/router/academy.ts`.
- [x] The provisioner creates the default BJJ entity, owner entity membership, academy profile, public code, and default curriculum track, and repairs any missing step on retry.
- [x] Return both `organizationId` and `entityId` from the creation flow.
- [x] Add owner-only `entity.create`, allowing only `bjj_academy`, giving the new academy its own settings, public code, schedule, curriculum, and membership rows.
- [x] Authorization tests: sibling entities, unrelated organizations, suspended memberships, organization owners, missing header, foreign header.
- [x] Provisioning and retry tests.
- [x] GATE 1: plan's Wave 1 gate conditions; per-wave Definition of done; commit.

### Wave 2: Move invites and memberships

- [x] Entity invites resolve an organization and an entity.
- [x] On join, create or reuse the Better Auth organization membership and create one pending entity membership.
- [x] Move approval, suspension, archive, restore, and removal to entity membership in `packages/api/src/router/membership.ts`.
- [x] Last-owner protection at organization level; entity-owner protection at entity level where needed.
- [x] Erase: deleting one entity membership preserves sibling memberships; the global user is deleted only when no surviving organization relationship requires it.
- [x] Extend `erase-coverage.test.ts` to the new tables.
- [x] Update member, invite, and erase tests.
- [x] GATE 2: plan's Wave 2 gate conditions; per-wave Definition of done; commit.

### Wave 3: Convert BJJ domain tables and RLS

- [x] Keep `academy_id` on every BJJ table; add the foreign key to `entity.id` and the composite `(organization_id, academy_id)` reference where the ADR requires `organization_id`.
- [x] Make the test suite repeatable under `pnpm test` again: the db suite's PGlite instances time their hooks out at random when five package suites run at once.
- [x] Point `member_id` columns on payments, rank, notes and referrals at `entity_membership.id`.
- [x] Replace academy policies and indexes with entity equivalents that carry the organization match where a join needs it.
- [x] Composite integrity checks so child and parent rows cannot belong to different organizations or entities.
- [x] Move scheduling, curriculum, attendance, bookings, ranks, notes, referrals, notifications, public booking, and manual dues to the entity procedures.
- [x] Cron and public routes resolve and validate entity scope without the header.
- [x] Update seed, teardown, erase coverage, policy coverage, and cross-entity tests.
- [x] Apply migration `0046` to dev, wipe and reseed, confirm the row count.
- [x] GATE 3: plan's Wave 3 gate conditions; per-wave Definition of done; commit.

### Wave 4: Restructure web routes and shell

- [x] Organization and entity providers in the web shell, replacing `AcademyProvider` reads.
- [x] Set `x-matops-entity` in `apps/nextjs/src/trpc/react.tsx` and `server.tsx` from the route segment.
- [x] Move every `(app)` route, owner and student alike, under `/entities/[entityId]`, keeping `/profile` and adding `/overview`.
- [x] `ROUTE_ACCESS` matches on the path after the entity segment; `/overview` is gated on organization role and lists a non-owner's entities only.
- [x] Entity selector with the overview and the authorized entities; owner-only `Add entity` with only BJJ academy enabled.
- [x] Preserve prefetch, loading, mobile web tabs, deep links, and invalidation behaviour.
- [x] Route and shell tests.
- [x] GATE 4: plan's Wave 4 gate conditions; per-wave Definition of done; commit.

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

### Wave 1

- Wave 1 item 1: one new file, `packages/db/src/entity-schema.ts`, exported from `schema.ts`. Three tables in one file rather than three files, because they are one concern and every existing schema file already groups a concern (`payments-schema.ts` holds four tables). `pnpm -F @matops/db typecheck` and `lint` clean.
- Two id types are decided here and are load-bearing. **`entity.id` is `text`, not `uuid`**, because Decision 5 creates the default entity with the organization's own id and Better Auth organization ids are random strings; it is also what every BJJ table's existing `text academy_id` already points at, so Wave 3 never changes a column type. **`entity_membership.id` is `text`** for the same reason: the twelve `member_id` columns ADR 124 §8 repoints are already `text`. It defaults to `gen_random_uuid()::text` in the database rather than in the app, so a raw SQL insert from a seed or a script gets an id too.
- Constraints as the plan lists them: unique `(organization_id, id)` and `(organization_id, slug)` on `entity`, unique `public_code`, a **partial** unique index for one default per organization (`where is_default and deleted_at is null`, so a soft-deleted default does not block the next one), unique `(entity_id, user_id)` and `(entity_id, id)` on `entity_membership`, and the composite foreign key `(organization_id, entity_id) -> entity(organization_id, id)` that stops a membership pointing at a sibling organization's entity. **No foreign key carries `onDelete`**, so all four are `NO ACTION`.
- Decision 3 ("entity types come from a fixed application and database list") is enforced with a `check` constraint, `type in ('bjj_academy')`, plus an `ENTITY_TYPES` constant beside it. The application half moves to `packages/domain` when `entity.create` needs it.
- Wave 1 item 2: **dev has no duplicates**, so nothing was deleted. `select organization_id, user_id, count(*) from member group by 1,2 having count(*) > 1` returned zero rows across 26 member rows. The change is one word in `packages/db/src/auth-schema.ts`: migration `0019`'s plain `index("member_by_org_user")` becomes a `uniqueIndex` under the same name, so the migration drops and recreates it rather than adding a second index over the same two columns.
- Wave 1 item 3: nothing new to write, item 1 already carries it. The organization-safe references need three things and all three are in `entity-schema.ts`: unique `entity(organization_id, id)` as the target for the same-organization key, unique `entity_membership(entity_id, id)` as the target for Wave 3's twelve `(academy_id, member_id)` keys, and the composite foreign key `entity_membership_entity_same_org` itself. Checked rather than assumed: `entity.id` is the primary key, so Wave 3's `academy_id -> entity.id` needs no extra unique index. One thing deliberately **not** added: a unique `(id, type)` on `entity` so a BJJ table could key on the type as well. Postgres cannot reference a literal, it would need a generated column on every BJJ table, and ADR 124 already puts the type check in the application.
- Wave 1 item 4: `0042_entity_foundation.sql`, applied to dev, **43 rows** in `drizzle.__drizzle_migrations` matching `_journal.json`. The generated SQL needed two fixes before it could run. **It re-added `organization.country`**, because `0041_academy_country.sql` was hand-written with no snapshot, so the generator diffed against `0040`'s. On a database rebuilt from `0000` that statement would have failed after `0041` had already added the column, so it is removed; the new `0042` snapshot records the column correctly and the drift is closed. **And it emitted the composite foreign key before the unique index it references**, so `entity_membership_entity_same_org` would have failed on a fresh build. The statements are reordered: tables, then indexes, then keys.
- The journal trap fired exactly as `CLAUDE.md` warns. `drizzle-kit generate` stamped `when` at `1788297143047`, which is **earlier than `0041`'s `1788825600000`**, so `migrate` would have skipped the whole migration and still printed "migrations applied successfully". Stamped to `1788912000000`, one day past `0041`.
- Verified live on dev, not assumed: all twelve indexes present, the check constraint reads `CHECK ((type = 'bjj_academy'::text))`, **all five foreign keys are `a`/`a`** (no action on update and delete, so nothing cascades), `entity_membership.id` is `text`, and `member_by_org_user` is now `CREATE UNIQUE INDEX`. `matops_app` already holds all four privileges on the three new tables without a grant statement, because `0001`'s `ALTER DEFAULT PRIVILEGES` covers every table the migration role creates.
- **New item inserted after this one.** The migration leaves `relrowsecurity = false` on all three new tables. Grants come for free, RLS does not, and ADR 124 §4 requires `entity` and `entity_membership` to match on `app.organization_id` and `academy_profile` on `app.academy_id`. The existing `rls-coverage.test.ts` would not have caught it either, because it looks for tables with an `academy_id` column and these key on `entity_id` and `organization_id`.
- Wave 1 item 4b (the inserted item): `0043_entity_rls.sql`, applied to dev, **44 rows**. `entity` and `entity_membership` match on `app.organization_id`, `academy_profile` matches on `app.academy_id`, each with `USING` and `WITH CHECK`. Written by hand rather than generated, because `drizzle-kit` does not carry RLS, the same way `0001`, `0003` and `0013` are hand-written. Its snapshot is a copy of `0042`'s with a fresh id and `prevId` chained, so `drizzle-kit check` stays clean, and it does. No `GRANT` statement is needed: `0001`'s `ALTER DEFAULT PRIVILEGES` already gave `matops_app` all four privileges on both tables at creation, checked live.
- Proved on dev in two rolled-back transactions rather than assumed. A second default entity in one organization is refused by `entity_one_default_per_org`. `type = 'sauna'` is refused by `entity_type_supported`. A second membership for the same person on one entity is refused by `entity_membership_one_per_user`. Under `SET LOCAL ROLE matops_app` the organization reads its own two entities, a foreign `app.organization_id` reads zero entities and zero memberships. **And the one that matters most**: with a real second organization in the transaction, a membership claiming `org_two` while pointing at the first organization's entity is refused by `entity_membership_entity_same_org`, while the same-organization insert succeeds. That composite key is what stops a membership reaching a sibling organization's entity, so it is worth the two extra unique indexes it costs.
- Wave 1 item 5: already carried by item 1, checked rather than assumed. `entity-schema.ts` defines `entityRelations`, `academyProfileRelations` and `entityMembershipRelations`, and `schema.ts` re-exports the file. `client.ts` does `import * as schema from "./schema"` and hands the whole namespace to `drizzle()`, so both the tables and the relations are registered with no second edit. `index.ts` was left alone on purpose: it exports helper modules, not schema, and nothing in the new file is a helper yet.
- Wave 1 item 6: `registry.ts`, `data.ts`, `run.ts` and `teardown.ts`. `pnpm db:seed:reset` run against dev and the rows checked live: **1 entity** (`seed_org_alma`, id equal to the organization id, `bjj_academy`, default, code `990001`, `Europe/Kyiv`), **1 academy profile**, and **24 entity memberships** joining one to one against the 24 Better Auth `member` rows.
- It mirrors **every** member, not only the owner the item asked for. Same map, same loop, and it means the seed keeps working when Wave 2 moves the member reads onto `entity_membership` rather than needing a second pass. Teardown deletes the three new tables before `organization`, membership and profile before the entity they key on, so `seed down` and `seed reset` still round-trip.
- `seedEntityMembershipId` derives the id from the `member.id` it mirrors (`seed_mem_` becomes `seed_emem_`) instead of taking an academy key and a handle. One function, no handle plumbing through `data.ts`, and the ids stay deterministic so a re-run is idempotent.
- Worth knowing for Wave 2: three seeded rows carry `role = "member"`, Better Auth's own default, not one of `owner`/`instructor`/`student`. The mirror is faithful, so they now sit in `entity_membership` too. Wave 2 owns whether the entity role list accepts that value or rewrites it at approval.
- Wave 1 item 7: `withTenant` is gone and `withScope({ organizationId, entityId? }, fn, exec)` replaces it. Still **one round trip**: two `set_config` calls plus the role when an entity is named, two when it is not. `TENANT_GUC` becomes `ENTITY_GUC` and `ORGANIZATION_GUC` joins it; the Postgres names are untouched, so `app.academy_id` keeps its spelling and now holds an entity id, exactly as ADR 124 §3 says.
- **Omitting `entityId` leaves `app.academy_id` unset**, so every entity policy matches nothing and an organization transaction cannot read entity rows by accident. `entityId: ""` is refused rather than treated as absent, because an empty string is a caller bug and silently widening the scope is the one failure mode this seam exists to prevent.
- The rename went the whole way rather than half. The bound helper on the identity tiers is now `ctx.withScope`, updated at its four call sites in `dropin.ts`, `attendance.ts`, `membership.ts` and `members.ts`, and the prose in `trpc.ts`, `index.ts`, `system.ts`, `seed/run.ts` and three RLS tests no longer says `withTenant`. A repo-wide grep for `withTenant` outside migration history now finds nothing, which is Wave 7 work done early for the price of one `sed`.
- `packages/db/test/tenant.test.ts` rewritten: five tests covering both GUCs set, the entity GUC left unset on an organization scope, everything reset at COMMIT, and the two refusals. **Run and green, 5 passed.** `enforceTenant` passes `{ organizationId: academyId, entityId: academyId }` for now, which is correct while the default entity id equals the organization id; the real entity resolution arrives with the procedure tiers.
- Wave 1 item 8: `createTRPCContext` reads `x-matops-entity` off `opts.headers` and puts it on `ctx.requestedEntityId`, next to where `x-trpc-source` is set by the three clients. `undefined` rather than `null` when absent, so a missing header and an empty header are the same thing to the procedure that has to refuse it. Nothing reads it yet; the tiers do. The three clients that would set it (`apps/nextjs/src/trpc/react.tsx`, `server.tsx`, `apps/expo/src/utils/api.tsx`) are Wave 4 and Wave 6 and are untouched.
- Correction to the line above: the item also needed `packages/api/test/helpers.ts`, which builds a `Ctx` by hand and so failed typecheck on the new required field. `ctxFor` now derives `requestedEntityId` from the `Headers` it is already given, which means every existing router test can name an entity by passing a header, with no new helper argument. `pnpm -F @matops/api typecheck` and `lint` green.
- Wave 1 item 9: three readers added to `packages/db/src/membership.ts`, all on the base connection because they run before the request transaction opens, the same reason `getMembership` does. `getEntityMembership(userId, entityId, exec)` returns the row or null. `getEntityInOrganization(entityId, organizationId, exec)` loads one live entity **only if it belongs to that organization**, so an entity of someone else's gym reads null and is indistinguishable from one that does not exist. `listEntitiesOf(organizationId, exec)` returns the live entities, default first.
- **No second organization-membership reader was written.** `getMembership` already is one: it reads Better Auth `member` scoped by organization and skips a soft-deleted organization. Its second parameter was named `academyId`, which was the old model talking, so it is now `organizationId`. The parameter is positional, so no call site changed and Wave 7 has one less stale name to find.
- Wave 1 items 10, 11 and 12 are one code block in `packages/api/src/trpc.ts`, so they land together. Six new tiers with the plan's names: `organizationMemberProcedure`, `organizationOwnerProcedure`, `entityEnrolledProcedure`, `entityMemberProcedure`, `entityStaffProcedure`, `entityOwnerProcedure`. `resolveOrganization` and `resolveEntity` sit beside the existing `resolveActiveMembership`, which is untouched, so every current router keeps working while the new tiers exist alongside.
- **Everything that can refuse, refuses before a transaction opens.** `resolveEntity` runs the whole chain on the base connection: no session is `UNAUTHORIZED`, no active organization or no organization membership is `FORBIDDEN`, a missing `x-matops-entity` is **`BAD_REQUEST`** because the client is broken rather than the caller unauthorized, and an entity that is unknown, soft-deleted or belongs to another organization is **`FORBIDDEN`**. Those last three cases return the same message on purpose: `getEntityInOrganization` filters by organization in the query, so a foreign entity reads null and is indistinguishable from one that never existed. That is what stops the header being used to enumerate other people's gyms.
- An active organization **owner** reaches every entity of the organization with no `entity_membership` row needed, and gets a synthesized owner membership. Everyone else needs a real row that passes `canEnroll`.
- **One judgement call worth challenging.** The item says a non-owner needs an "active" entity membership, but `entityEnrolledProcedure` admits `pending` as well, through the same `canEnroll` whitelist the current `enrolledProcedure` uses, and `entityMemberProcedure` is where `active` starts. Requiring `active` at the enrolled tier would lock pending students out of the schedule, which ADR 23 deliberately allows and the plan's Wave 3 gate calls "existing BJJ behavior unchanged". Suspended, archived and removed are refused at every tier, as before.
- **`ctx.membership.memberId` and `joinedAt` still come from the Better Auth `member` row**, while `role` and `status` come from `entity_membership`. That looks wrong until you see why: the payment, rank and referral tables key on `member.id` until Wave 3 repoints them, and the five call sites that read `memberId` are all dues paths. Role and status are the operational facts and have already moved (Decision 7). The mixed source carries the one comment in the block. `ctx.entityMembership` is exposed beside it, null only for an organization owner with no row, so Wave 3 has the value without another plumbing pass.
- `runScoped` was extracted because the organization and entity middlewares both need the after-commit deferral `enforceTenant` invented, and copying it twice is how the two drift. Root `pnpm typecheck` 17/17, `@matops/api` and `@matops/db` lint clean.
- Reordered before doing it: the **authorization tests** item moved down to sit just above "Provisioning and retry tests", in this file and in the plan doc. It cannot be written first, because the new tiers have no consumer until `entity.create` and the entity reads exist, and inventing a test-only router to call would be shipping scaffolding to test scaffolding. The provisioning items build the real caller.
- Wave 1 item 13: `packages/db/test/rls-coverage.test.ts` extended. Its discovery query found tables by an `academy_id` column, which would have missed all three new tables (they key on `entity_id` and `organization_id`), so the query now also takes a named list and the test asserts all three are found. **8 tests, green.**
- Two of the three new assertions are about the thing that actually bites: a `SCOPE_GUC` map says which GUC each table must read, one test checks every policy expression contains it, and one checks that **no entity-scoped table mentions `app.organization_id` at all**. An entity policy that read the organization GUC would let a sibling entity through, which is the exact failure ADR 124 §3 forbids and the one a reviewer would not see by eye.
- Checked they are not decoration: flipping `SCOPE_GUC.entity` to the entity GUC makes both new assertions fail, and restoring it makes all eight pass again.
- **Turn boundary, mid-wave, nothing committed.** The Authorizations allow one commit per wave after a green gate, and Wave 1's gate is not reached, so the tree stays dirty and the state lives in this file. Before stopping, the two suites the seam change could have broken were run: `@matops/db` **134 passed** (up from 129, the five new `withScope` tests) and `@matops/api` **348 passed**, unchanged. Root `pnpm typecheck` 17/17, `@matops/db` and `@matops/api` lint clean.
- **Next item is the provisioner**, in `packages/auth/src/index.ts` and `packages/api/src/router/academy.ts`. Everything under Schema and Authorization in Wave 1 is done except the authorization tests, which were deliberately moved to sit after `entity.create` gives them something real to call. Thirteen items done, six plus the gate to go.
- Wave 1 items 14, 15 and 16: `provisionOrganization({ organizationId, ownerUserId }, exec)` in the new `packages/db/src/provision.ts`. It reads the organization once, then makes four rows: the default **entity** (id equal to the organization id, `bjj_academy`, default, carrying the organization's own public code, time zone, country, address and map link), the **academy profile** (carrying the four public-booking and curriculum settings across), the owner's **entity membership** (`owner`/`active`), and the **default curriculum track**. It returns `created`, the list of steps this run had to make, so a retry that finds nothing missing reports an empty array.
- Idempotence is four `onConflictDoNothing().returning()` calls rather than four "does it exist" reads. Postgres already holds the uniqueness (the entity primary key, the profile primary key, `entity_membership_one_per_user`, and `curriculum_track_one_default`), so asking it a second time in application code would be slower and would still race. `.returning()` gives the repair report for free.
- **It runs in two places on purpose.** `afterCreateOrganization` calls it, and `academy.create` calls it again right after. In production the second call creates nothing. It matters anyway: Better Auth can insert the organization row and fail before our setup finishes, which would leave an owner signed in to a gym with no place to run classes, and the router call repairs exactly that. It also means the router tests exercise real provisioning, because the test harness's fake Better Auth does not run organization hooks. `createDefaultTrack` is no longer called from the hook; the provisioner does that step.
- **A collision the pivot would have introduced:** `generateAcademyCode` only checked `organization.public_code`, but entities now hand out codes from the same six-digit space, so a second academy could have been minted a code a different gym's organization already held, and a student typing it would reach the wrong gym or an ambiguous match. It now checks both tables.
- `academy.create` returns `{ academyId, organizationId, entityId }`. `academyId` stays so the web `create-academy.tsx` keeps working until Wave 4 moves it. `pnpm typecheck` 17/17, four packages lint clean, `onboarding.test.ts` **14 passed**.
- Wave 1 item 17: the pure rule first, as `delivery.md` §5 requires. `packages/domain/src/entity.ts` holds `ENTITY_TYPES`, `isSupportedEntityType` and `isBjjAcademy`, with **5 tests, green**, including that a near miss like `BJJ_ACADEMY` or `bjj-academy` is refused rather than guessed. The duplicate constant in `entity-schema.ts` is deleted, so the list has one home; the SQL check constraint is the second copy and cannot drift silently, because widening it needs a migration.
- `CreateEntitySchema` in `packages/validators` is `z.enum(ENTITY_TYPES)`, so an unimplemented type is refused at the boundary, again by the check constraint, and never reaches a router.
- New `packages/api/src/router/entity.ts`, mounted as `entity` on the root: `list` on `organizationMemberProcedure`, `current` on `entityEnrolledProcedure`, `create` on a new owner tier. `provision.ts` was refactored so `provisionOrganization` and the new `createEntity` share one `provisionEntityRows`, rather than two copies of the same four inserts. A second academy gets its own id, slug and public code and touches the first not at all.
- **A real bug caught before it shipped.** `entity.create` was written on `organizationOwnerProcedure`, which runs inside `withScope({ organizationId })`. That transaction leaves `app.academy_id` unset on purpose, so the `academy_profile` and `curriculum_track` inserts would have been refused by the very policies that keep entities apart, and `ctx.baseDb` is `undefined` inside the middleware so there was no escape hatch either. It typechecked and would have failed at runtime on the first click. The fix is `organizationOwnerIdentityProcedure`, the organization-level twin of the `identityProcedure` ADR 92 already established: same authorization, no ambient transaction, base connection. **`entity.list` genuinely does belong on the transaction**, because `entity` carries the organization policy and that GUC is set.
- Root `pnpm typecheck` 17/17; `api`, `db`, `domain`, `validators`, `auth` lint clean.
- Wave 1 item 18: `packages/api/test/entity-authorization.test.ts`, **16 tests, green**, covering every case the item names plus three the item did not. Two organizations, two entities under the first, and five people: an organization owner, a coach with a membership in one entity only, a pending student, a suspended student, and an outsider who owns the other organization. The fixture calls the real `provisionOrganization` and `createEntity` rather than hand-inserting rows, so a provisioning bug fails these tests too.
- What it pins down: a missing header is `BAD_REQUEST`; a foreign entity, an entity that does not exist, and an entity in an organization the caller is not in all answer `FORBIDDEN` with the same message; a coach reaches their own entity and **not the sibling one**; the organization owner reaches an entity they hold no membership in and reads back `role: "owner"`; suspended is refused; pending is admitted to the enrolled tier. `entity.list` gives the owner both entities, the coach only theirs, and never the other organization's.
- **Checked the guard is what makes them pass.** Replacing `if (!entityMembership && !ownsOrganization)` with `if (false)` fails exactly one test, "refuses that same coach on a sibling entity", and restoring it makes all sixteen pass. That one test is the whole point of the wave, so it is worth knowing it is the one holding the line rather than a bystander.
- Fixed while writing the tests: `entity.list`'s doc comment promised that a non-owner sees only their own entities and the code returned every entity of the organization. A comment that lies is worse than none, and Wave 4's `/overview` depends on the filter, so `listEntitiesForUser` was added beside `listEntitiesOf` and the router picks by organization role.
- Wave 1 item 19: `packages/db/test/provision.test.ts`, **12 tests, green**, in three groups. A first run makes all four rows and gives the default entity the organization's own id, public code, time zone and `bjj_academy` type, with the creator an active owner. A **second run creates nothing**, returns an empty `created`, and leaves exactly one of each row. A **half-provisioned** organization, with the entity already there and the other three missing, gets exactly the three missing steps and not the entity. And `createEntity` gives a second academy its own id, its own public code, its own curriculum track and owner membership, without stealing the default flag from the first.
- The retry case is checked by counting rows after the second run, not only by trusting the reported `created`, so a bug that reported "nothing made" while quietly inserting a duplicate would still fail.
- GATE 1 green. `pnpm typecheck` 17/17. `pnpm test --force` **1078 tests across 96 files, all passing**, up from Wave 0's 1040 (domain 533/36, api 364/34, db 146/24, validators 32/1, notifications 3/1). Lint clean on all five packages the wave touched: `db`, `api`, `auth`, `domain`, `validators`.
- The plan's Wave 1 gate conditions, each checked rather than assumed. **Creating a gym always yields one organization and one default BJJ academy**: `provision.test.ts` proves the four rows and `onboarding.test.ts` still passes through the same path. **Retrying after a partial failure creates no duplicates**: the retry group reports an empty `created` and then counts the rows, so a bug that lied about what it made would still fail. **Creating another BJJ academy leaves the first unchanged**: `entity-authorization.test.ts` reads the first entity before and after and compares. **The new procedures authorize one organization and one entity and fail closed**: nine tests in the tiers group, and removing the access guard fails exactly the sibling-entity one.
- Docs: `CHANGELOG.md` has its line, the plan doc's Wave 1 is ticked (23 items), `Current Wave` reads Wave 2 and `Progress` has Wave 1 complete. One commit, `060bbc2`, 42 files. The four unrelated worktree changes (`PLAN.md`, `business-model.md`, `pilot-plan.md`, `revenue-collection.md`) were left alone.

**Wave 1 summary.**

**What landed.** The three tables with RLS on the right GUCs, migrations `0042` and `0043` applied to dev at 44 journal rows. `withScope` replacing `withTenant` everywhere, with `app.organization_id` added beside the renamed-in-TypeScript-only `app.academy_id`. Six procedure tiers plus an organization identity tier, all reading the entity from `x-matops-entity` and refusing before a transaction opens. `provisionOrganization` and `createEntity` sharing one idempotent four-insert core, wired into both the Better Auth hook and `academy.create`. An `entity` router with `list`, `current` and owner-only `create`. The seed building the default entity and 24 entity memberships. 38 new tests.

**What surprised.** Four things. The generated migration **re-added `organization.country`** because `0041` was hand-written with no snapshot, and it **emitted the composite foreign key before the unique index it references**; both would have failed on a database built from `0000`. `drizzle-kit` stamped the new journal `when` **earlier than `0041`**, so `migrate` would have skipped the whole wave while printing success, exactly the trap `CLAUDE.md` documents. And `entity.create` was written on the wrong tier: `organizationOwnerProcedure` runs inside a transaction that leaves `app.academy_id` unset on purpose, so the `academy_profile` and `curriculum_track` inserts would have been refused by the very policies that keep entities apart. It typechecked and would have failed on the first click.

**What is carried forward.** `ctx.membership.memberId` still comes from the Better Auth `member` row while `role` and `status` come from `entity_membership`, because the payment, rank and referral tables key on `member.id` until Wave 3 repoints them; `ctx.entityMembership` is already on the context so Wave 3 needs no new plumbing. Three seeded rows carry Better Auth's default `role = "member"`, and Wave 2 owns whether the entity role list accepts that value or rewrites it at approval. `seedAcademies` in the api test helpers still builds no entities, so each test that needs one calls the real provisioner; Wave 3 should probably move that into the helper. Nothing user-visible changed: both clients still send no header and still use the academy tiers, which is what makes Wave 2 and 3 safe to do in order.

### Wave 2

- Wave 2 item 1: migration `0044` repoints `academy_invite.academy_id` from `organization.id` to `entity.id`, applied to dev, **45 rows**. The old key carried `ON DELETE CASCADE` ("invites die with the gym") and the new one carries none, per the plan's no-cascade rule; teardown and erase already delete invites before the entity, so nothing is orphaned. `resolveInviteToken` now joins `entity` and returns `organizationId` beside the existing fields, reading the name, address, time zone and country off the entity rather than the organization. `academyId` keeps its name because both join screens read it, and it now IS the entity id, which is what Decision 11 says that column means. The journal `when` was stale again (`1788298787568` against `0043`'s `1788998400000`) and was stamped forward.
- **The fixture had to become honest, and that is the interesting part.** `seedAcademies` in `packages/api/test/helpers.ts` built organizations and Better Auth members but no entities, so the moment the invite key pointed at `entity` four tests failed on a foreign key. Rather than hand-inserting an entity row, the helper now calls the **real `provisionOrganization`** and then mirrors the remaining members onto the default entity, so a fixture cannot drift from what `academy.create` actually builds. Its hand-written `curriculum_track` insert is gone: the provisioner makes that row.
- That change then broke the five `membership-lifecycle` purge tests, because `erase.ts` had no idea `entity_membership` existed and `entity_membership.user_id -> user.id` is `NO ACTION`, so deleting the user was refused. Fixed here rather than left for the erase item: `deleteEntityMembership(exec, entityId, userId)` scopes the delete to **one entity**, so erasing someone from the Tuesday mat leaves the Thursday one alone, and `membership.purge` calls it before `deleteMemberRow`. The erase item later in this wave now has less to do and a test to write.
- `pnpm typecheck` 17/17, `db` and `api` lint clean, **`@matops/api` 364 tests green** again.
- Correction to the line above: `@matops/api` lint was red on a now-unused `orgIds` local in `helpers.ts`, left behind when the hand-written `curriculum_track` insert went. Removed; lint clean.
- Wave 2 item 2: `createPendingMembership` now takes `{ organizationId, entityId }` and writes two rows for two jobs. The Better Auth `member` row records only that the person belongs to the **organization** and is **reused untouched when it is already active**, which is the whole point: someone training at one mat who opens a link to a second must not have their first membership reset to pending. The `entity_membership` row is the operational one, created pending with no academy role and the intended role on `invitedRole`. The status returned to the join screen is the **entity's**, because that is what the person is being told about.
- `findAcademyByCode` now reads `entity` rather than `organization` and returns `organizationId` beside `academyId`. A gym's second academy has a code of its own that no organization row carries, so the mobile code search would have found nothing for it. `joinPending`, `membership.join`, `membership.joinByCode` and `dropIn`'s owner-promote path all pass both ids; on the identity tiers the two are the same value for now, and Wave 4 splits them when the client starts sending a header.
- **An existing test caught a real bug I would not have looked for.** Moving the code lookup onto `entity` broke "soft-deletes on the exact phrase and hides the academy from everyone": `softDeleteAcademy` set `organization.deleted_at` and left every entity live, so a closed gym stayed findable by its six-digit code. It now soft-deletes the organization and its entities **in one transaction**. That is a data-loss-shaped bug, not a test-fixture problem, and it existed the moment codes moved.
- New `packages/api/test/entity-join.test.ts`, **4 tests, green**: a join makes exactly one organization membership and one pending entity membership carrying the invited role; a second tap adds no second row; joining a **sibling entity leaves the first membership at `active`/`student` while the new one is `pending`/`member`**; and both entities share the one organization membership. That third test is the plan's Wave 2 gate condition written down.
- `pnpm typecheck` 17/17, `db` and `api` lint clean, `@matops/api` **364 + 4 green**.
- Wave 2 item 3: the move happens in `packages/db/src/membership.ts`, not the router, because all five actions already funnel through four write helpers. `setMemberRoleStatus`, `setMemberStatus`, `setMemberStatusIfNotLastOwner` and `setMemberRoleIfNotLastOwner` now take an `entityId` first and go through one private `writeMembership`, so approve, reject, archive, suspend, restore, remove, promote and setRole all became entity-scoped with no change to their router bodies beyond passing the id.
- **The mirror, stated plainly so the next wave can challenge it.** `entity_membership` is the source of truth; the Better Auth `member` row is written to match and is a mirror. It has to be: the academy procedure tiers still read `member.role` and `member.status`, and **both clients still use those tiers**, so letting the two disagree would show a person one thing and let them do another. Wave 7 drops the two columns and the mirror goes with them. This is the only place the pivot keeps two copies of a fact, and it is one function wide.
- The never-ownerless guard moved with it. `mayChangeEntityMembership` locks **`entity_membership` for the entity** with `FOR UPDATE` and runs the same pure `canRemoveOrDemote`, so the thing being protected is now "this mat is left with no active owner" rather than "this organization is". People are keyed by the user behind each membership, because the caller still names them by `member.id`, which is the id every router and both clients hold.
- New in `entity-join.test.ts`, **9 tests total, green**: approval grants the invited role and stamps `joinedAt` on the entity row, the Better Auth mirror follows, **suspend at one entity leaves the sibling active**, restore is equally narrow, and stepping the last active owner down is refused with `PRECONDITION_FAILED`.
- Checked the scoping is load-bearing: dropping `eq(entityMembership.entityId, ...)` from the update fails exactly the sibling test and nothing else. `pnpm typecheck` 17/17, `db` and `api` lint clean, **api 368, db 146** green.
- Wave 2 item 4: `mayChangeEntityMembership` now runs **two** checks and both must pass. The entity check (from item 3) refuses leaving a mat with no active owner. The organization check runs the same pure rule over the Better Auth `member` rows, locked the same way.
- The organization check is not belt-and-braces, it closes a hole item 3 opened. Because the Better Auth row is written to match the entity one, stepping someone down at one mat also strips their organization role, and an owner of two mats could have demoted themselves at mat A and lost the organization ownership that was their only way into mat B. The entity check alone would have allowed it, because mat B still had an owner on paper.
- **The first two tests I wrote for this were worthless and the mutation check is what said so.** Both went through `membership.setRole`, which on the identity tier always targets `ctx.academyId`, the default entity, where the owner was the last owner anyway. The entity check refused them and the organization check never ran, so disabling it changed nothing. Isolating it needs a demotion at an entity that still has another owner, which no router can express until Wave 4 gives the client a header.
- So the guard is tested where it lives: `packages/db/test/last-owner.test.ts`, **4 tests, green**, calling `setMemberRoleIfNotLastOwner` directly. The fixture builds the case that separates the two rules, a coach who runs the second mat as its owner but is only an instructor of the organization: two owners on that mat, one in the organization. Demoting the organization's owner **at that mat** is refused, nothing is written, and it is allowed once the coach is promoted in the organization. A fourth test covers the other direction, stripping the default entity of its last owner while the organization has spares.
- Both guards are now independently pinned. Disabling the organization check fails two of the four; disabling the entity check fails the fourth; neither disables both.
- Wave 2 item 5: `membership.purge` now removes three things in order and stops at the first one that is still needed. The entity membership always goes, scoped to the one entity (item 1). The Better Auth `member` row only goes once `hasSiblingEntityMemberships` says the last entity membership in that organization has gone, **because that row is what lets the person into the gym's other mats**. The sign-in account only goes when neither a sibling entity nor another organization needs it. Purging someone from mat A while they still train at mat B used to delete their organization membership and their account.
- The identity tiers gained `ctx.organizationId` beside `ctx.academyId`. Today they are the same value, so this is naming rather than behaviour, but the purge call site now says which of the two it means and Wave 4 can split them without touching it.
- Wave 2 item 6: `erase-coverage.test.ts`'s discovery query looked for an `academy_id` column and now looks for `academy_id` **or** `entity_id`, so `entity_membership` and `academy_profile` are in scope. `academy_profile` is exempted in writing (the place's own settings, not member data); `entity_membership` is deleted. **`entity` needed no exemption and getting that wrong was instructive**: it keys on `id`, so the query never finds it, and an exemption for a table the test cannot see is exactly the stale entry the third assertion exists to catch. It failed, and the exemption came out.
- Three tests added to `entity-join.test.ts`, **12 total, green**: a purge takes away the membership of that entity only, keeps the organization membership, and keeps the sign-in account. Both new guards are mutation-checked: erasing `entity_membership` from `erase.ts` fails the coverage test, and removing the `stillHere` condition fails the organization-membership test.
- Wave 2 item 7: the existing member, invite and erase suites needed **no edits**, which is the mirror earning its keep: `member.role` and `member.status` still say what they said, so every assertion about approval, suspension and removal is still true. What was missing was a test for item 1, which shipped without one. Three added to `entity-join.test.ts`, **15 total, green**: a link minted for the second mat resolves to **that** entity and its name, it names the organization above it (the field the join flow needs), and it stops resolving once the gym is closed, which is the `softDeleteAcademy` fix from item 2 checked from the outside.
- GATE 2 green. `pnpm typecheck` 17/17, `pnpm test --force` **1097 tests across 98 files, all passing** (domain 533/36, api 379/35, db 150/25, validators 32/1, notifications 3/1), lint clean on `db`, `api`, `auth`, `domain`, `validators`, and `pnpm db:seed:reset` round-trips on dev after migration `0044`.
- The gate caught something the suite could not: **`pnpm test` passed while `pnpm typecheck` was red**, because vitest does not typecheck and a test was calling `membership.purge` with a `confirm` field its schema has never had. Worth remembering that a green suite is not a green gate.
- The plan's Wave 2 gate conditions. **One user can belong to two entities with different roles or statuses**: `entity-join.test.ts` joins a sibling entity and asserts the first stays `active`/`student` while the new one is `pending`/`member`. **Removing one entity membership does not damage the other**: the purge group asserts the sibling row, the organization membership and the sign-in account all survive.
- Docs: `CHANGELOG.md` line added, the plan doc's Wave 2 ticked (9 items), `Current Wave` reads Wave 3, `Progress` has Wave 2 complete. One commit, `8a89af7`.

**Wave 2 summary.**

**What landed.** Migration `0044` repointing `academy_invite` at `entity`, with no cascade. `resolveInviteToken` and `findAcademyByCode` both reading `entity` and returning the organization beside it. A join writing an organization membership it reuses and an entity membership it creates. All eight status mutations moved onto `entity_membership` through one `writeMembership`, with `member.role`/`member.status` kept as a mirror the academy tiers still read. The never-ownerless guard running at both levels. Erase preserving sibling memberships and the account. 23 new tests.

**What surprised.** Three things, and two were real bugs rather than test friction. **`softDeleteAcademy` left every entity live**, so the moment codes resolved against `entity` a closed gym stayed findable by its six-digit code; it now closes the organization and its entities in one transaction. **`generateAcademyCode`'s sibling problem showed up again** in a different shape: a second academy's code lives only on `entity`, so the mobile code search would have found nothing for it. And **the api test fixture built no entities**, which forced `seedAcademies` onto the real provisioner and then broke five purge tests, because `erase.ts` had never heard of `entity_membership` and the user delete was refused by a foreign key.

**What is carried forward.** The **mirror** is the one place the pivot keeps two copies of a fact, one function wide, and Wave 7 removes it with the two columns. Wave 3 should watch for it when it repoints `member_id` at `entity_membership.id`, because `writeMembership` finds the entity row through the user behind a `member.id` and that indirection goes away once the ids line up. The organization-level guard exists because of the mirror; if the mirror goes and `member.role` stops following the entity role, that check needs rethinking rather than deleting. And `mayChangeEntityMembership` locks both tables in one transaction, entity first then organization, so any future writer must take them in that order.

### Wave 3

- Wave 3 item 1: **18 foreign keys**, `academy_id -> entity.id`, one on every BJJ table, migration `0045`, applied to dev at **46 rows**. None cascades: a check across the whole schema finds 30 `NO ACTION` and 7 `CASCADE`, and all seven are pre-existing Better Auth or `push_token` keys. The stale `// → organization.id (RLS scope)` comments went with the change, because the key now says it in code. Per ADR 124 §8 **no BJJ table gained an `organization_id`**, so there is no composite reference on these; the organization match rides on `entity_membership` alone. `tenant_probe` gets none because it is hand-written in migration `0001` and is a probe, not a product table.
- The migration also **drops `notification_pref`**, dead since v3.8 and still on dev. It carries an `academy_id`, so leaving it would have made the RLS and erase coverage tests answer for a table nobody owns. The journal `when` was stale again and was stamped forward, the fourth time in a row.
- **The foreign keys broke twelve db test files, and that was the point.** Every isolation test inserted a bare `academy_id` with no parent, so it would now be refused by the key rather than by RLS, which is a confusing way to fail. `freshDb()` takes an optional list of academy ids and creates an organization and a default entity for each, defaulting to the two ids nearly every test uses. Five files that use their own ids pass them; three that build their own organization pass `[]`.
- Two real bugs fell out. `seed/run.ts` inserted **`curriculum_track` before the entity it points at**, which only a foreign key could reveal, and `dues-reminder.test.ts` inserted an organization the helper had already made. Neither would have shown up without the key.
- **New item inserted after this one.** `pnpm test` at the root is now flaky: the db suite's hooks time out at random, different tests each run, while the same suite passes every time on its own. One `freshDb` costs 520ms unloaded, so this is not a hang. It is 25 WASM Postgres instances plus four other package suites on one machine. A gate that fails at random is worse than no gate, so this is fixed before the wave goes on.
- **Wave 3 item 1b is BLOCKED after three attempts. `- [!]`. The loop stops here.**
- The symptom: `pnpm test` fails 2 to 4 api tests per run, **always `Test timed out in 30000ms`, never the same tests twice**. The db suite is now stable at 150/150 across five consecutive runs. Every failing test passes in isolation in about 300 milliseconds, so a 30-second timeout is a hundredfold blowup, not a hang.
- What was tried, in order, and what each bought. **`maxWorkers: 4` on the db suite** plus `hookTimeout` 60s: the db suite went from flaky to stable and has stayed stable, so this one earned its place. **`--concurrency=1` on the root `test` script** so turbo runs one package suite at a time, and **`maxWorkers: 4` on the api suite**: neither changed the api failures. **A disk cache of the migrated PGlite database** in `packages/db/test/helpers.ts`, keyed by a hash of the migration files and written through a temp name and an atomic rename: `freshDb` went from **520ms to 335ms**, which is a real improvement worth keeping, and the api failures continued anyway.
- What the evidence says. It is contention, not a deadlock: the same test passes alone, fails in a crowd, and the failing set is random. But capping workers and halving the setup cost did not fix it, so the api suite's per-test cost under load is larger than the setup accounts for. The suspect I did not get to is `seedAcademies`, which many api files call in a `beforeEach` and which now runs the real `provisionOrganization` (one select and four inserts) for every academy in every test, on top of the two extra migrations.
- What to try next, cheapest first. Run the api suite with `--maxWorkers=1` to confirm contention outright (started, killed at ten minutes, inconclusive). Then move `seedAcademies` from `beforeEach` to `beforeAll` in the files that allow it, or make the provisioning inside it conditional. If the cost is really the 46-file migration replay, the cache should have shown it, so measure a single api test's wall clock under load before changing anything else.
- **State of the tree: item 1 is complete and correct, item 1b is not.** Migration `0045` is applied to dev at 46 rows, `notification_pref` is dropped, all 18 keys are `NO ACTION`, `pnpm typecheck` is 17/17, and `db`, `domain`, `validators` and `notifications` are green. Nothing is committed, because the wave gate is nowhere near. The concurrency knobs and the PGlite cache are in the working tree and can be kept or reverted independently; the cache and the db cap are worth keeping on the evidence, the `--concurrency=1` and the api cap are unproven and only slow CI down.
- **Item 1b is unblocked and done. The user was right and I was chasing the wrong thing.**
- Measurement settled it. Booting a harness costs **16ms** (the migration cache had already fixed that); `seedAcademies` costs **284ms**, and of that the provisioner I added is **8ms** while the pre-existing multi-statement `pg.exec` is **271ms**. Four api files rebuilt a harness per test, so **89 tests paid 271ms of seeding each**, about 24 seconds of pure setup. That is what saturated the machine, not the number of workers.
- The fix keeps per-test isolation rather than trading it away. `harness()` now takes the academy spec, seeds once, **dumps the seeded database and reloads that dump** for every later call in the same file. Vitest gives each file its own worker, so the cache is per file. Sharing one database across a file's tests, which is what moving the seed to `beforeAll` would literally mean, was not an option here: these tests create leads, take bookings and purge members, then assert row counts.
- Four files converted to `harness([...])`: `public-surface`, `leads`, `public-booking-api`, `membership-lifecycle`. The other four that call `seedAcademies` already had it in `beforeAll` and were never part of the problem.
- **The three knobs I added on the wrong diagnosis are reverted**: `--concurrency=1` on the root `test` script and `maxWorkers: 4` on both suites. Two full runs with them and two without are all **1097 tests green**, so they bought nothing and only slowed CI. What stays is the `hookTimeout` bump to 60s and the disk-cached migrated database, both of which are justified on their own.
- **`pnpm test` is repeatable again: four consecutive full runs, 1097 tests, zero failures.** The api suite alone runs in 21.6s.
- Wave 3 item 2: **`member_id` now means `entity_membership.id`**, everywhere it is written and everywhere it is read. No migration: the twelve columns across seven tables are already `text`, so this item changes what goes in them and item 4 adds the composite key that enforces it.
- The readers moved in `packages/db/src/membership.ts`. `listMembersOf`, `getMemberById` and `getMemberIdForUser` read `entity_membership` instead of Better Auth `member`, and a new `getAcademyMembership` gives the academy tiers the same shape `getMembership` gave them, sourced from the entity row. `getMembership` itself is untouched and still answers the organization question, because `resolveOrganization` needs exactly that.
- The writers moved with them. `writeMembership` no longer looks the person up by `member.id` and then finds their entity row through the user behind it: it updates `entity_membership` **by its own id**, gets the user and organization back from the `RETURNING`, and writes the Better Auth mirror through those. That indirection was the thing Wave 2's summary said to watch for, and it is gone. `mayChangeEntityMembership` names its target the same way.
- Three things fell out that were not on the list. **`deleteMemberRow` took the wrong id**: called with what is now an entity membership id, it would have deleted nothing and left the Better Auth row behind after a purge, so it takes the organization and the user instead. **`dues-reminder.ts` joined `member`** to decide who is still training, which after the cutover matches no row, so a gym would have billed nobody; it joins `entity_membership` now, and while it was open its academy name and soft-delete check moved from `organization` to `entity`, which is also what stops a second academy's reminders going out under the first one's name. **`academy.setActive` was using the entity guard for an organization question** and now checks `getMembership` directly.
- `setMemberRole` is deleted. It had no callers and, under the new meaning of `memberId`, it would have written the wrong table.
- Both seeds follow. `seedMembershipId` in the seed registry gives the demo academy's dues, claims, ranks, notes and referrals the entity membership id, and the `fill` command now creates `entity_membership` rows for its fakes at all, which it never did: without them a filled academy would have shown an empty roster. Its teardown removes them before the member rows.
- The api test fixture changed shape. `seedAcademies` writes every membership itself with a predictable id, `emem_<academy>_<user>`, and calls the provisioner without an owner, because a test that seeds dues has to be able to name the membership they belong to. Every owner in every spec is `active`, so the rows are the same ones the provisioner made.
- Verified by `packages/db/test/member-id-source.test.ts`, six tests: the listed id is the entity one, an organization member with no membership of this entity is not on the roster, one person has a different id at each of two entities, a Better Auth id reads back as null, and a closed academy is not a membership. `pnpm typecheck` 17/17; `db` and `api` lint clean.
- Wave 3 item 3: **no policy and no index had to be replaced, and here is the proof.** The pivot kept the column name `academy_id` and the GUC name `app.academy_id` on purpose (ADR 124 §3), so the value in both changed meaning while the SQL stayed word for word correct. All 22 policies read the right GUC: 19 BJJ tables plus `academy_profile` match exactly on `app.academy_id`, and `entity` and `entity_membership` match on `app.organization_id` because they are organization-shared and hold no product data. Every index on a BJJ table is `(academy_id, ...)`, which is now `(entity_id, ...)`.
- What made the old policies into entity policies was item 1's foreign key, not a rewrite. So the deliverable here is the guarantee, added to `rls-coverage.test.ts`: **every table carrying `academy_id` has a foreign key from it into `entity`**, with `tenant_probe` the one named exception, because it is hand-written in migration `0001` to prove the seam bites and is given no parent on purpose. A table added later without the key fails this test by name.
- The second test is the organization match. ADR 124 §8 says the match rides on exactly one row, the one that joins two parents that could disagree, so the test asserts `entity_membership_entity_same_org` is still `FOREIGN KEY (organization_id, entity_id) REFERENCES entity(organization_id, id)`. That is what stops a membership pointing at a sibling organization's entity, and it is the only place the organization needs naming, because no BJJ table carries an `organization_id` to disagree with.
- 10 tests in the file, all green. No migration, no schema change.
- Wave 3 item 4: **ten composite foreign keys**, `(academy_id, member_id) -> entity_membership(entity_id, id)`, migration `0046_rows_name_their_membership`. This is what stops a dues row at one mat naming a membership at another. Nothing cascades, for the same reason as item 1: `erase.ts` deletes in an explicit order and `erase-coverage.test.ts` proves it, and a cascade would hide a table from that proof.
- **ADR 124 §8 says twelve columns across seven tables. It is ten.** `member_dues`, `payment_claim`, `member_rank`, `rank_promotion` and `member_note` carry one each, `member_referral` two and `member_referral_audit` three. The seven tables are right; the count is not. The ADR is append-only, so the number is corrected here rather than in it.
- The three nullable referrer columns take a key too. Postgres skips a composite key when any of its columns is null, which is exactly the wanted behaviour: a cleared referral has no referrer to check, and a named one must belong to this mat.
- The migration was generated, not hand-written, so the journal `when` was stale again, the fifth time in this epic. It was stamped one day past `0045`, and the file renamed from the generator's `0046_gorgeous_terrax`.
- Verified in `member-id-source.test.ts`, now 8 tests: a note naming a membership at the sibling entity is refused by name, and the same note at the membership's own entity is accepted. Applying `0046` to dev belongs to the wave's last item, with the wipe and reseed.
- Wave 3 item 5: **every router now runs at one named entity, and not one call site had to change.** The four tenant tiers keep their names, `enrolledProcedure`, `memberProcedure`, `staffProcedure` and `ownerProcedure`, and are now built on `enforceEntity`. The `entity*Procedure` duplicates Wave 1 added are gone, because two names for one tier is how they drift. That moves all 145 procedures in 21 routers at once: schedule, curriculum, attendance, bookings, ranks, notes, referrals, notifications, dues, leads and settings.
- `resolveActiveMembership` and `enforceTenant` are deleted. Nothing reads `session.activeOrganizationId` to pick a place any more: the session names the organization, the `x-matops-entity` header names the entity, and a request that names none is a `BAD_REQUEST` before any transaction opens.
- The identity tiers moved with them. `ownerIdentityProcedure` and `staffIdentityProcedure` resolve through `resolveEntity` too, so `ctx.withScope` opens a transaction at the named entity rather than at the organization dressed as one, and they now carry `entityId`, `entity` and `entityMembership` beside `academyId`.
- The api fixture names the entity by default: `harness.as(user, academy)` sets `x-matops-entity` to the academy, because in these fixtures the academy IS the organization's default entity. A test that wants a request naming no entity passes a bare `new Headers()`, which is what the one refusal test does. That is why 350 tests needed no edit.
- **The composite keys from item 4 caught a real bug on their first run.** A permanent erase cleared the referral credit on the live row but left the erased person's id in **other students' audit history**, as `old_referrer_member_id` or `new_referrer_member_id`. Before the key that was a dangling string nobody noticed; now it refuses the delete. `eraseMemberData` nulls both columns and reports `referral_history_cleared`, matching what it already did for the live referral: the row belongs to the student it is about, so the credit is forgotten rather than the history deleted. Without this, an owner answering a data-deletion request would have got a half-finished erase.
- Six test fixtures were naming people by Better Auth `member.id` and had to move to the entity membership id: `entity-join` (five calls), `membership-lifecycle` (its status probe and its pending reset), `tenant-rollback` (a made-up probe id), `booking-gate` (seven `UPDATE "member"` statements that had quietly become no-ops) and `tenant-seam` (the refusal message is now "No active organization selected").
- `pnpm -F @matops/api test` is **379 passed, 35 files**. `pnpm typecheck` 17/17, `api` and `db` lint clean.
- Wave 3 item 6: **the paths with no header now resolve the entity themselves**, and the wave's gate condition that no product query reads academy settings from `organization` is met.
- The public booking API moved wholesale. `public-api.ts` reads the name, time zone, country, address, map link and six-digit code off `entity`, and the master switch, publishable key and origin allowlist off `academy_profile`. That is not bookkeeping: a gym with two mats now publishes **two booking links with two keys**, because each mat is its own place with its own schedule. The key resolves the entity, and every later read is pinned to it.
- The two crons. The class-reminder sweep joined `organization` to skip a closed gym and now joins `entity`, which is the row that actually gets closed. `runMaterializationSweep` needed nothing: it walks `class_template` by `academy_id` on the base connection, and item 1's foreign key is what makes that an entity id. The dues sweep moved in item 2.
- The other readers that were still on `organization`: `getAcademySettings` and `updateAcademySettings` (the settings write now splits, the place fields to `entity` and the curriculum switch to `academy_profile`), `academyContext` in `packages/api` (time zone, country and the curriculum switch on every scoped request), `getAcademyPublic` behind the drop-in form, and `getAcademyCode`.
- `listMembershipsForUser`, the switcher lens, lists **entity memberships** now, with each entity's own name and address. A gym with two mats shows two. `academy.setActive` follows: the caller names an entity, the entity's organization goes on the session, and the entity id is what Wave 4 will send as `x-matops-entity`.
- What stays on `organization` on purpose: `provisionOrganization` reads the old columns to copy them onto a new entity, which is the whole point of the copy and goes when Wave 7 drops them.
- Four test fixtures were writing settings to the wrong table and had to follow: the public booking key and origins, the curriculum switch, and the reminder sweep's closed academy. `pnpm -F @matops/api test` is 379 passed. `pnpm typecheck` 17/17, `api` and `db` lint clean.
- Wave 3 item 7: the fixtures caught up with the schema. `seedEntities` in the db test helper now also makes each academy an `academy_profile`, because the settings reads inner-join it and a fixture without one would silently return nothing. A new `seedMemberships(pg, entityId, ids)` gives an entity memberships with the exact ids a test wants to key rows by, each on its own user so the one-per-user index never bites.
- Six db fixtures made product rows up out of thin air and now make a membership first: `payments-rls`, `rank-rls`, `referrals-rls`, `erase-grants`, `dues-reminder` and `seed-data`. The dues sweep fixture had to go further and give each of its five statuses an `entity_membership`, because the sweep decides who is still training from that row now, not from the Better Auth one.
- `erase-grants` turned up a sharp edge in the new helper: `ON CONFLICT (id) DO NOTHING` means asking for the same membership id at a second entity quietly does nothing, and the row that pointed at it then failed. The fixture uses a separate id per academy. Worth remembering: a membership id belongs to one entity.
- `last-owner.test.ts` was naming people by `member.id` and looks the real membership ids up now, at both the default entity and the second one, so the two-level check is tested against the ids it actually reads.
- **A new test for the thing this whole pivot is about**: `rls.test.ts` gains three tests over **two entities of one organization**. One mat sees its own rows and not its sibling's, a write aimed at the sibling is refused by `WITH CHECK`, and the same transaction can still read both `entity` rows, which is what makes the overview possible. Every RLS test before this used two separate organizations, so nothing proved that a shared owner does not mean shared data.
- `pnpm test` at the root is green: **db 160, api 379**, five package suites, no failures.
- Wave 3 item 8: **dev is wiped, migrated and reseeded. 47 rows in `drizzle.__drizzle_migrations`, which is `0000` to `0046`.**
- The order mattered and the first attempt was wrong. Running `migrate` against the old dev data failed: `member_dues.member_id` and its siblings still held Better Auth ids, so the composite keys were refused. The wipe has to come first. That is exactly the hard cutover the plan calls for on an empty production database, and it is worth writing down: `0046` is only appliable to a database whose product rows already name entity memberships.
- **`wipe-academies.sql` was two waves out of date** and would have failed at `DELETE FROM "organization"`, because `entity` now references it. It deletes children first in the order the keys allow, and picked up eight tables it never knew about: `drop_in_visit`, `notification`, the three curriculum tables, `entity_membership`, `academy_profile` and `entity`.
- Verified live: all ten composite keys are present by name; `pnpm -F @matops/db verify` reports 47 of 47 migrations, the `matops_app` role, and RLS with a policy and four grants on all 19 reachable tables, with `academy_invite` the one intended exception; the reseed made 1 organization, 1 entity, 1 academy profile, 24 memberships and 648 classes; **all 15 dues rows join to an entity membership at their own entity**, and no class carries an `academy_id` without an entity.
- **GATE 3 is green.** `pnpm typecheck` 17/17. `pnpm -F <pkg> lint` clean on `db`, `api`, `domain` and `validators`. `pnpm test --force` at the root: **1110 tests across 99 files, no failures** (domain 533, api 379, db 163, validators 32, notifications 3), up from 1097.
- The plan's Wave 3 gate conditions, each checked by name. **No product query reads academy settings from `organization`**: a grep over the nine moved columns leaves three hits, and all three are correct. `provisionOrganization` reads them to copy onto a new entity, which is the point of the copy; `generateAcademyCode` checks both tables because both hand out six-digit codes while the pivot is in flight; and the `fill` command's code lookup moved to `entity` during this gate, because it was the one that was actually wrong. **Exact entity RLS protects every entity table**: 22 policies, 19 BJJ tables plus `academy_profile` on `app.academy_id` and the two organization-shared tables on `app.organization_id`, with `rls-coverage.test.ts` asserting the shape and `rls.test.ts` proving two mats of one owner cannot see each other. **Existing BJJ behaviour is unchanged through the entity procedures**: 379 api tests over the real routers. **Public booking and check-in resolve the intended entity**: the key and the code both resolve `entity`, and `public-booking-api.test.ts` covers the switched-off gym, the origin allowlist and the sibling academy's classes.
- Docs: `CHANGELOG.md` line added, the plan doc's Wave 3 ticked (11 items), its status set to done, `Current Wave` reads Wave 4, `Progress` has Wave 3 complete. One commit on `dev`, `9ccb2f7`. Nothing pushed.

**Wave 3 summary.**

**What landed.** `member_id` means `entity_membership.id` everywhere, with ten composite foreign keys holding it. Migration `0046`, applied to dev at 47 rows after a wipe. Every tenant tier built on `enforceEntity`, so the whole product runs at one named entity and the academy tier is deleted. Every academy setting read off `entity` and `academy_profile` instead of `organization`, including the public booking API, both crons and the switcher. Both seeds, the wipe script and 15 test files brought along. 12 new tests.

**What surprised.** The composite keys earned their place on the first run by catching a bug nobody would have found by reading: **a permanent erase left the erased person's id in other students' referral history**, as `old_referrer_member_id` and `new_referrer_member_id`. Before the key that was a dangling string; now it refuses the delete, and an owner answering a data-deletion request would have got a half-finished erase. Second surprise: **`migrate` cannot be run before the wipe.** The old dev rows named Better Auth ids, so `0046` was refused, silently, with an exit code and no message. Third: **`wipe-academies.sql` was two waves out of date** and would have failed on `DELETE FROM "organization"`. Fourth, a pleasant one: moving 145 procedures needed **zero call-site edits**, because keeping the tier names and rebuilding them on `enforceEntity` moves them all at once, and the api fixture naming the entity by default kept 350 tests untouched.

**What is carried forward.** **Both clients are down.** Every tenant tier refuses a request with no `x-matops-entity` header, and neither the web nor the mobile client sends one until Waves 4 and 6. That is the hard cutover the plan chose, and `dev` must not merge to `main` before Wave 7. Wave 4 should send the header from the route segment first, before anything else, because nothing else in that wave can be checked until it does. Two smaller notes: a membership id belongs to one entity, so a fixture asking for the same id at two entities gets one row and a confusing failure; and `getAcademySettings` and friends now inner-join `academy_profile`, so any fixture that makes an entity must make its profile too, which `seedEntities` and `provisionOrganization` both do.

### Wave 4

- Wave 4 item 1: `academy.tsx` is now `entity.tsx`, and it carries two contexts instead of one. `AcademyProvider` / `useAcademy` became **`EntityProvider` / `useEntity`** across 23 files and 29 call sites, a mechanical rename that makes the code say what the model already means. Wave 7 lists `AcademyProvider` for removal, so replacing it is this wave's job, not a later one.
- The new one is **`OrganizationProvider` / `useOrganization`**, holding what the selector and the overview need and what no entity read can answer: the places this person may open, and whether they may add another. `entity.list` returns `{ organizationId, canAdd, entities }` now instead of a bare array, because "may I add an academy" is an organization fact and the caller should not have to ask a second question to get it.
- The shell reads it in place of `academy.memberships`, and the `(app)` layout prefetches it, so the switcher lists **entities** rather than organizations. Three assertions in `entity-authorization.test.ts` follow the new shape.
- `pnpm -F @matops/nextjs typecheck` and `lint` both pass. The routes have not moved yet, so nothing renders differently.
- Wave 4 item 2: both tRPC clients name the entity, and they do it from different places because the two renders know different things. In the browser, `httpBatchLink`'s `headers()` runs per request, so it reads `window.location.pathname` through a new `entityFromPath`; capturing the id in a provider would go stale the moment a client-side navigation moved between two academies without remounting the client.
- A server component cannot read the browser's header, and Next gives an RSC no pathname. So `server.tsx` gains a `cache()`-scoped holder and `setRequestEntity(id)`, which the entity layout calls before any child prefetches. **No middleware**: a five-line holder does the same job for every render in the request, costs nothing, and lives beside the code that owns the id.
- `academy.current` now prefers `ctx.requestedEntityId` over the session's active organization, which is what makes **two browser tabs show two academies**. It stays a `protectedProcedure` on purpose: the shell calls it to decide whether there is an academy to open at all, and an entity tier would answer that question with a crash instead of a gate.
- Wave 4 items 3, 4 and 5, done together because none of them stands up alone: a route with no shell shows nothing, and a shell with no route table shows everything. **Every `(app)` screen now lives under `/entities/[entityId]`** — dashboard, schedule, members, coaches, referrals, payments, settings, training, attendance, notifications, class detail and profile. Above them sit `/overview` and a `/profile` that only forwards.
- The URL is the selection now, and that is the whole point: **two tabs can show two academies, a reload keeps the one you were on, and the link is shareable.** `academy.setActive` is no longer how you switch; a link is. `AcademyGate` and `AcademySwitcher` are deleted, four months of "which academy is active" living in the session with them.
- Where each piece went. `(app)/layout.tsx` gates on the session and resolves the organization once, for entity screens and the overview alike. `(app)/entities/[entityId]/layout.tsx` calls `setRequestEntity` and renders the shell. `(app)/page.tsx` is the post-login gate: one academy redirects into it, several go to `/overview`, none shows Join by code.
- The shell builds every link through `entityHref(entityId, path)` and matches the current tab on `pathWithinEntity(pathname)`, so the nav config still names `/schedule` and never the entity. A new `useEntityHref()` gives the same thing to the ten links inside screens, so nothing threads an id down the tree.
- **`ROUTE_ACCESS` and `canVisit` moved into `packages/domain`.** They are pure rules about who may open what, they were the only untested part of the shell, and `@matops/nextjs` has no test suite. Now they run in the domain suite with the rest of the rules, which is what the delivery rulebook asks for. `canVisit` takes a full path or an entity-relative one and answers the same, and it refuses **every** screen for a place that is not a BJJ academy, which is the gate condition about BJJ navigation: every screen under an entity is a BJJ screen, so there is no list to keep in step.
- The selector is a set of **links**, not a mutation, with the overview above them and an owner-only **Add academy** below. `entity.create` takes only `bjj_academy`, refused three times over: the dialog offers nothing else, the schema rejects the rest, and the table's check constraint rejects it again.
- **A deviation from the plan, on purpose.** Its target-route list keeps `/profile` at the organization level "because name and phone belong to the user". The screen shows the academy name, its address and map link, the person's role, their join date and their belt, all of which belong to one mat. So the screen moved under the entity and `/profile` became a redirect to the first academy the person can open, which keeps every older link working. A top-level profile holding only name and phone is a different screen and would be its own slice.
- Two things the build taught me. The `(app)` layout's session read has to sit **inside a `<Suspense>`**, or Cache Components (ADR 91) fails the build with "uncached data accessed outside of Suspense" — the old layout had that boundary and the rewrite lost it. And a server component that only redirects must `return redirect(...)`, or its type is `Promise<void>` and it is not a valid JSX element.
- 12 tests in `packages/domain/test/entity-routes.test.ts`. `next build` passes and prints the new route tree; `pnpm typecheck` 17/17; `nextjs` and `domain` lint clean.
- Wave 4 item 6, and it found the wave's one real bug. **`createContext` in `server.tsx` was `cache()`d, so the entity was frozen at the first tRPC call of the request.** The `(app)` layout prefetches the organization before the entity layout runs, so that first call had no entity, and every prefetch under the entity would have inherited a context naming none: a `BAD_REQUEST` on the server for every screen, with the browser then refetching and looking merely slow. The session read stays cached, since it is the expensive one; the entity is read per operation.
- The rest of item 6 was checking rather than changing. Prefetch: every page still calls `currentAcademy()` and `prefetch()`, now inside the entity's request. Loading: every moved route kept its `loading.tsx`, and the entity segment has its own. Mobile tabs: the bar builds its links through the same `entityHref`, so the tab bar, the More menu and the header bell all follow. Deep links: `/join/<token>`, `/checkin/<id>` and `/book/<code>` were never under `(app)` and are untouched, and the PWA manifest's `start_url` is `/`, which now redirects into the academy. Invalidation: 44 call sites key on the tRPC path, which did not change.
- Item 7: the tests are the 12 in `packages/domain/test/entity-routes.test.ts` plus four new ones in `entity-authorization.test.ts`, which is where the gate's first condition is actually provable. **Two tabs of one session get two different academies**: the same user, the same active organization, two different `x-matops-entity` headers, two different `academy.current` answers. A request naming no entity still falls back to the session's academy, so the mobile client keeps working until Wave 6. A header naming an academy the caller cannot open answers null, which is the readable "no access" the shell draws rather than a crash.
- **GATE 4 is green.** `pnpm typecheck` 17/17. `pnpm -F <pkg> lint` clean on `nextjs`, `domain`, `api` and `db`. `next build` compiles and prerenders all 30 pages, printing the new route tree. `pnpm test --force`: **1125 tests, no failures** (domain 545, api 382, db 163, validators 32, notifications 3), up from 1110.
- The plan's Wave 4 gate conditions, each checked by name. **Two browser tabs can display different entities**: proved in `entity-authorization.test.ts`, one session and one active organization answering with two different academies for two different headers. **The entity URL is shareable and reload-safe**: the id lives only in the path, the layout resolves it from `params` on every render, and nothing is stored in the session. **BJJ navigation appears only for a BJJ entity**: `canVisit` refuses every entity screen for another type, tested. **The organization overview is reachable without selecting an entity**: `/overview` sits outside the entity segment and reads `entity.list`, which is organization-scoped and needs no header.
- Docs: `CHANGELOG.md` line added, the plan doc's Wave 4 ticked (10 items), its status set to done, `Current Wave` reads Wave 5, `Progress` has Wave 4 complete. One commit on `dev`, `ccd1772`. Nothing pushed.

**Wave 4 summary.**

**What landed.** Twelve screens moved under `/entities/[entityId]`, with `/overview` and a forwarding `/profile` above them. Both tRPC clients name the entity, from the pathname in the browser and from a request-scoped holder on the server. `AcademyProvider` became `EntityProvider`, `OrganizationProvider` joined it, and `entity.list` answers both questions the shell has. `ROUTE_ACCESS` and `canVisit` moved into `packages/domain` and are tested for the first time. `AcademyGate` and `AcademySwitcher` are deleted. 16 new tests.

**What surprised.** **The cached context.** `createContext` was `cache()`d for the request, so the entity was fixed by whichever tRPC call ran first, and that call is the organization prefetch in a layout that runs before any entity is known. Every entity screen would have server-rendered against no entity, then quietly refetched from the browser and looked slow rather than broken. Second, the **Suspense boundary**: rewriting the `(app)` layout lost the one the old one had, and Cache Components failed the build outright, which is the good outcome. Third, **`/profile` could not stay where the plan put it** — the screen is almost entirely made of facts about one mat.

**What is carried forward.** **Mobile is still down**, and Wave 6 is what fixes it. Note for that wave: `academy.current` deliberately falls back to the session's active organization when no header arrives, which is the only reason the Expo app has not been broken twice over; when mobile starts sending the header, that fallback becomes dead weight and Wave 7 should take it out. Also `academy.setActive` still exists and still sets the Better Auth active organization from an entity id: the web no longer calls it, but the two mobile call sites do.
