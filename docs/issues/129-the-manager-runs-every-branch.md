# 129 — The manager runs every branch, and a plan change waits for the 1st

**Status:** accepted · **Date:** 2026-09-06 · **Area:** `packages/domain`
(`access.ts`, `entity.ts`, `access-plan.ts`, `membership-access.ts`),
`packages/api` (`trpc.ts`, `accessPlan.ts`, `membership-access.ts`,
`membership-sweep.ts`), `packages/db` (`access-schema.ts`, migration `0065`),
`apps/nextjs` (the shell, People, the person profile, the overview),
`apps/expo` (the branch picker).
**Supersedes:** [126](126-a-branch-is-not-always-a-mat.md) §"Re-check
coverage", where enrolling holders after a coverage edit was a second button
an owner had to find, and [127](127-the-owner-level.md) §"Staff", where the
gym's staff had a navigation item of its own.
**Amends:** [124](124-the-organization-owns-typed-entities.md) §2, which let an
organization OWNER into every entity and nobody else.
**Relates to:** [128](128-registration-creates-the-organization-only.md) (the
manager role this note gives branch reach to).

The run file is [PLAN.md](../../PLAN.md).

## Why

ADR 128 gave a gym a manager: somebody who runs the daily work without owning
the business. The role stopped at the organization. A manager could read the
gym's people, plans and payments, and could not open a single branch, because
`resolveEntity` admits an organization OWNER without a branch row and nobody
else. So the person hired to run the place could not take a register.

Three more gaps came out of the same review. Adding a branch to a plan told the
owner who would gain access and then made them press a second button to give it
to them. Changing somebody's plan had one shape, "end this and start that
today", which charges twice for one month. And the gym's own screens sat behind
a navigation item the branch screens never showed, so an owner standing at a mat
had no way to reach shared payments.

## 1. A manager enters every live branch

`resolveEntity` admits an active organization owner OR an active organization
manager. The manager needs no `entity_membership` anywhere.

The synthesized branch standing names what they are. An owner reads `owner`, a
manager reads `manager`. A manager is never written down as an owner, in the
context or in a response, because the difference is what keeps the protected
actions protected.

`memberId` stays null when there is no branch row, exactly as it does for an
owner today. Their own booking, rank and dues rows key on
`entity_membership.id`, so a manager with no row cannot book a class as a
student, and management access never enrols them as one. A manager who also
trains at a branch keeps that row and that `memberId`.

## 2. Two branch tiers, not one

`isStaff` accepts `manager`, so every schedule, attendance and roster screen
opens for them.

`runsBranch` is the new predicate: an active `owner` or `manager` at the branch.
It replaces `isOwner` in the branch tier for the ordinary work, which is the
schedule, attendance, local members and their approvals, instructor
assignments, leads, plans, dues, claims and ordinary branch settings.
`branchManagerProcedure` and `branchManagerIdentityProcedure` carry it.

`isOwner` keeps exactly four branch actions, and it keeps them in the tier
rather than in a check somebody has to remember:

- making or removing an owner (`membership.promote`, `membership.setRole`),
- permanent erase (`membership.purge`),
- deleting a branch (`academy.remove`),
- the commercial account of the gym.

Navigation and action visibility read the same predicate, so a manager is not
offered a button the server will refuse.

Removing or suspending the manager's organization membership takes effect on
the next request, because the standing is resolved per request and nothing
caches it. Any branch row they hold in their own right survives.

## 3. Coverage is one workflow

Adding a branch to a plan enrols the plan's live holders at that branch in the
same call. `setCoverage` runs the reconcile it used to leave to a second
button, and returns what it did: who was enrolled, who needs a decision because
they hold a branch row that is not active, and who failed, by name.

`Re-check coverage` stays, and stops being a normal step. It appears when the
last run left work unfinished, and it is a retry rather than a required second
action. It stays safe to press: it reads the state each time and writes only
what is missing.

A preview carries the coverage version it was computed from, and confirmation
rechecks it. A stale confirmation is refused with a fresh preview rather than
applied to a list that has moved.

## 4. A plan change starts on the 1st

Changing somebody's plan does not touch the month they are in. The old plan
runs to the end of the current month and the new one starts on the first day of
the next, counted in the organization's membership time zone.

`access_assignment` becomes date-bounded. `start_month` already exists;
`end_month` is added, nullable, exclusive, and is the first month the
assignment no longer applies. An old assignment's `plan_id` is never rewritten:
history stays readable, and returning to a plan held before creates a new
period rather than reopening an old one.

The lifetime unique index on `(plan_id, user_id)` goes. A partial unique index
on `(plan_id, user_id, start_month)` for rows that are not cancelled replaces
it. Overlap between two live periods of the same plan is refused by the writer,
inside one transaction that locks the person's rows.

`access_assignment_change` records the decision: source, target, effective
month, the end month the change wrote on the source, who scheduled it and when,
and who cancelled it and when. Pending and applied are read off the calendar,
never stored, so a cron job that does not run cannot leave a change half made.

`appliesInMonth(assignment, month)` is the one pure rule, and every access,
payment, claims, metrics, reminder, roster and sweep reader calls it.

Before the boundary, staff may cancel the change. Cancelling ends the successor
that never started and restores the source's end month to what it was, in one
transaction, and keeps the record of the cancelled change. After the boundary
there is no undo, only a new change for the month after this one.

The successor starts with no month record of its own, so no paid flag, claim or
amount is carried across. September's receipt is September's.

## 5. Losing coverage cancels nothing

Ending a membership, or dropping a branch from a plan, leaves every booking
where it is. Reservations, capacity and attendance history do not move, and no
cancellation message is sent.

The affected bookings become a derived review list: future sessions at a branch
the person will not be admitted to at session time. It is computed from current
bookings and current access, so restoring coverage or cancelling the booking
removes the item with no second write. There is no new booking status and no
task table.

Staff still cancel a booking the way they always did, from the class.

The overdue sweep keeps its unpaid-month behavior and gains one rule: an
assignment that ended, or one that has not started, is not a reason to cancel
anything.

## 6. Gym and branch navigation are one frame

The shell renders two groups. `Gym management` holds the organization's
screens, and the current branch holds its own. An owner standing at a mat
reaches shared payments without finding a second menu.

Settings are labelled `Gym settings` and `Branch settings`. The selector's
organization destination is `Gym overview`, which is a place to go rather than a
filter on the screen the reader is looking at.

One branch shows its name and no picker. `Add branch` sits in gym management,
for owners.

Switching branches keeps a compatible route and a schedule date, and drops
person, class and session ids, which belong to the branch being left. A
destination the new branch does not have falls back to its home.

## 7. Staff is a tab inside People

`/staff` redirects to `/people?tab=staff` and loses its navigation item. Both
tabs read the one directory query. The person profile carries branch
assignment and per-branch approval, so an owner assigns a coach to two branches
without visiting two screens.

Ordinary staff roles only. Owner and organization manager grants stay where
they are, and a plan assignment never promotes anybody.

## Out

Not in this note, and not built: a third level under a branch, rooms, resources
or new branch types; immediate plan replacement, proration, refunds or credit
transfer; automatic cancellation when coverage ends; email delivery of staff
invitations; a metrics projection for the overview.

## 2026-09-27 · Superseded in part by ADR 145

Permanent erase (`membership.purge`) is no longer owner-only. An owner or a manager can run it, and a manager cannot erase an owner or anyone who runs the gym. See [145](145-student-asks-to-erase-data.md).
