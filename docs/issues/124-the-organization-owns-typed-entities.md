# 124 — The organization owns typed entities

**Status:** accepted · **Date:** 2026-09-01 · **Area:** `packages/db` (new tables, new migrations, RLS), `packages/api` (procedure tiers), `packages/auth` (provisioning), `apps/nextjs` (routes and shell), `apps/expo`. **Supersedes:** [18](18-multi-academy-ux.md) §"no model change". **Relates to:** [12](12-tenant-isolation-mechanism.md) (the RLS seam), [92](92-identity-writes-leave-the-tenant-transaction.md), [115](115-public-booking-api-and-the-lead-path.md).

The plan is [organization-entity-pivot.md](../organization-entity-pivot.md). The
run file is [organization-entity-pivot-epic.md](../organization-entity-pivot-epic.md).
This note fixes the names, the invariants and the migration matrix before any
schema code is written.

## Why

Why now: Alma beta, the seed academy, stands in for a gym opening a second
location. Its owner needs one login for both mats, staff and students who can
belong to either or both, and one overview that shows pending actions, dues and
attendance for each location and the totals. Answered 2026-09-01.

ADR 18 deferred cross-academy views and said the data model needed no change.
That claim does not hold. Per-entity settings, per-entity memberships and a
shared owner all need new tables.

## 1. The three words

**Organization.** The Better Auth `organization` row. It is the billing party,
the owner group, and the active scope in the session. It is not a place. After
this pivot it holds a name, a slug, a logo and metadata, and nothing else.

**Entity.** One operational facility with a type. The only type this pivot
implements is `bjj_academy`. An entity holds the things a place has: a time
zone, a country, an address, a map link, a public code, a status. Every product
row belongs to exactly one entity.

**Entity membership.** One person's access to one entity, with a role and a
status. A user can hold several entity memberships in one organization with
different roles. Better Auth `member` keeps only the organization relationship
and the organization role.

**Default academy creation.** Creating a gym creates one organization and one
`bjj_academy` entity in the same idempotent step. The first entity of an
organization is its default. In the seed the default entity id equals the
organization id, so QR posters and check-in links printed against dev keep
working.

## 2. The client names the entity, the session never does

Every request that touches entity data carries `x-matops-entity`. Web sets it
from the `[entityId]` route segment. Mobile sets it from the entity the student
picked, held in secure-store. `createTRPCContext` reads it next to
`x-trpc-source` and puts it on `ctx.requestedEntityId`.

The entity procedure fails closed before any transaction opens:

- No header: `BAD_REQUEST`.
- An entity outside the active organization, or one the caller has no live
  membership for: `FORBIDDEN`.

An active organization owner reaches every entity of that organization. Everyone
else needs an active `entity_membership`. Public and cron routes resolve their
own entity and never read the header.

The session picking the entity was the old model and it is what makes two
browser tabs impossible. The header keeps the URL the single source of truth.

## 3. Two GUCs, exact entity RLS

The GUC name `app.academy_id` stays and now holds an entity id. Only the
TypeScript constant and the context field are renamed. `app.organization_id` is
added.

| Transaction        | `app.organization_id` | `app.academy_id` |
| ------------------ | --------------------- | ---------------- |
| Organization scope | set                   | not set          |
| Entity scope       | set                   | set              |

`withScope({ organizationId, entityId? })` in `packages/db/src/tenant.ts`
replaces `withTenant` and sets one or both in the single `set_config` round trip
ADR 81 established.

Every entity-table policy keeps exact matching:
`academy_id = current_setting('app.academy_id', true)`. There is no mode that
reads every entity of an organization at once. The organization dashboard
authorizes the owner, enumerates entities, and runs one entity-scoped read per
entity, combining on the server.

An entity-table policy never reads `app.organization_id` on its own. An
organization-shared table matches on `app.organization_id` only, so a read
inside an entity transaction can still join to it.

## 4. Inventory: tables carrying `academy_id`

Read from the dev Neon branch on 2026-09-01. 21 tables carry `academy_id`. 20 of
them have RLS on with one isolation policy each, all the same shape
`academy_id = current_setting('app.academy_id', true)`.

| Table                       | RLS today           | After the pivot                                       |
| --------------------------- | ------------------- | ----------------------------------------------------- |
| `class`                     | on                  | entity-scoped                                         |
| `class_participation`       | on                  | entity-scoped                                         |
| `class_template`            | on                  | entity-scoped                                         |
| `curriculum_block`          | on                  | entity-scoped                                         |
| `curriculum_block_template` | on                  | entity-scoped                                         |
| `curriculum_track`          | on                  | entity-scoped                                         |
| `drop_in`                   | on                  | entity-scoped                                         |
| `drop_in_visit`             | on                  | entity-scoped                                         |
| `member_dues`               | on                  | entity-scoped                                         |
| `member_note`               | on                  | entity-scoped                                         |
| `member_rank`               | on                  | entity-scoped                                         |
| `member_referral`           | on                  | entity-scoped                                         |
| `member_referral_audit`     | on                  | entity-scoped                                         |
| `membership_plan`           | on                  | entity-scoped                                         |
| `notification`              | on                  | entity-scoped                                         |
| `payment_claim`             | on                  | entity-scoped                                         |
| `payment_settings`          | on                  | entity-scoped, `academy_id` stays the primary key     |
| `rank_promotion`            | on                  | entity-scoped                                         |
| `tenant_probe`              | on                  | entity-scoped, the `seed:health` probe row            |
| `notification_pref`         | on                  | **dropped**. Dead since v3.8 and still present on dev |
| `academy_invite`            | **off, on purpose** | entity-scoped by column, RLS stays off                |

`academy_invite` keeps no policy. The join screen resolves a token with no
session and no active entity, so it must read on the base connection. Owner-side
reads filter by entity id explicitly. That reasoning is unchanged by this pivot.

New tables and their scope:

| Table               | Scope               | Policy match                                                     |
| ------------------- | ------------------- | ---------------------------------------------------------------- |
| `entity`            | organization-shared | `organization_id = current_setting('app.organization_id', true)` |
| `entity_membership` | organization-shared | `organization_id = current_setting('app.organization_id', true)` |
| `academy_profile`   | entity-scoped       | `entity_id = current_setting('app.academy_id', true)`            |

`entity` and `entity_membership` are organization-shared so the overview can
enumerate entities and count people in one organization transaction, and so an
entity transaction can still join to them. Neither carries product data.
`academy_profile` holds per-academy settings and stays exact.

Better Auth tables (`user`, `session`, `account`, `verification`,
`organization`, `member`, `invitation`) and `push_token` and `_health` carry no
`academy_id` and no policy. That does not change.

## 5. Inventory: public identifiers

| Identifier               | Today                                 | After the pivot                                      |
| ------------------------ | ------------------------------------- | ---------------------------------------------------- |
| 6-digit join code        | `organization.public_code`, unique    | `entity.public_code`, unique across all entities     |
| Public booking key       | `organization.public_api_key`, unique | `academy_profile.public_api_key`                     |
| Allowed origins          | `organization.public_api_origins`     | `academy_profile.public_api_origins`                 |
| Invite link token        | `academy_invite.token`, unique        | unchanged, resolves to an organization and an entity |
| Check-in and class links | `class.id`                            | unchanged, the class names its entity                |
| Visitor cancel link      | `drop_in_visit.cancel_token`          | unchanged                                            |
| Booking page             | `/book/<public code>`                 | resolves an entity, not an organization              |

`organization.slug` stays on the organization. `entity.slug` is new and unique
per organization.

## 6. Inventory: erase and seed registries

`packages/db/src/erase.ts` deletes from 9 tables in an explicit order:
`class_participation`, `payment_claim`, `member_referral_audit`,
`member_referral`, `member_dues`, `rank_promotion`, `member_rank`,
`member_note`, `notification`, then the Better Auth `member` row, then `user`
when nothing survives that needs it.

`packages/db/test/erase-coverage.test.ts` reads every table with an `academy_id`
column out of the live schema and requires each one to be either deleted in
`erase.ts` or listed in `NOT_MEMBER_DATA` with a written reason. 11 tables are
exempt today: `class`, `class_template`, `membership_plan`, `payment_settings`,
`drop_in`, `drop_in_visit`, `curriculum_track`, `curriculum_block_template`,
`curriculum_block`, `academy_invite`, `tenant_probe`.

That test keeps working after the pivot because it reads the schema, not a list.
`entity_membership` must be added to `erase.ts` and `academy_profile` and
`entity` must be added to `NOT_MEMBER_DATA`, since neither is member data. The
test's column filter must widen to catch the new tables, which key on
`entity_id` rather than `academy_id`.

`packages/db/src/seed/registry.ts` holds the whole seed contract: `SEED_MARKER`
(`seed_`), `SEED_ACADEMY` (`seed_org_alma`, code `990001`), `seedAcademyIds` as
the teardown key, `seedUserId`, `seedMemberId`, `isSeedId`,
`assertSeedableTarget`, `resolveOwnerEmail`. Teardown deletes every row whose
`academy_id` is a seed academy id. Because the default entity id equals the
organization id, that teardown key keeps working unchanged. `seedMemberId` gains
a sibling for entity membership ids.

## 7. Inventory: callers of the tenant seam

Counted on 2026-09-01 across `apps/` and `packages/`, excluding `node_modules`
and build output.

| Symbol                 | Hits | Files | Where the weight sits                                                                    |
| ---------------------- | ---- | ----- | ---------------------------------------------------------------------------------------- |
| `ctx.academyId`        | 63   | 19    | `router/academy.ts` 10, `router/membership.ts` 9, `router/payments.ts` 8, `members.ts` 5 |
| `useAcademy`           | 53   | 24    | every `apps/nextjs/src/app/_components/*-screen.tsx`, `share-links-dialog.tsx` 5         |
| `withTenant`           | 28   | 13    | `packages/api/src/trpc.ts` 8, `packages/db/test/tenant.test.ts` 5                        |
| `activeOrganizationId` | 9    | 6     | `packages/api/src/trpc.ts` 4                                                             |
| `AcademyProvider`      | 4    | 2     | `app-shell.tsx` 3, `academy.tsx` 1                                                       |

`ctx.academyId` keeps its name where it means "the BJJ academy this row belongs
to". Renaming the column and the GUC is a follow-up slice, not this pivot: 818
hits across 131 files.

## 8. The migration matrix

**No BJJ table gains `organization_id`.** The foreign key
`academy_id -> entity.id` already proves the row belongs to exactly one entity,
and `entity.organization_id` proves that entity belongs to exactly one
organization. A copy of the organization id on 20 product tables would add 20
columns, 20 indexes and 20 ways to drift, and buy nothing: Decision 14 says the
organization dashboard reads one entity at a time, so no product query filters
by organization without an entity.

The organization match is carried where a row joins two parents that could
disagree:

- `entity_membership(organization_id, entity_id)` references
  `entity(organization_id, id)`. This is what stops a membership pointing at a
  sibling organization's entity.
- Every `member_id` column below gets a composite reference
  `(academy_id, member_id) -> entity_membership(entity_id, id)`. This is what
  stops a dues row in entity A naming a membership in entity B.

Required unique constraints, all needed as foreign-key targets:

- `entity(organization_id, id)`
- `entity(organization_id, slug)`
- `entity(public_code)`
- `entity_membership(entity_id, user_id)`
- `entity_membership(entity_id, id)`
- one non-deleted default entity per organization, a partial unique index
- `member(organization_id, user_id)` on the Better Auth table, missing today

`member_id` columns that move from Better Auth `member.id` to
`entity_membership.id`, 12 columns across 7 tables:

| Table                   | Columns                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `member_dues`           | `member_id`                                                             |
| `payment_claim`         | `member_id`                                                             |
| `member_rank`           | `member_id`                                                             |
| `rank_promotion`        | `member_id`                                                             |
| `member_note`           | `member_id`                                                             |
| `member_referral`       | `student_member_id`, `referrer_member_id`                               |
| `member_referral_audit` | `student_member_id`, `old_referrer_member_id`, `new_referrer_member_id` |

Columns that keep pointing at `user.id` and do not move, because they name a
person rather than a membership: `class.instructor_id`,
`class_template.instructor_id`, `class_participation.student_id`,
`class_participation.marked_by`, `drop_in_visit.marked_by`,
`drop_in.converted_user_id`, `notification.user_id`, `notification.sent_by`,
`member_referral.assigned_by`, `member_referral_audit.actor_id`.

Fields leaving `organization` in the Wave 7 contract migration:
`public_code`, `time_zone`, `country`, `address`, `map_url`,
`curriculum_for_students`, `public_booking_enabled`, `public_api_key`,
`public_api_origins`. `member.status` and `member.invited_role`, added by
migration `0002`, go with them. `member.role` stays, because the Better Auth
organization plugin owns it, `packages/auth/src/permissions.ts` defines its
values and `creatorRole: "owner"` writes it.

Foreign keys today: only 14 exist in the whole schema, and only
`academy_invite.academy_id -> organization.id` ties a product table to the
tenant. Every other `academy_id` is loose text. The pivot adds the real keys.
**No new foreign key cascades.** `erase.ts` deletes in an explicit order and
`erase-coverage.test.ts` proves each table is covered. A cascade would hide a
table from that proof.

## 9. What this note does not decide

A `person` table for a login-less lead who visits two entities, renaming
`academy_id` to `entity_id`, and a metrics projection for the organization
dashboard. Each is a follow-up slice with its own ADR.

## 10. Amendment (2026-09-02): delete closes one academy

Wave 7 left `softDeleteAcademy` matching the ENTITY id against the
`organization` row. On the default entity, whose id equals the organization's,
that closed the whole gym and every mat under it. On a second entity it matched
nothing and the delete silently did nothing.

It is now entity-scoped: the named entity gets `deleted_at`, and the
organization follows only when no live entity is left. So an owner running two
mats can shut one and keep the other's classes, roster, dues and join code, and
closing the last one still closes the gym. Every read that hides a deleted
academy already keyed on `entity.deleted_at` (the tenant tier's
`getEntityInOrganization`, `listMembershipsForUser`, `resolveInviteToken`), so
nothing else moved. `entity.is_default` is only a sort key, so the default mat
closing before its sibling leaves nothing to repair.
