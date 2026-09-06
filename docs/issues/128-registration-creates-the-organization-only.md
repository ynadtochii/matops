# 128 — Registration creates the organization only

**Status:** accepted · **Date:** 2026-09-04 · **Area:** `packages/auth` (the
`afterCreateOrganization` hook), `packages/db` (`provision.ts`, migration
`0060`), `packages/api` (organization creation, `entity.list`, the post-login
gate), `apps/nextjs` (the landing rule, the overview, the create form).
**Supersedes:** [124](124-the-organization-owns-typed-entities.md) §1 "Default
academy creation", where making a gym also made a `bjj_academy` entity in the
same step, and [126](126-a-branch-is-not-always-a-mat.md) §7, where
`general_branches_enabled` stays off until the pilot turns it on.
**Relates to:** [127](127-the-owner-level.md) (the organization shell this
lands in), [125](125-the-pivot-review-fixes.md) (which put the repair path on
the post-login gate), [118](118-the-owner-makes-the-account.md) (who signs up).

The run file is [PLAN.md](../../PLAN.md) and the loop file is
[EPIC.md](../../EPIC.md). This note fixes the contract before any code moves.

## Why

ADR 124 made an organization and a mat in one step because there was only one
kind of place and every gym had exactly one. Both halves of that are gone. ADR
126 added a second branch type, and ADR 127 gave the organization its own shell
with its own people, plans, money and reports. So the step now guesses.

It guesses the type. Registration writes a `bjj_academy` for an owner who came
to open a weight room, and nothing in the flow asks. It guesses the name: the
gym's name becomes the mat's name, which is right for one mat and wrong for
"Alma" running "Alma Downtown" and "Alma Gym". And it guesses that a mat is
wanted at all, minutes after someone typed a name into a form.

The guess is expensive to undo. The entity carries the public code, the time
zone, the address, the profile row and a curriculum track. An owner who wanted
something else has to delete a place that already printed a join code.

The guess also made a second rule necessary. Because every organization was
supposed to have an entity, an organization without one had to be broken, so
`organizationsMissingEntity` reads the same shape and repairs it at the
post-login gate (`packages/api/src/router/academy.ts:86`). That repair is now
the thing standing between an owner and the choice they should be making.

## 1. Registration writes one organization

Creating a gym writes the Better Auth `organization` row and the owner `member`
row. Nothing else. No `entity`, no `entity_membership`, no `academy_profile`,
no public code, no curriculum track.

`provisionOrganization` leaves the `afterCreateOrganization` hook in
`packages/auth/src/index.ts` and leaves the belt-and-braces second call in
`academy.create`. Both call sites go, and the function goes with them, because
its only job was to write the pair of rows this note splits apart.

Creation returns `organizationId`. It refreshes the active-organization session
cookie, the way `academy.create` already does, and the owner lands on
`/overview`.

## 2. A zero-branch organization is a normal state

It is an onboarding state, not a failed write. Nothing may treat it as damage.

`organizationsMissingEntity` is deleted, along with the repair loop that calls
it. There is no longer a shape to repair: an owner with no branch is an owner
who has not picked one yet, and the screen that lets them pick is the one they
are already on.

The landing rule in `apps/nextjs/src/app/(app)/page.tsx` changes with it. Today
zero entities means the student join-by-code form, which is the wrong screen for
somebody who just made a gym. An owner of an active organization goes to
`/overview` at zero branches, the same as at two. Join-by-code stays for the
person it was written for: signed in, owning no organization, holding no branch
membership.

Every organization read answers zero rather than failing: totals of nothing,
lists of nothing, an overview that draws. The organization pages ADR 127 built,
Overview, Settings and Profile, stay usable. Members, Memberships and Staff hide
where an empty state would not help the owner finish setup.

## 3. The first branch is chosen, not assumed

The owner picks the type and the name. There is no default type. A gym whose
first branch is a general space is as normal as one whose first branch is a mat.

Two rules from ADR 124 survive the move, because things outside the app depend
on them. The first live branch is the default branch, `is_default = true`. And
the first branch takes the organization's own id where that does not conflict,
so a QR poster, a check-in link or a seed script that names the organization
still resolves. Later branches keep random ids, as they do today.

## 4. First-branch creation is one locked transaction

`createEntity` in `packages/db/src/provision.ts` decides whether the branch it
is writing is the first one. It takes a lock on the `organization` row before it
looks, so two requests cannot both read zero branches and both write a default.
The partial unique index ADR 124 §"unique constraints" put on one non-deleted
default per organization is the second line of defence, not the first.

The transaction writes what the type needs and nothing more. Every branch gets
`entity_membership` for the creator. Only `bjj_academy` gets `academy_profile`
and a default curriculum track, which is ADR 126 §1 applied to creation.

A retry repairs the same branch. A partial failure followed by a second attempt
must never leave two default branches or two rows for one place.

## 5. The client is told what it may create

`entity.list` returns `canCreateBranches` and `canCreateGeneralBranches` beside
the entities. The first is the active organization owner role. The second is
that role plus `organization.general_branches_enabled`.

Today the create form offers a general space and the server refuses it. Two
values instead of one `canAdd` mean the client never offers an action the server
will reject, and when the flag is off the form says why rather than failing on
submit.

## 6. The flag defaults to true, and every new branch is on shared memberships

ADR 126 §7 kept `general_branches_enabled` off for everyone until the whole
membership and booking path worked. It works. Migration `0060` changes the
column default to true. Existing live organizations are moved by a hand-run fill
under `packages/db/scripts`, not by the migration, because a migration is
structure only.

Every new branch is created with `membership_enforced_at` set, including a
`bjj_academy`. A branch made after this release never starts on ADR
[40](40-manual-transfer-payments.md)'s branch dues. Legacy dues stay reachable
for one job only: migrating and rolling back the branches that existed before
the cutover.

## 7. What this does not authorize

A third branch type. Automatic payment collection or a payment provider.
Waitlists, private hire, room or equipment inventory. A shared curriculum
library. Cross-branch referrals. Public visitor booking at a general space.
Logo storage. Moving a member or a class between branches. Renaming `academy_id`
to `entity_id`.

It does not authorize deleting the legacy dues tables. `membership_plan`,
`member_dues` and `payment_claim` stay until retention and export rules are
settled.

## 8. Rollout

The contract ships first: this note, the spec, the architecture doc and the
roadmap. Then organization-only creation and the zero-branch shell ship
**together**. Shipping the first without the second strands a new owner on a
screen that asks them for a six-digit code.

Migration numbers: `0059` is reserved for the later drop of
`payment_settings.bank_details`, which ADR 127 §2 delayed by one deploy. Do not
reuse it. This release starts at `0060`.

Production holds no customer data, so this is a hard cutover for new
organizations with no old path kept alive. Rollback means restoring the hook,
which would provision a mat for a gym that already chose otherwise, so the
rollback window closes as soon as the first branch of the first new
organization is written.
