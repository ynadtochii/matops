# ADR 55 — A pending member is shown by name on a class

**Status:** accepted · **Date:** 2026-08-19 · **Amends:** the schedule-privacy
rule locked in spec §4 (session 12) · **Builds on:** ADR
[29](29-pending-role-model.md) (pending holds no role), spec S5

## Context

Spec §4 said: "only **approved** members see who's in a class (names). Pending
members and drop-ins appear only as a count." That bundled two separate gates
into one sentence:

1. **Viewer side.** Who is allowed to see names at all.
2. **Subject side.** Whose name may be shown.

N.5 built both. In use the subject-side gate reads as a bug. A class with nine
booked people showed eight names and "+1 other", and the hidden person was an
ordinary member waiting on approval who trains on the same mat, stands in the
same circle, and is about to be approved anyway. The count told the viewer
nothing except that the app was withholding something.

The subject-side gate also fails quietly in the wrong direction. Approval does
not rewrite an existing booking's `booking_tier`, and the seed writes `confirmed`
for pending members, so "approved attendee" had to be resolved against the auth
`member` table on every read. That is a base-connection lookup of the whole
member list to decide whether to print a name.

## Decision

**Keep the viewer-side gate. Drop the subject-side gate.**

An approved viewer sees **every booked member by name**, pending ones included.
What stays a count is the people who are not members of the academy:

- **Drop-in leads.** They filled a public form and consented to the gym
  contacting them. They did not consent to being listed to other students. This
  is the gate that carries the actual privacy weight, and it stays.
- **Anyone with no name on file.** Nothing to print.

A **pending viewer** still sees counts only, with `namesHidden` set so the screen
can say names appear after approval. This is the anti-scraping half of the rule:
a forwarded invite plus a self-join must not turn into a member directory.

## Consequences

- **The class detail says what a student sees walking in.** No hidden ninth
  person.
- **`class.attendees` got smaller.** The `listMembersOf` lookup is gone, so the
  read is one RLS query for the names plus one count of drop-ins. `visibleAttendees`
  no longer takes an `approved` flag per attendee.
- **A pending member is now visible to the rest of the gym before approval.**
  Accepted: they joined with the gym's own code and the owner sees them in the
  approval queue. If a gym ever needs a member who is invisible until approved,
  that is a suspend, not a pending.
- **Spec §4 and S5 are amended, not rewritten.** The locked-scope note in
  map.md still records the original rule; this ADR is the supersede.

## 2026-10-13 addendum: restored on the web

The first-release cut removed `class.attendees` and the student list, which left an empty "Who's booked" heading on the web class page. The rule in this ADR is restored as it was: `visibleAttendees` in `packages/domain/src/attendance.ts`, `class.attendees` (enrolled tier) in the class router, and the list on the web class page. The Expo class screen does not show it yet.
