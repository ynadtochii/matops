# Goal

Prepare MatOps for the first real academy. Simplify memberships, complete daily workflows, and provide one navigation experience.

## First-academy release, approved 2026-09-07

Status: core implementation complete. Privacy facts, manual acceptance, migration rehearsal, restore rehearsal, and user-run tests remain open.

This section is the active release plan. It supersedes earlier restrictions against legacy dues removal and account-independent students. Earlier URL preservation means retaining working deep links through redirects where routes change. Database organization and branch boundaries remain in place.

### Decisions

1. Keep scheduling, booking, visitors, attendance, member management, staff permissions, and shared memberships as the release core.
2. Use shared memberships everywhere. Remove legacy branch dues after discovering all dependencies. Keep membership enforcement separate from the choice of payment model.
3. Let staff create student records without a login. Separate the attending student from the account that signs in. Support an optional account link and a minimal guardian relationship for children. Do not require fake emails. Family discounts and household billing remain deferred.
4. Keep payments as a monthly paid/unpaid register for this release. Do not describe recorded paid flags as bank revenue. Amount-based reconciliation, partial payments, invoices, refunds, and card collection remain deferred.
5. Owners and managers may correct and finish attendance older than 14 days. Require a reason and record the actor, time, and changed values. Instructors retain the existing editing window. Apply the rule to members, visitors, and review completion.
6. Add email for cancelled or rescheduled classes, including visitors. Save pending delivery with the business change and retry failures. Keep the existing inbox and native push. This approves product implementation, not sending messages during this planning task.
7. Complete visitor booking with durable confirmation, a returnable booking page, and cancellation using the existing token mechanism.
8. Schedule shared-membership reminders and calendar extension. Record successful runs and show overdue work. Preserve current overdue-payment policy; do not introduce cancellation for ended memberships or lost coverage.
9. Add assisted student import with preview, duplicate detection, rejected rows, plan assignment, and starting paid/unpaid state. Extend export to archived students, attendance, and payment history. Reuse bulk assignment and the current CSV export.
10. Make curriculum and referrals optional. Keep general spaces disabled unless needed. Simplify the single-branch experience. Keep native publication outside the first release requirement, while preserving existing mobile support.
11. Defer new reporting, curriculum expansion, custom rank systems, and automated billing. Add hard capacity limits or waitlists only when the academy's actual booking rules require them.
12. Fill privacy contact placeholders, close current release checks, and rehearse database recovery before real registration. Measure whether staff complete daily tasks without help.
13. Provide one persistent application shell across organization and branch pages. Clicking between `/overview` and `/entities/...` must not replace navigation state or remove the other group's badges. Consolidate route layouts under that shell; do not treat matching sidebar styling as completion.
14. Keep the selected branch visible on organization pages. The selector chooses a branch, not a different navigation mode. Organization badges count authorized organization work; branch badges count the selected branch. Both update regardless of the page currently open.
15. Keep explicit branch IDs in shareable URLs and scoped API requests. Preserve independent browser tabs, role restrictions, back/forward navigation, and old deep links. A unified interface does not merge database access boundaries.
16. A clean database is available as a release option, not a task to run now. Inspect the exact target and current records before any reset. Preserve development fixtures and never assume production is empty from an older note.

### Implementation steps

- [x] Inspect current features, release documents, and both navigation shells. Record accepted scope and preserve previous work.
- [x] R0: Inventory identity, legacy dues, route layouts, badge readers, and affected callers across web, Expo, API, database, scripts, and tests. Record baseline behavior and current migration state. Choose the final route map before changing links.
- [x] R1: Separate student records from login accounts. Define account linking, guardian permissions, duplicate handling, branch enrollment, and historical references. Reuse the existing person directory. Write focused permission and account-linking coverage.
- [x] R2: Standardize on shared memberships. Remove legacy readers, writers, screens, reminders, and unused schema only after all callers use the shared model. Preserve paid history, claims, scheduled changes, staff access, and optional enforcement.
- [x] R3: Replace competing shell composition in `/Users/kuna/projects/matops/apps/nextjs/src/app/_components/app-shell.tsx` and `/Users/kuna/projects/matops/apps/nextjs/src/app/_components/organization-shell.tsx` with one persistent shell. Reuse `/Users/kuna/projects/matops/apps/nextjs/src/app/_components/shell-frame.tsx`. Move shared navigation and badge ownership above route-specific content. Remove duplicate navigation definitions after cutover.
- [x] R3: Supply both badge groups through authorized summary reads. Scope branch reads explicitly without changing the organization request scope. Keep cache keys scoped to organization and branch. Refresh affected counts after mutations and through the existing freshness policy. Distinguish loading or failed counts from a confirmed zero.
- [ ] R3: Verify the screenshot case: branch Roster and Coaches badges remain present on organization pages; organization People and Memberships badges remain present on branch pages. Resolve an item from either area and confirm the matching badge updates. Verify zero/one/many branches, rapid switching, expired access, two tabs, deep links, mobile drawer, and keyboard focus.
- [ ] R4: Implement approved historical attendance corrections with reasons and change history. Preserve changed-roster detection and stale-submit rejection. Complete outstanding attendance browser checks.
- [ ] R5: Persist notification delivery work with class changes. Add retryable email delivery for members and visitors. Finish visitor confirmation and cancellation. Verify duplicate requests, process failure after commit, expired tokens, changed times, and cancelled classes.
- [ ] R6: Schedule membership reminders and calendar extension using the existing endpoints. Verify safe retries, delayed jobs, time zones, incomplete batches, and visible failures. Keep overdue cancellation behavior explicit and unchanged.
- [ ] R7: Build assisted import and complete exports. Preview before writes, match duplicates explicitly, report rejected records, and preserve original history. Verify exports include the intended full record set rather than only the current filtered screen.
- [ ] R8: Make optional modules opt-in and simplify single-branch setup/navigation. Keep the core tools easy to reach. Fill privacy identity and contact details from the operator's real information.
- [ ] R9: Close student membership selection and staff separation acceptance checks alongside the new work. Walk a complete academy week: import, assign, book, cancel, notify, attend, confirm payment, and correct mistakes. Rehearse restore against an isolated target. Record task completion without assistance.
- [ ] R9: Run lint/typecheck, inspect final changes, and hand over exact focused test commands. Do not run tests unless explicitly requested. Update spec, architecture, ADRs, roadmap, and changelog with implemented behavior. Old successful checks do not verify new work.

Dependencies: R0 precedes implementation. R1 precedes import and final identity-dependent changes. R2 precedes final reminder wiring. R3 and R4 can proceed independently after discovery. R5 precedes public visitor launch. R9 gates release.

### Current step

R9 release checks. Add the real privacy operator details, run the manual browser and device journeys, rehearse the staged migration and restore, then run the focused test commands.

### R0 record

- Identity baseline: `user` is both the login account and student profile. Branch enrollment, shared assignments, purchases, attendance, directory URLs, booking, and check-in use account IDs. No guardian model exists.
- Identity direction: add one organization person record with an optional unique account link. Move student subject references to person IDs. Keep staff actor and login fields on account IDs. Resolve guardian actions with an explicit person target and permission check.
- Legacy dues baseline: `membership_plan`, `member_dues`, `payment_claim`, and `payment_settings` remain active behind `entity.membership_enforced_at`. Normal readers and writers still exist in web, Expo, API, database helpers, reminders, seeds, erase, and reports.
- Legacy dues risk: `packages/db/scripts/2026-09-04-alma-onto-shared-memberships.sql` deletes payment history and uses an index removed by migration `0065`. Do not run it. Replace it with a history-preserving conversion before R2 removes old tables.
- Route map: keep organization paths at `/overview`, `/people`, `/memberships`, and `/settings`. Add `branch=<authorized branch id>` as selected-branch state. Keep `/entities/<branchId>/...` unchanged. Preserve `/staff` and `/profile` through redirects that retain a valid branch.
- Shell direction: mount one persistent shell under the authenticated app layout. Keep organization calls unscoped by branch headers. Add one authorized summary query keyed by organization and selected branch. Return separate ready, loading, failed, and unavailable badge states.
- Operations baseline: historical attendance has a fixed 14-day write limit and no audit table. Class notices run after commit without durable retry. Visitor tokens are returned by the API but dropped by the booking page. Only the legacy reminder route is scheduled. Export uses the filtered branch roster. Curriculum and referrals are always on for BJJ branches. Privacy text still has placeholders.
- Development database verification: the project verifier reported 67 of 67 journal entries applied through `0068`, 27 users, and one organization. Production migration and data state remain unverified.
- Release order remains R1, R2, then R3-R8 by dependency. R9 remains the release gate. No database reset, production write, deploy, message, or test run occurred during R0.

### Lessons Learned

A shared-looking sidebar is not a unified navigation experience. Review state ownership, route layouts, and both badge groups from every route family. Adding a requirement preserves the rest of the approved release scope.

## Previous implementation record

The sections below describe earlier work and its verification. Where their scope differs, the approved first-academy release above takes precedence. Checked items below do not mark the new release steps complete.

Make organization and branch work clear and complete for owners, managers, coaches, and students. Keep the current data boundaries. Fix permissions, membership workflows, navigation, and task completion across web and mobile.

## Status and baseline

Product decisions approved on 2026-09-06. This is the technical implementation plan. No application changes are part of this planning task.

Baseline: PR #6, `dev` into `main`, commit `b237f03`. GitHub access confirmed that the reviewed local commit matches the PR.

The previous PLAN.md described the v7.4-v7.6 organization pivot. Its final status said built but not fully verified, although its checkboxes remained unchecked. Preserve that work as the baseline, not a new implementation queue. The detailed record remains in [EPIC.md](/Users/kuna/projects/matops/EPIC.md), [owner-dashboard-plan.md](/Users/kuna/projects/matops/docs/owner-dashboard-plan.md), and [general-branches-memberships-plan.md](/Users/kuna/projects/matops/docs/general-branches-memberships-plan.md).

Already present in the reviewed code:

- Organization-only registration and a valid zero-branch setup state.
- Typed BJJ and general-space branches, with shared memberships on new branches.
- Organization People, person profiles, Memberships, Staff, Settings, and overview metrics.
- Plan prices and effective-month price history, payment claims, bulk assignment, and coverage repair.
- Organization manager permissions, setup checks, shared product language, and product measurement.

Outstanding baseline verification remains open: manual web journeys, role checks, Expo device checks, and user-run tests. Earlier records say migrations 0060-0064 were applied to dev. Recheck live migration state before release; this plan does not certify it. The earlier general-branch backfill, any paid-commitment record, and the delayed bank-details drop also need status checks. Do not rerun them from an old checkbox. Do not assume production is empty.

## Decisions

1. The organization owns shared people, plans, payment records, and business settings. Branches own schedules, attendance, local admission, and local records.
2. An active organization manager can run daily work at every branch without a separate branch membership. Never represent that manager as an owner.
3. Owners retain ownership changes, commercial account changes, branch creation/deletion, permanent erasure, and legacy membership activation. Managers can manage schedules, attendance, local members, instructor assignments, and ordinary branch settings. Instructors remain restricted to assigned branches.
4. Changing a person's plan replaces one selected membership from the first day of next month, in the organization's membership time zone. The old plan stays valid until then. No immediate replacement, proration, refunds, or transfer of paid status.
5. Other memberships remain independent. Reject a replacement whose target plan already covers the same period; show the existing membership instead.
6. Ending membership or removing plan coverage keeps existing bookings. Show affected bookings before confirmation and in a review list afterward. Keeping a booking does not restore eligibility for new bookings.
7. This decision does not change existing overdue-payment, branch archive, class cancellation, or capacity rules. The overdue sweep must not cancel a booking solely because a plan ended or its coverage changed.
8. Staff becomes a tab inside People. The organization person profile handles branch assignments and approvals. Branch role, rank, attendance, notes, and suspension records keep their current owners.
9. Keep gym management links visible inside branch workflows. Keep the selected branch visible, and preserve the current task when switching to a compatible branch.
10. Add plan coverage and enroll eligible existing holders through one confirmed workflow. Preserve pending, suspended, archived, and removed branch states. Show named exceptions and retry only unfinished work.
11. Keep one branch level. Improve its explanation; do not add locations, rooms, resources, or new branch types in this release. Programs remain within branches.
12. No tests run during agent sessions unless the user explicitly asks. Write focused tests, run lint/typecheck, and hand the user exact test commands.

## Technical boundaries

- Keep entity IDs in web URLs and `x-matops-entity`. Do not move branch selection into shared session state.
- Keep database row-level security, which limits each query to its allowed organization or branch. Cross-branch reads use the existing scoped-read pattern.
- Reuse domain predicates, membership access resolution, notification delivery, and shared shell components. No new state or UI library is needed.
- Keep current URLs where possible. Redirect `/staff` to `/people?tab=staff`. Do not introduce a second person database.
- Keep legacy dues migration controls out of normal new-branch workflows. Do not remove legacy tables or run the reserved bank-details drop as part of this UI work.
- Follow [delivery.md](/Users/kuna/projects/matops/docs/delivery.md). Record changed behavior in the spec and supersede old decisions with a new ADR, a decision record, rather than rewriting history.

## Implementation steps

### 0. Record contracts and map affected callers

Dependencies: none.

- [x] Add the next available ADR under `/Users/kuna/projects/matops/docs/issues`. Supersede the separate coverage repair action, organization Staff navigation, and manager branch-access rules.
- [x] Update [spec.md](/Users/kuna/projects/matops/docs/spec.md) and [roadmap.md](/Users/kuna/projects/matops/docs/roadmap.md) with this release's behavior and per-slice status. Preserve earlier verification gaps.
- [x] Inventory all authorization tiers, `isOwner`/`isStaff` checks, assignment queries, coverage readers, reminders, and cancellation sweeps across all file types. Include API, web, Expo, scripts, and tests.
- [x] Create a capability matrix for owner, organization manager, branch instructor, student, pending member, and unrelated user. Classify each operation explicitly before changing guards.
- [ ] Record baseline manual scenarios and current API results for denied actions, future bookings, and historical payment amounts.

Acceptance: every changed operation has a named capability and an identified reader/writer. No broad role replacement or unchecked assignment reader remains in the inventory.

### 1. Give managers consistent branch capabilities

Dependencies: 0.

Files: [access.ts](/Users/kuna/projects/matops/packages/domain/src/access.ts), [entity.ts](/Users/kuna/projects/matops/packages/domain/src/entity.ts), [trpc.ts](/Users/kuna/projects/matops/packages/api/src/trpc.ts), [entity router](/Users/kuna/projects/matops/packages/api/src/router/entity.ts), and affected membership, invite, schedule, settings, and attendance routers.

- [x] Extend the resolved request context with effective operational capabilities. An active organization manager can enter every live branch in that organization.
- [x] Preserve the person's branch membership and training status separately. Management access must not enroll the manager as a student or make them an instructor choice automatically.
- [x] Allow operational actions without a local member ID where the action acts on another person or the branch. Keep personal training actions on their existing membership requirements.
- [x] Add a focused branch-management procedure tier where needed. Keep owner-only checks for protected actions, including direct API calls and Better Auth endpoints.
- [x] Derive navigation and action visibility from the same capability rules. Remove owner-only copy from actions managers can use.
- [x] Ensure removing or suspending organization manager access takes effect on the next request. Preserve any separate branch access they still hold.

Acceptance: a manager with no branch row can run the schedule and member workflow. They cannot create an owner, erase a person, delete a branch, or change the commercial account. Access to another organization always fails.

### 2. Make plan coverage updates one complete workflow

Dependencies: 0-1.

Files: [accessPlan router](/Users/kuna/projects/matops/packages/api/src/router/accessPlan.ts), [access-plan domain](/Users/kuna/projects/matops/packages/domain/src/access-plan.ts), [validators](/Users/kuna/projects/matops/packages/validators/src/access-plan.ts), [memberships screen](/Users/kuna/projects/matops/apps/nextjs/src/app/_components/memberships-screen.tsx).

- [x] Combine coverage preview, confirmation, coverage save, and eligible holder enrollment. Reuse the existing assignment/reconcile helpers.
- [ ] Include people gaining or losing access, local-state exceptions, and affected booked sessions. Evaluate alternative valid memberships before classifying access as lost.
- [x] Return the current coverage version with previews. Lock and recheck it during confirmation. Refuse stale edits with a refreshed preview instead of applying an outdated list.
- [ ] Keep each branch write scoped. Use bounded batches with stable progress for larger groups. Return named failures and incomplete counts; never present partial enrollment as complete.
- [x] Refresh membership displays and branch availability after success. Replace the normal `Re-check coverage` button with retry controls only when unfinished work exists.
- [x] Keep retries safe after refresh or request failure. Recompute missing enrollment from current state; never duplicate memberships or restore restricted states.

Acceptance: adding sauna coverage is one user workflow. Existing eligible holders gain branch access without a second setup action. Exceptions remain visible until resolved.

### 3. Add next-month plan replacement

Dependencies: 0 and the shared coverage/enrollment helpers from 2.

Files: [access schema](/Users/kuna/projects/matops/packages/db/src/access-schema.ts), [accessPlan router](/Users/kuna/projects/matops/packages/api/src/router/accessPlan.ts), [membership access reader](/Users/kuna/projects/matops/packages/api/src/membership-access.ts), [membership status](/Users/kuna/projects/matops/packages/api/src/membership-status.ts), [membership sweep](/Users/kuna/projects/matops/packages/api/src/membership-sweep.ts), and [person screen](/Users/kuna/projects/matops/apps/nextjs/src/app/_components/organization-person-screen.tsx).

- [x] Use date-bounded assignment records: existing `startMonth` and nullable exclusive `endMonth`. Never change an old assignment's plan ID to implement replacement.
- [x] Allow separate historical periods for the same user and plan. Replace the current lifetime unique constraint with a partial unique index on `(planId, userId, startMonth)` for non-cancelled rows. Serialize assignment changes on the organization member record and reject overlapping live periods for the same plan.
- [x] Add an assignment-change history table: source, target, effective month, previous source end month, actor/time, and cancellation actor/time. Derive pending/applied from the calendar. Include schema exports and explicit erase handling.
- [x] Add same-organization foreign keys, same-person validation, month-boundary checks, indexes, and row-level security coverage. Keep existing rows open-ended without a data rewrite. Use a new structure-only migration after the current journal head.
- [x] Add one pure function that decides whether an assignment applies in a requested month. Use it in every access, payment, claims, metrics, reminder, roster, and sweep reader identified in step 0.
- [x] Add `previewChange`, `scheduleChange`, and `cancelScheduledChange` procedures. Compute next month on the server from the membership calendar. Lock source and target decisions in one transaction.
- [x] Scheduling ends the source at next month and creates the successor starting then. Preserve the current month's amount, paid flag, claims, and audit rows. The successor starts with no copied payment record.
- [x] Prepare missing branch enrollment using the approved coverage workflow. Enrollment must not grant paid-plan access before the successor starts. Existing local restrictions remain.
- [x] Before the change starts, let staff cancel it atomically: cancel the never-started successor and restore only the source end date set by that change. Preserve the record of the cancelled change. Reject conflicting later edits. After the boundary, offer a new next-month replacement instead of undoing history.
- [x] Reject archived target plans and overlapping target memberships with a useful link. Refuse target-plan archiving while a pending replacement depends on it. Link to the affected changes. Historical assignments remain immutable; ordinary assignment must create a new period when an earlier one ended.
- [x] If staff pause or end the source before its scheduled replacement, show the pending change and require its cancellation in that same action. Do not silently allow a successor to restore access.
- [x] Show current plan, next plan, effective date, next-month amount, and affected branches on web and Expo membership surfaces. Keep `Add membership` for an additional independent plan.
- [x] Enforce dates at read time, including both booking time and session time. A delayed or failed cron job must not extend the old plan or activate the new plan early. Audit the existing `now` and `atSession` checks without weakening payment gates.

Acceptance: exactly the intended plan applies on either side of the month boundary. Old receipts and claims are unchanged. Duplicate submissions create one scheduled change. Returning to a previously held plan preserves its earlier history.

### 4. Show bookings needing review without cancelling them

Dependencies: 2-3.

Files: [membership access reader](/Users/kuna/projects/matops/packages/api/src/membership-access.ts), [accessPlan router](/Users/kuna/projects/matops/packages/api/src/router/accessPlan.ts), [stats router](/Users/kuna/projects/matops/packages/api/src/router/stats.ts), [membership sweep](/Users/kuna/projects/matops/packages/api/src/membership-sweep.ts), and organization overview/person screens.

- [x] Add a scoped, paginated read for future booked sessions whose branch is no longer covered at session time. Include scheduled coverage loss, branch restrictions, and a clear reason without conflating them with unpaid months.
- [x] Reuse the same rule for mutation previews and the ongoing review list. Include member, branch, session date, and a direct destination to inspect the booking.
- [x] Derive review items from current bookings and access. Do not add a duplicate booking status or a permanent task table just to show this list.
- [x] Keep reservations, capacity, and attendance history unchanged when coverage changes or an assignment ends. No cancellation notification is sent for a booking that remains booked.
- [x] Existing staff cancellation remains available through the existing class workflow. Restored coverage or a manually cancelled booking removes the corresponding review item by derivation.
- [x] Update the overdue sweep to respect assignment periods. Preserve its existing unpaid-month behavior, but prevent expired source assignments from cancelling bookings kept under this decision.

Acceptance: coverage loss changes zero booking rows. Affected reservations remain visible until the access issue resolves, staff cancels them, or the session passes.

### 5. Keep gym and branch navigation available together

Dependencies: 1.

Files: [shell frame](/Users/kuna/projects/matops/apps/nextjs/src/app/_components/shell-frame.tsx), [organization shell](/Users/kuna/projects/matops/apps/nextjs/src/app/_components/organization-shell.tsx), [app shell](/Users/kuna/projects/matops/apps/nextjs/src/app/_components/app-shell.tsx), [selector](/Users/kuna/projects/matops/apps/nextjs/src/app/_components/entity-selector.tsx), and [route rules](/Users/kuna/projects/matops/packages/domain/src/entity.ts).

- [x] Extend the existing frame to render grouped navigation. Owners/managers see `Gym management` and the current branch's work. Students and branch instructors see only their allowed tools.
- [x] Label settings `Gym settings` and `Branch settings`. Rename the selector's organization destination `Gym overview`; it must not imply a filter on the current screen.
- [x] With one branch, show its name without a redundant branch picker. Keep gym management reachable. Put `Add branch` in gym management for owners.
- [x] Preserve compatible route and schedule-date filters when switching branches. Clear branch-owned person, class, and session IDs. Unsupported destinations fall back to the destination branch's home.
- [x] Keep old deep links, browser back/forward, and two independent branch tabs working. Organization queries must not inherit the previous entity header.
- [x] Define narrow-screen navigation using the existing drawer/More pattern. Do not put every grouped link into the bottom tab bar. Verify focus order and current-page labels.
- [ ] Owners/managers entering the app without a deep link land on the actionable gym overview. Coaches land on their branch's current schedule; students keep the schedule landing. Preserve explicit incoming destinations.

Acceptance: an owner can reach shared payments from a branch without discovering a second hidden menu. Switching schedules preserves the date but never shows the previous branch's classes.

### 6. Consolidate People, Staff, and person tasks

Dependencies: 1, 3, 5.

Files: [people screen](/Users/kuna/projects/matops/apps/nextjs/src/app/_components/people-screen.tsx), [staff screen](/Users/kuna/projects/matops/apps/nextjs/src/app/_components/staff-screen.tsx), [person screen](/Users/kuna/projects/matops/apps/nextjs/src/app/_components/organization-person-screen.tsx), [members](/Users/kuna/projects/matops/apps/nextjs/src/app/_components/members.tsx), [directory domain](/Users/kuna/projects/matops/packages/domain/src/member-directory.ts), and membership/invite routers.

- [x] Add URL-backed `People` and `Staff` tabs. Reuse the directory query and `staffRows` grouping. Move pending coach counts into the Staff tab and gym action list without double counting.
- [x] Redirect `/staff` to `/people?tab=staff`. Remove its separate navigation item after the redirect works.
- [x] Add branch member IDs to authorized directory results. Link `Open at this branch` to the existing `?member=` destination with the correct tab for active, pending, or archived records. Handle links to unavailable records clearly.
- [x] Show payment standing and local admission together per person: covered plan, paid/unpaid/claim pending, local approval or restriction, and next scheduled change. Keep one source for the access explanation.
- [x] Add staff branch assignment and per-branch approval actions to the person profile. Reuse branch membership rules through organization-authorized procedures with explicit target branch checks.
- [x] Limit this workflow to ordinary staff roles. Owner and organization manager role grants remain protected. Never promote someone through a plan assignment.
- [ ] Use existing invitation links for people without accounts. Offer selected-branch invite links for staff to copy; do not add unsolicited email delivery.
- [x] Keep branch-local editing available. Remove copy that sends users elsewhere for an action already present on the person screen.

Acceptance: an owner assigns an existing coach to two branches from one profile. A pending request stays a per-branch decision. Opening a student at a branch does not require another search.

### 7. Prioritize daily work and finish setup guidance

Dependencies: 4-6.

Files: [overview](/Users/kuna/projects/matops/apps/nextjs/src/app/_components/overview-screen.tsx), [memberships](/Users/kuna/projects/matops/apps/nextjs/src/app/_components/memberships-screen.tsx), [setup checklist](/Users/kuna/projects/matops/apps/nextjs/src/app/_components/setup-checklist.tsx), [setup rules](/Users/kuna/projects/matops/packages/domain/src/organization-setup.ts), and organization/stats routers.

- [x] Put `Needs attention` above organization metrics: payment claims, student requests, staff requests, uncovered members, and bookings needing review. Each item links to the exact person, filtered queue, or booking.
- [x] Reuse existing queries first. Add one bounded aggregate reader only where existing data cannot supply the action. Keep partial errors visible and successful sections usable.
- [x] Order Memberships around payment work: claims, access problems, current-month board, then plan configuration. Preserve plan creation for the empty state.
- [x] Show paid status as recorded confirmation, not verified bank revenue. Keep people counts distinct from branch enrollment counts.
- [x] Link each setup problem to the affected branch and relevant task, replacing the current first-branch guess and generic dashboard link.
- [x] Make readiness reflect branch type and actual operations. A solo owner teaching classes or a supported instructorless general session must not produce a false missing-coach warning.
- [x] Correct branch creation, person empty states, and owner-only wording. Use the existing branch-word helper. Explain that branches can be separate academies or independently bookable spaces; do not imply separate dues.

Acceptance: the overview answers what needs action today. Setup links open the unfinished task at the correct branch. Empty, loading, and failed states remain understandable.

### 8. Move mobile branch switching beside the schedule

Dependencies: 3 and shared navigation/access contracts from 5.

Files: [app header](/Users/kuna/projects/matops/apps/expo/src/components/app-header.tsx), [profile](</Users/kuna/projects/matops/apps/expo/src/app/(tabs)/profile.tsx>), [schedule](</Users/kuna/projects/matops/apps/expo/src/app/(tabs)/schedule.tsx>), and [entity store](/Users/kuna/projects/matops/apps/expo/src/utils/entity-store.ts).

- [x] Extract the existing branch selection behavior into one shared mobile action. Make the schedule/header branch name open the picker when there is a choice.
- [x] Preserve same-organization local selection and cross-organization session switching. Commit the new selection only after required session changes succeed; recover visibly on failure.
- [x] Cancel obsolete requests and prevent cached data from the prior branch appearing under the new heading. Handle rapid switches, reload, expired sessions, and revoked access.
- [x] Keep `Join another branch` separate. Remove the duplicate primary switcher from Profile once the new entry point is discoverable; retain account-level organization controls where needed.
- [ ] Show scheduled plan changes and the same access reasons as web. Test BJJ and general-space labels, long names, focus, and screen-reader labels on a device.

Acceptance: students can compare branch schedules without leaving the schedule. A failed switch keeps the previous branch consistent. A one-branch student sees no useless picker.

### 9. Cleanup, verification, measurement, and release

Dependencies: all prior steps.

- [x] Remove obsolete Staff navigation and duplicate switcher code. Keep redirects and retry support. Remove only unused code inside the changed areas.
- [x] Write focused domain, API, database, and validator tests listed below. Do not add a new test framework for layout-only changes.
- [x] Run affected lint/typecheck after each slice. Run workspace lint/typecheck at completion. Do not claim tests passed until the user or CI supplies results.
- [ ] Walk zero-branch setup, single-branch owner, multi-branch manager, branch instructor, and student flows. Verify responsive web and real-device Expo behavior.
- [ ] Measure task completion without help, time to confirm payment, time to resolve coverage, and wrong-branch actions during walkthroughs. Use a manual scorecard first; retain existing weekly-use reporting.
- [ ] Validate larger hierarchy ideas with operators who run multiple locations and spaces. Record the outcome as deferred discovery, not an unfinished schema change in this release.
- [x] Update spec, architecture, roadmap, ADR index, changelog, and this plan. Keep pilot/device checks open until performed. Do not mark an implementation checkbox complete from documentation alone.

Acceptance: every approved recommendation maps to a finished slice or an explicit deferred item. No source comments narrate edits; test files contain no comments.

## Verification matrix

| Area             | Cases to write or inspect                                                                                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permissions      | Manager without branch row; revoked manager; separate student status; assigned instructor; foreign organization; protected owner actions                                                              |
| Coverage         | Stale preview; duplicate submit; partial failure/retry; suspended and pending records; overlapping plans; closed branch                                                                               |
| Plan replacement | Month boundary in gym time zone; cron absent; current and future session checks; duplicate requests; historical target plan; target overlap; cancel pending change; pause/end source; archived target |
| Payments         | No copied paid flags/claims; immutable old amounts; new month uses target price; no reminders for ended/not-started assignments                                                                       |
| Bookings         | Coverage removal and membership end retain reservations and capacity; review list resolves; existing overdue and archive behavior still works                                                         |
| Navigation       | Zero/one/many branches; deep links; browser back; two tabs; incompatible branch type; member query changes after mount                                                                                |
| Staff            | Same person across branches; per-branch approvals; no role escalation; old `/staff` URL                                                                                                               |
| Mobile           | Same/cross organization; failed or rapid switch; stale requests; revoked branch; device accessibility                                                                                                 |

Extend existing tests where possible. New date-period rules belong in a focused domain test. New database constraints need row-level security and period tests. Use the existing test file patterns, without running them during implementation sessions.

Commands to run during implementation:

```bash
pnpm --dir /Users/kuna/projects/matops lint
pnpm --dir /Users/kuna/projects/matops typecheck
```

Focused commands for the user after implementation. The new files are
`packages/api/test/manager-branch-access.test.ts`,
`packages/api/test/membership-plan-change.test.ts` and
`packages/api/test/booking-review.test.ts`; the rest were extended.

```bash
pnpm --dir /Users/kuna/projects/matops -F @matops/domain test test/access.test.ts test/entity-routes.test.ts test/access-plan.test.ts test/member-directory.test.ts test/membership-access.test.ts test/membership-month.test.ts test/organization-setup.test.ts test/post-login-target.test.ts
pnpm --dir /Users/kuna/projects/matops -F @matops/api test test/manager-permissions.test.ts test/manager-branch-access.test.ts test/entity-authorization.test.ts test/access-plan.test.ts test/membership-plan-change.test.ts test/booking-review.test.ts test/membership-assignment.test.ts test/membership-access-reader.test.ts test/membership-cancellation-sweep.test.ts
pnpm --dir /Users/kuna/projects/matops -F @matops/db test test/membership-access-rls.test.ts test/erase-coverage.test.ts test/rls-coverage.test.ts
pnpm --dir /Users/kuna/projects/matops -F @matops/validators test test/plan-pricing.test.ts
```

Do not run full suites by default.

## Rollout and rollback

1. Refresh the PR base and dev environment state. Confirm the outstanding baseline checks and migration journal before changing data.
2. Deliver authorization and coverage fixes as complete slices. Navigation may proceed alongside scheduled membership work after capability contracts are stable.
3. Deploy period-aware readers before exposing scheduled replacements. The schema change is additive first; relax the old lifetime unique constraint only with all writers protected against overlap.
4. Ensure web, Expo readers, reports, and sweeps all understand periods before enabling the replacement action. No worker is required for a date boundary.
5. Do not roll back to a reader that ignores periods after scheduled assignments exist. Keep compatible readers and hide the new action if rollback is needed.
6. Verify dev with the role and journey matrix. Production deployment is a later task; this planning request does not authorize a merge or deployment.
7. Preserve the separate delayed legacy bank-details drop and data-retention work. Do not bundle destructive migrations into this release.
8. Keep mobile support claims tied to completed device checks. Pilot pricing commitments and location hierarchy discovery remain separate from technical completion.

## Deferred scope

- A third location/room hierarchy level, all-branches student calendar, resource inventory, and new branch types.
- Immediate plan replacement, partial-month charges/refunds, automatic payment collection, and credit transfer.
- Automatic cancellation caused by membership ending or coverage removal.
- Legacy table deletion, shared curriculum, cross-branch referrals, and general-space public visitor booking.

## Open questions

None for the approved product scope. Technical preflight checks in step 0 are implementation work, not requests for another product decision.

## Current step

Steps 0 to 9 are built. `pnpm typecheck` is 17/17 and `pnpm lint` is 15/15 at the workspace root. **The suites were run at the user's request** (2026-09-06, twice): `pnpm test` is **green, 1611 tests across 130 files**. It had 25 failures on the baseline commit `b237f03`; this release fixed every one and introduced none. Migration `0065` is **applied to dev** (64 of 64 against `_journal.json`) and verified live: the period columns and indexes, the change table with its RLS policy and grants, and no existing assignment rewritten.

Left open, and why:

- The baseline manual scenarios, the role and journey walkthroughs, the Expo device checks, the task-completion measurement and the location-hierarchy discovery are human work.
- Two small pieces of the approved scope are deliberately not built and are named in the unticked boxes above: bounded batches for coverage runs (the loop reports named failures and an incomplete flag, so nothing is presented as complete, but it does not page), and the coach landing on their branch's schedule rather than its dashboard. The coverage preview also shows gains and losses without the affected bookings; the plan-change preview does show them, through the same `bookingsToReview` reader.

## Attendance review, approved 2026-09-07

Goal: let owners check every past class and finish attendance from one list.

Decisions:

- Show all unfinished past classes, oldest first, including empty and partly marked classes.
- Require explicit completion after every active member and visitor has a mark.
- Allow an explicit nobody-attended confirmation when there are no present or unmarked people.
- Store who reviewed the roster, when, and its signature. A changed roster needs another review.
- Keep existing records unreviewed. Exclude cancelled, deleted, future, and running classes from the queue.
- Reuse branch navigation, add date and status filters, and page the list.
- Historical correction policy is approved in the first-academy release above: owners and managers may correct older records with a reason and history. Instructors retain the existing window. Implementation remains pending.
- Preserve unrelated working-tree changes. Do not run tests, commit, or deploy.

Implementation steps:

- [x] Inspect current attendance, dashboard, permissions, and all roster writers.
- [x] Add pure review rules, schema migration, scoped API reads and completion, and focused tests.
- [x] Build the review list, shared roster completion action, and dashboard summary.
- [ ] Resolve historical correction permissions and apply them consistently.
- [x] Update product and architecture docs. Run lint/typecheck and inspect the diff.

Current step: implement the approved historical correction policy. The existing 14-day limit still applies in code until implementation.

Verification: workspace typecheck passed 17/17 and lint passed 15/15. Migration 0068 applied to dev; database verification passed 67/67 migration entries and branch data permissions. Focused regression tests written, not run. Browser walkthrough not performed; no local app server was running. No commit or deployment.

User-run commands:

- `pnpm -F @matops/domain test test/attendance.test.ts`
- `pnpm -F @matops/api test test/attendance-writes.test.ts`

## Attendance query error, 2026-09-07

- [x] Reproduce the failing roster read against dev in a read-only transaction.
- [x] Fix the query cause and add regression coverage without running tests.
- [x] Repeat the read, run lint/typecheck, and record the lesson.

Cause: Drizzle removes direct SQL column table names from single-table selections. That made nested roster joins ambiguous and broke class-specific review counts. Nested SQL wrappers preserve the table names.

Read-only reproduction: the existing class read failed with PostgreSQL 42702, column reference id is ambiguous. After the fix, the same scoped read returned 10 member rows, 7 present and 2 absent. No data was changed. The temporary diagnostic was removed.

### Lessons Learned

After changing nested database queries, inspect the generated SQL and replay the affected read. Typecheck and lint cannot confirm database query behavior. Keep regression coverage for joins and outer-class references.

Verification: affected API and DB lint/typecheck passed, 8/8 tasks including dependency builds. Diff whitespace check passed. Regression test written but not run.

## PR 8 review fixes

- [x] Inspect cleanup ownership, membership calendars, coach details, and attendance reads.
- [x] Scope organization cleanup to the selected branch's fake users.
- [x] Use the membership policy calendar, with the default branch fallback.
- [x] Restore coach breakdowns and show attendance reviewer names.
- [x] Add regression coverage and run lint/typecheck. Do not run tests.

Lessons: organization records need explicit user ownership when cleaning one branch. Membership months must use the organization's calendar. Check existing spec requirements before removing screen content.

Verification: workspace lint passed 15/15 and typecheck passed 17/17. Diff whitespace check passed. Tests are written but not run. No browser verification, database writes, commit, or deployment.

User-run regression commands:

- `pnpm -F @matops/db test test/seed-fill.test.ts`
- `pnpm -F @matops/api test test/attendance-writes.test.ts`
