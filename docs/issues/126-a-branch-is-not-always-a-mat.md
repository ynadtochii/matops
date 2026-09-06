# 126 — A branch is not always a mat

**Status:** accepted · **Date:** 2026-09-03 · **Area:** `packages/db` (new tables, migrations `0049`-`0054`, RLS), `packages/domain` (access rules), `packages/api` (eligibility, capacity), `apps/nextjs`, `apps/expo`. **Amends:** [124](124-the-organization-owns-typed-entities.md) §"the only type this pivot implements is `bjj_academy`" and its BJJ-only scheduling boundary. **Relates to:** [12](12-tenant-isolation-mechanism.md) (the RLS seam), [40](40-manual-transfer-payments.md) (the existing branch dues), [82](82-membership-booking-gate.md) (the current booking gate).

The plan and the run file are
[general-branches-memberships-plan.md](../general-branches-memberships-plan.md).
Product rules are GB1 to GB9 in [spec.md](../spec.md). This note fixes the
names, the invariants and the decisions that were still open, before any schema
code is written.

## Why

A gym that runs a mat also runs a weight room and a sauna. Today matops can
only model the mat: `ENTITY_TYPES` holds one value, `canVisit` refuses every
other type, provisioning writes an `academy_profile` and a curriculum track for
every branch, and a membership plan belongs to one branch. An owner who sells
"BJJ + Gym" has no way to say it, and no way to see one person once across both.

ADR 124 deliberately left this out. It built the organization and entity split
and stopped there, because the pivot was already eight waves. The foundation it
built is the right one, so this is an extension of it, not a replacement.

## 1. Two types, one schedule

`ENTITY_TYPES` gains `general_space`. Gym and sauna are two general spaces, not
two types: the difference between them is their name and their schedule, and
nothing in the code needs to tell them apart.

One shared implementation carries recurring templates, occurrences,
participation and attendance for both types. There is no second booking schema.
Three things change for a general session: the instructor becomes optional, the
curriculum is never set, and a bounded description is added. Existing table
names stay, so `class` and `class_template` hold gym sessions too. Renaming
them would touch the same 818 `academy_id` references ADR 124 refused to touch.

BJJ-only work stays BJJ-only and is refused on the server. Rank and curriculum
procedures get a type guard. Hiding a nav item is not a check.

`academy_profile` stays BJJ-only and keeps the curriculum and public-booking
settings. Shared identity and time zone are read from `entity`, which already
holds them. Two readers currently inner join `academy_profile`
(`packages/db/src/membership.ts`, `packages/api/src/academy-tz.ts`) and would
make a general branch invisible; they become left joins.

## 2. The plan is an organization record

`access_plan` belongs to the organization. `access_plan_entity` lists the
entities it covers, by id and not by type, so "BJJ Only" can mean one specific
mat. There is one plan row, never a copy per branch. A new branch joins no
existing plan.

`access_assignment` is one person's ongoing membership. It is stored against the
organization and the user, even though it is created from an entity member
profile: the assigning entity is recorded as where the action happened, and
grants nothing. Assigning the same active plan again from another branch returns
the existing assignment instead of a second one. Access is the union of a
person's assignments, so a second valid membership keeps a branch open when the
first is unpaid.

The name is `access_plan` and not `membership_plan` because
`membership_plan` already exists and means the BJJ dues product from ADR 40.
The interface says "Membership plan" and "Membership" in both cases; only the
table names differ. `entity_membership` is untouched and still holds role and
status at one branch. An assignment is not a role, and a branch suspension
denies booking even when a plan covers the branch.

Cross-organization references are prevented by composite foreign keys, the same
device migration `0046` used for `(academy_id, member_id)`. RLS matches on
`app.organization_id`, which `withScope` already sets. Organization isolation
alone is not enough: reads are filtered by person and role too, or one member
reads another's membership.

## 3. Manual months, and one authoritative gate

The system never collects money. `membership_month` is one row per assignment
per calendar month with a paid flag, marked by the owner. A missing row means
unpaid. Months start on the first. A mid-month join gets seven days from
joining to pay for that month, and the normal first-of-month cycle starts the
following month, so there is no rolling anniversary.

Grace defaults to seven days and is owner-configurable on `membership_policy`.
With seven days, access runs September 1 to 7 and stops September 8 at 00:00.

**Decision, open until now: the timezone is the organization's.** One
owner-selected zone on `membership_policy`, suggested from the default entity.
A shared membership covering three branches must expire at one moment, and
three branch zones cannot promise that.

**Decision, open until now: grace covers unpaid renewal only.** Removing an
entity from a plan, cancelling a membership, and suspending an assignment or a
branch membership all take effect at once. Grace is an allowance for money that
has not arrived yet. It is not a notice period, and reusing it as one would mean
a suspended member keeps training for a week.

Two payment gates must never run together. `entity.membership_enforced_at` marks
a branch as switched over. Until it is set, the branch keeps ADR 82's dues gate
exactly as it behaves today. A general branch is enforced from creation. Moving
an existing BJJ branch needs assignments created first and the affected members
previewed with the owner, and is not authorized by this note.

After grace, a sweep cancels future bookings that no other assignment covers and
releases each place once. The sweep rechecks payment state inside the
cancellation transaction, so a payment confirmed at the same moment does not
lose a reservation. Booking and admission enforce the deadline themselves, so a
late sweep cannot let anyone in. Confirming payment restores eligibility and
does not restore cancelled bookings, because somebody else may hold the place.

## 4. Strict capacity is a property of the session

Booking currently counts up without a ceiling (ADR 82 chose a soft cap on
purpose: a mat that fits one more person should fit one more person). A gym rack
does not work that way. `capacity_policy` goes on the template and the
occurrence, existing rows default to `soft`, and general sessions are created
`strict`.

A strict place is claimed with a conditional update in the same transaction as
the participation row. A full session rolls the participation back. This is the
same shape the booking count already uses, so it is one condition and not a lock
manager. Every path that creates participation is covered, including approval,
staff booking, walk-in admission and visitor promotion. A pending member at a
general branch gets no provisional reservation, which the BJJ trial rule
currently allows.

Strict capacity limits one session. It does not model a shared room, so
overlapping general sessions in one branch are refused outright, by a
`btree_gist` exclusion constraint on `(academy_id, tstzrange(starts_at,
ends_at))`. That is a database constraint rather than serialized application
writes, because recurrence generation and rescheduling both write in bulk and
either would have to hold the same lock. Several simultaneous rooms need a
resource model and are out.

## 5. Two views, deliberately not merged

Entity Members stays the daily list for one branch: role, approval, memberships
that apply, eligibility, attendance. Organization Members is an owner-only
directory grouping the existing rows by user id, with one row per person and
badges for their branches. There is no new person table and no second editable
copy of anybody's identity. Registered users already have one id; a login-less
lead who visits two branches is out of scope, as it was in ADR 124.

The overview counts a person once. Branch totals are labelled enrollments,
because the same person appears in two of them. Coverage is not attendance. No
revenue is shown, because a paid or unpaid flag does not prove money arrived.

Aggregation is server-side, one entity-scoped read at a time, the way `/overview`
already works. RLS is not widened to build a dashboard.

## 6. What this does not authorize

Payment processing, a payment provider, automatic collection, or the earlier
shared-billing design. Public visitor booking at a general space. Private hire
of a whole space. Arbitrary start times, room or equipment selection, waitlists,
visit packs, and per-branch visit allowances. Moving a member or a class between
branches. Migrating an existing BJJ branch onto the new gate. Renaming
`academy_id`.

## 7. Rollout

`organization.general_branches_enabled` gates branch creation and stays off
until the whole membership and booking path works. Slices 1 to 5 ship behind it.
Schedule work alone must not expose a bookable general space.

Migrations `0049` to `0054` add structure only. Any assignment backfill is a
separate reviewed script under `packages/db/scripts` with a dry run. The old
client keeps working through the deploy, and new booking rules are enforced on
the server, so an old mobile build cannot book past them.

Rollback stops new branch creation and membership editing and keeps eligibility
checks, history and cancellation running for branches already activated.
Removing the checks would open a restricted branch to everybody.

## 8. Outcome, appended 2026-09-04

Built. Every slice ran, in the order this note set, with a log entry per step in
[the plan](../general-branches-memberships-plan.md). What is worth carrying back
into this note, because it differs from what section 7 assumed:

**The migration numbers moved.** Section 7 says `0049` to `0054`. The audit
record for monthly payment corrections and the reminder marker each needed a
migration of their own, so the range is `0049` to `0056`. All structure only, all
applied to **dev** and verified there; production is untouched.

**The overlap constraint could not be built as described.** Section 5's
exclusion constraint on `class` is not expressible: `btree_gist` is absent from
the PGlite test harness, an index predicate cannot reach `entity` to ask which
branches are general spaces, and `timestamptz + interval` is not immutable so
there is no end time to range over. The owner chose the alternative section 5
already allowed, serialized branch schedule writes: a `pg_advisory_xact_lock`
per branch plus an in-transaction overlap check. It holds only while every
writer goes through those helpers, which a constraint would not require, and
that ceiling is written where the code lives.

**RLS cannot keep one member's assignment from another.** Section 4 asks for it.
It is not possible with an organization-scoped policy, because two members of one
gym share the organization id. The reader does it instead: `forUser` is
owner-only. The isolation test records this rather than asserting something that
would pass for the wrong reason.

**Two things promised here are not built**, both small and neither blocking the
pilot. The coverage preview names the PEOPLE a change reaches but not the future
bookings that would be cancelled, though section 5 asks for both. And the
visitor-path refusal at a general space has no test. Both are listed in the
plan's acceptance coverage section.

**The manual acceptance walkthrough is still outstanding.** 25 of the 36
acceptance lines have an automated test naming the case, one was verified live on
dev, and eight need a person. One of those eight cannot be automated in this
repository at all: two concurrent requests for the last place needs a
two-connection Postgres, and the test harness runs a single-connection PGlite.
