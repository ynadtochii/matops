# 84 — Archive and permanent erase for members

**Status:** accepted · **Date:** 2026-08-23 · **Area:** `packages/domain`, `packages/db`, `packages/api`, `packages/ui`, `apps/nextjs` · **Amends:** the O4 "Remove" action and the §4 membership lifecycle (ADR [20](20-membership-approval.md), [23](23-pending-view-only.md)). Migration `0026`.

## Context

An owner had exactly one destructive action on a member: **Remove**. It wrote
`member.status = 'removed'` and nothing else. The instinct was right, since
students leave and come back and their history should survive, but the action
was only half built. Three defects came out of tracing it:

1. **The gym kept billing people who had left.** `claimDueDuesReminders` joined
   `member` but never filtered on status. A removed student kept their
   `member_dues` row, so the daily reminder cron pushed "your dues are due" at
   them every month, forever.
2. **Upcoming bookings were never cancelled.** Removal did not touch
   `class_participation`, so `class.booking_count` stayed inflated permanently
   and `class.attendees` (which joins `user`, not `member`) still listed the
   departed student to everyone else in the class.
3. **It was a one-way door.** `restore` refused anything that was not
   `suspended`, and removed members were invisible to the owner. The only route
   back was the student self-joining with the gym code.

Separately, nothing in the product could answer a data-deletion request. The
privacy page already names the academy as the data controller and tells members
to "ask your academy first", a promise the owner had no way to keep.

## Decision

Split the one action into two with visibly different weight, and fix the three
defects while doing it.

- **Archive** is the everyday, reversible one. It revokes access, cancels the
  member's **upcoming** seats and gives that capacity back, stops the dues
  clock, and keeps every row. `restore` reverses it.
- **Delete permanently** is the rare, irreversible one. It erases every row this
  gym holds about the person. It sits behind a `⋯` menu and a dialog that
  requires typing the member's name.

### `archived` is a new status value, not a new column

`member.status` is plain `text` with no enum, so the value costs **zero
migration**. `canEnroll` is a whitelist (`pending` or `active`), so `archived`
is denied access automatically, which is the argument for keeping that predicate
a whitelist rather than a blacklist.

`removed` is **kept and now means only one thing**: an applicant an owner
declined, who was never a member. Reusing one value for both would have put
declined applicants on the Archived tab next to real leavers.

Archive accepts only an **active or suspended** member. A pending applicant is
declined, not archived: the real academy role is granted at approval and nowhere
else, so archiving one and restoring them would produce an active member holding
Better Auth's placeholder `member` role, with no approval ever recorded.

Three places blacklisted `"removed"` by name (the member list, the growth
counts, the referrals filter). They now share one domain predicate,
`isOnRoster`, so they cannot drift apart when a fourth status appears.

### Erasure stops at the academy boundary, except when nothing is left

An owner may wipe everything **their** gym holds. They may not delete a sign-in
account that another gym's records depend on. So `purge` always deletes the
academy-scoped rows plus the `member` row, then deletes the `user` row **only
when no other membership survives anywhere**. For a student who trains at one
gym, the normal case, that is complete erasure and answers the request. For
someone who trains at two, the login and the other gym's data survive, and the
dialog says so before the owner commits.

An owner cannot erase their own membership. That guard, plus the existing
never-ownerless check, means a purge can never strand a gym.

### Nothing cascades, so every table is named

No domain table has a foreign key to `member` or `user`; they all carry a plain
`text` id. A table left out of `eraseMemberData` silently survives the erase.
The list and its order mirror `clearAcademy` in `packages/db/src/seed/augment.ts`,
the other place that removes a person's whole footprint.
`recomputeBookingCounts` moved out of the seed module into `packages/db/src/erase.ts`
so a production path is not importing from `seed/`.

The erased person may have referred other students. Their credit is set to null
and a `cleared` row is written to the referral audit, so those students appear
under "Nobody credited yet" rather than pointing at a member id that no longer
exists.

### The two "append-only" tables were never append-only

`member_referral_audit` was granted `SELECT, INSERT` (ADR 18) and `notification`
carries the comment "no DELETE grant: v1 has no path that removes a
notification" (`0023`). Both read as though the erase would be refused.

**Neither actually withheld DELETE.** Migration `0001` sets
`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLES TO matops_app`, so every table created after it starts with all four
privileges, and a later narrower `GRANT` is additive and takes nothing away.
Append-only on those two tables was a **convention in the comments, not a
permission**. Verified by replaying every migration except `0026` onto PGlite:
`matops_app` already holds DELETE on both.

Migration `0026` therefore changes nothing. It is kept because it is already
applied to Neon and because it records the intent in one place, but it must not
be read as the thing that made the erase possible.

The check that matters is behavioural, not the migration:
`packages/db/test/erase-grants.test.ts` asserts the app role can delete from both
tables and still cannot cross the tenant boundary. **If real append-only
enforcement is wanted on the audit table, it needs an explicit `REVOKE`**, which
is a separate decision and would have to carve out the erase path.

## Consequences

- **A purge is not atomic.** The RLS-scoped tenant transaction and the base
  connection are separate connections, the same split every identity write in
  the codebase already has. `purge` therefore archives first, so a failure part
  way through leaves an archived member with some rows gone. Re-running finishes
  the job: every delete is scoped by member and reports zero the second time.
- **A returning student needs no new code.** `createPendingMembership` already
  re-opens a non-active row to `pending` on the same `member.id`, so rank,
  notes, dues and attendance come back whether the owner restores them or the
  student rejoins with the gym code.
- **Restored members do not get their seats back.** Those classes may have
  filled or passed. Stated in the confirm copy rather than worked around.
- **No `archived_at` column.** The Archived tab shows the joined date, not the
  leaving date. Add the column when an owner asks for it.
- **Actor ids are not scrubbed.** `member_referral.assigned_by`,
  `member_referral_audit.actor_id`, `notification.sent_by` and
  `class_participation.marked_by` on *other* people's rows may still hold an
  erased person's id. Those record what the gym did, not who the person was, and
  they have no foreign key, so they dangle harmlessly. A stricter reading of
  erasure would scrub them too; revisit if a pilot gym asks.
- **The referrals screen still says "Show removed students"** while the members
  screen now says Archived. A wording inconsistency, not a behaviour one, since
  both flow through `isOnRoster`.
