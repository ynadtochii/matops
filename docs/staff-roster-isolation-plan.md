# Separate staff from members

Date: 2026-09-06. Status: implemented. Workspace typecheck passed 17/17 and lint passed 15/15.

This review follows the current working tree, including existing uncommitted changes. It does not verify deployed data.

## Goal

Owners and instructors belong in Staff. They need no paid membership to run or train at their branch.
Members should list students. Class attendance must still record staff who actually train.

## Current behavior

| Area | What the code does | Evidence |
| --- | --- | --- |
| Identity | One `entity_membership` row per person per branch holds both role and approval status. A row does not mean a paid subscription. | `/Users/kuna/projects/matops/packages/db/src/entity-schema.ts:98` |
| Owner creation | Provisioning creates an active owner branch row. | `/Users/kuna/projects/matops/packages/db/src/provision.ts:119` |
| Instructor creation | Branch assignment creates instructor rows. Promotion changes the existing row's role. | `/Users/kuna/projects/matops/packages/api/src/router/entity.ts:206`; `/Users/kuna/projects/matops/packages/api/src/router/membership.ts:679` |
| Organization access | Organization owners and managers inherit access to branches, even without a branch row. Their context can have a null member ID. | `/Users/kuna/projects/matops/packages/api/src/trpc.ts:334` |
| Members list | The API filters by roster status, not student role. The web list excludes pending rows but keeps owners and instructors. | `/Users/kuna/projects/matops/packages/api/src/router/membership.ts:358`; `/Users/kuna/projects/matops/apps/nextjs/src/app/_components/members.tsx:294` |
| People directory | All people includes staff. Staff is a filtered view of the same directory. | `/Users/kuna/projects/matops/apps/nextjs/src/app/_components/people-screen.tsx:71`; `/Users/kuna/projects/matops/packages/domain/src/member-directory.ts:125` |
| Booking payments | Active staff already bypass legacy dues and shared membership checks. This exemption also exists in HEAD. | `/Users/kuna/projects/matops/packages/api/src/payments-gate.ts:56`; `/Users/kuna/projects/matops/packages/api/src/payments-gate.ts:136` |
| Staff approval | Legacy default dues are assigned only when the approved role is student. | `/Users/kuna/projects/matops/packages/api/src/members.ts:166` |
| Purchase | The current student purchase flow requires an active student branch row. | `/Users/kuna/projects/matops/packages/api/src/router/membershipPurchase.ts:209` |
| Roster membership labels | Standing reads status without role. Staff without a plan get `not-covered`, which the UI renders as a membership problem. | `/Users/kuna/projects/matops/packages/api/src/membership-access.ts:185`; `/Users/kuna/projects/matops/apps/nextjs/src/app/_components/member-detail.tsx:87` |
| Activation | Staff do not block activation, but still appear in its uncovered list and active-member count. | `/Users/kuna/projects/matops/packages/api/src/router/entity.ts:416`; `/Users/kuna/projects/matops/packages/api/src/router/entity.ts:437` |
| Uncovered queue | This queue already excludes active staff. | `/Users/kuna/projects/matops/packages/api/src/router/accessPlan.ts:1276` |
| Booking review | Future bookings are checked against plans and branch status without a staff exemption. A staff booking can be incorrectly listed for review. | `/Users/kuna/projects/matops/packages/api/src/membership-access.ts:320` |
| Overdue cancellations | The sweep finds unpaid assignments and cancels future bookings without checking staff access at each affected branch. This matters when staff retain a paid assignment. | `/Users/kuna/projects/matops/packages/api/src/membership-sweep.ts:394` |
| Payment reminders | Warnings follow paid assignments without checking staff roles. An owner with no assignment receives no assignment warning. | `/Users/kuna/projects/matops/packages/api/src/membership-status.ts:123`; `/Users/kuna/projects/matops/packages/api/src/membership-sweep.ts:502` |
| Attendance | The walk-in picker accepts every active role. Participation rows do not return a role badge. Teaching and participation use separate records. | `/Users/kuna/projects/matops/packages/api/src/router/attendance.ts:48`; `/Users/kuna/projects/matops/packages/api/src/router/attendance.ts:63` |
| Counts | Organization enrolled-member counts already select students. Some branch and legacy summary counts select every active role. | `/Users/kuna/projects/matops/packages/domain/src/organization-metrics.ts:77`; `/Users/kuna/projects/matops/packages/domain/src/dashboard.ts:75`; `/Users/kuna/projects/matops/packages/api/src/router/stats.ts:423` |

The root cause is inconsistent interpretation of a branch relationship. Some readers treat every relationship as student enrollment.
Others correctly use role to distinguish staff. Filtering only the Members screen would leave false warnings and background cancellations.

## Recommended model

Keep the current identity tables and IDs. No new table or database status is needed for the first release.

Keep three separate answers:

- Role: Owner, Manager, Instructor, or Student.
- Relationship status: Pending, Active, Suspended, Archived, or Removed.
- Access source: Staff access, Membership, or the existing student access outcome.

Show staff as `Owner · Active` or `Instructor · Active`, with `Staff access. No membership required`.
Do not add `staff` to approval status. A suspended instructor must still be recognizable as an instructor.
Do not reuse `isStaff` for list classification: it requires active status and would miss suspended staff.

Create pure rules for student classification, staff classification, and membership requirements.
Include pending instructor invitations in staff classification before approval grants the instructor role.
Resolve inherited organization roles consistently with `enforceEntity`, rather than reading only the branch role.
Keep permission checks distinct from whether someone belongs in the student list.

Retain `rosterOf` as an all-person reader. Staff pickers and identity operations depend on it.
Apply student selection in the relevant API readers before counts, filters, and pagination.
Keep an intentional People > All view if useful, but call the student-only view Members.

## Product decisions before implementation

1. Recommended: staff who train at their own branch remain Staff and have free access. No separate paid student enrollment there.
   Approved when the user requested implementation.
2. Recommended: instructors at one branch can remain paying students at another where they have no staff access.
   Organization owners and managers currently inherit staff access across their organization. Preserve that behavior.
3. Recommended: staff who explicitly join a class appear in attendance with their role badge and consume a training place.
   Teaching alone must not create student attendance or consume a training place.
4. Recommended: removing a staff role must offer an explicit student transition or removal of branch access.
   A student transition uses normal approval and membership rules. Do not silently restore old billing.
5. Existing paid assignments need review. Do not automatically cancel an organization-wide plan because one covered branch grants staff access.
   It may still be needed where the person is a student. Define when a staff-only assignment ends and what remains due.

## Implementation slices

- [x] **1. Define the rules.** Add pure classification and access-source rules in `/Users/kuna/projects/matops/packages/domain`.
  Cover active and inactive staff, pending coach invites, inherited roles, and staff at one branch who study elsewhere.
  Preserve the current authorization rules and last-owner protection.
- [x] **2. Separate list readers.** Update branch Members, organization Members, requests, counts, and filters.
  Keep Staff readable for active, pending, suspended, and archived roles.
  Build organization staff visibility from organization roles as well as branch rows, without creating student records.
  Update `membership.ts`, `organization.ts`, `member-directory.ts`, `members.tsx`, and `people-screen.tsx`.
- [x] **3. Align access decisions.** Return an explicit staff access source from the shared access reader.
  Use it in booking/check-in, roster standing, activation previews, uncovered queues, and booking review.
  Add the same branch-specific protection to overdue cancellation, rechecked inside the cancellation transaction.
  Do not suppress legitimate charges for a plan still needed at another branch.
- [x] **4. Separate the UI.** Replace false membership warnings with role and staff-access labels.
  Remove student plan prompts and assignment shortcuts for staff-only branch contexts.
  Keep legitimate existing payment history accessible. Add role badges to class participants and the walk-in picker.
  Keep instructor assignment separate from attending a class.
- [x] **5. Handle lifecycle and existing data.** Review provision, invites, approval, promotion, demotion, and coverage enrollment.
  Preserve existing identity IDs, rank, notes, payments, and attendance history.
  Produce a read-only report of staff with active paid assignments, future bookings, and branch/student overlaps.
  End unnecessary assignments only under the agreed billing policy. Never manufacture a free plan to represent staff access.
- [x] **6. Align reporting and verify.** Use student classification for member, growth, and retention counts.
  Keep total physical attendance distinct from student attendance. Do not rewrite past participation from a person's current role.
  Update spec, architecture, roadmap, and the relevant decision record to remove claims that staff need coverage.

## Acceptance checks

- Active owners and instructors do not appear in branch Members, member totals, or student requests.
- Pending instructors appear in staff requests. Suspended staff remain visible in Staff without gaining active access.
- Active staff without a plan can use allowed booking/check-in flows and see no missing-membership warning.
- Activation previews and future-booking review do not report staff as lacking required coverage.
- An unpaid assignment cannot cancel a booking at a branch that grants the person staff access.
- The same assignment can still affect bookings where the person is only a student.
- A staff participant remains on class attendance with a role badge. Teaching does not count as student attendance.
- Existing member and payment history remains linked to the same person after role changes.
- Organization owners/managers need no artificial student enrollment to appear in Staff or manage a branch.
- Staff promotion and demotion update visibility and access without silently creating or reviving payment obligations.

## Verification and rollout

Analysis used code reads and a HEAD comparison of the booking gate. Implementation preserves existing identity and billing records.
No tests were run. Workspace typecheck passed 17/17, lint passed 15/15, and the diff whitespace check passed. Browser acceptance and database report execution remain unverified.

For implementation, add focused regression cases to the existing domain, API, and database test files.
Cover list filtering, inactive staff classification, inherited access, role transitions, multi-branch billing, and cancellation races.
Suggested commands for the user after implementation:

```sh
pnpm --dir /Users/kuna/projects/matops typecheck
pnpm --dir /Users/kuna/projects/matops lint
pnpm --dir /Users/kuna/projects/matops --filter @matops/domain test
pnpm --dir /Users/kuna/projects/matops --filter @matops/api test
```

Deploy access fixes with the affected readers before changing list visibility.
Verify one owner, instructor, student, pending coach, suspended instructor, and cross-branch student/staff person in the UI.
Apply reviewed billing cleanup separately. Avoid a database migration unless confirmed dual enrollment requires a separate stored relationship.

## Implementation notes

- Read-only review query: [staff-membership-review.sql](/Users/kuna/projects/matops/packages/db/scripts/staff-membership-review.sql). Run with an authorized administrative database connection. It writes no data. It has not run against deployed data.
- Existing charges remain until the gym reviews an assignment. No billing cleanup was applied.
- Correction learned: pending students can have the placeholder role `member`. Classify pending requests using invitation intent as well as approved roles.
