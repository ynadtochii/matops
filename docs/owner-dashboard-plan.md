**The owner level: one shell, one bank account, branch dues retired. Implementation plan**

Date: 2026-09-04. Status: product decisions settled by the owner, ADR not yet written, not implemented.

**Documentation links**

Step by step detail, and the corrections this file needs: [the detailed plan](/Users/kuna/projects/matops/docs/owner-dashboard-detailed-plan.md). Tenant model: [ADR 124](/Users/kuna/projects/matops/docs/issues/124-the-organization-owns-typed-entities.md). Shared memberships: [ADR 126](/Users/kuna/projects/matops/docs/issues/126-a-branch-is-not-always-a-mat.md) and [its run file](/Users/kuna/projects/matops/docs/general-branches-memberships-plan.md). Legacy branch dues: [ADR 40](/Users/kuna/projects/matops/docs/issues/40-manual-transfer-payments.md) and the gate in [ADR 82](/Users/kuna/projects/matops/docs/issues/82-membership-booking-gate.md). Product rules OD1-OD7 go in [spec](/Users/kuna/projects/matops/docs/spec.md) at slice 0.

This file is the run file. Each unchecked box is one run of a loop.

**Read the detailed plan's Corrections table before working any box.** Nine boxes have a smaller or a different shape than the one written here, because the code already carries part of the work: 2.3, 2.4, 2.5, 2.7, 3.2, 4.1, 4.5, 5.1 and 5.2.

**Goal**

The owner runs the business from one place. The organization level gets its own navigation, one bank account, a way for a member to say "I paid" for a membership month, a staff view across branches, an announcement to every branch, and the switch that moves a branch onto shared memberships. Once a branch is on shared memberships, its own Payments screen is gone.

**Decisions from the owner, 2026-09-04**

| Decision        | Agreed behavior                                                                                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Curriculum      | Stays per branch. Not moved, not shared.                                                                                                                                                                       |
| Bank account    | One per organization. The legacy branch dues screen reads it too. `payment_settings.bank_details` becomes dead and is dropped in a later deploy.                                                               |
| Branch Payments | Retired at activation. An activated branch has no owner Payments item; students see their membership standing instead. Non-activated branches keep the legacy screen until the owner flips them.               |
| Activation      | The owner flips a branch from organization Settings, after a preview of who loses booking access. No more hand-run script.                                                                                     |
| Scope kept out  | Logo upload (no file storage in the stack), deleting an organization (the branch danger zone stays), referrals across branches, a leads roll-up, shared curriculum library, an organization-level invite list. |

**What exists today**

| Area               | Evidence                                                                                                                                                                                                                                         | Consequence                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Organization pages | `apps/nextjs/src/app/(app)/overview`, `people`, `memberships`; links by hand in `overview-screen.tsx:58-61` and `entity-selector.tsx:101`                                                                                                        | No shared shell, no organization Settings, no badges                               |
| Entity shell       | `apps/nextjs/src/app/_components/app-shell.tsx:234` builds nav from `NavItem[]` at `:340-407`, every href through `entityHref`                                                                                                                   | The frame can be reused; the item list and badges are entity-bound                 |
| Grace and calendar | `membership_policy` in `packages/db/src/access-schema.ts:160`, edited on `memberships-screen.tsx:273` "Months and grace" through `accessPlan.policy` / `setPolicy`                                                                               | The organization record that should also hold the bank account                     |
| Bank details       | `payment_settings.bank_details` per entity, `packages/db/src/payments-schema.ts:175`; read by `payments.myDues` at `router/payments.ts:425`; edited through `getRequisites` / `updateRequisites` at `:196` / `:227` and `payment-requisites.tsx` | Shared memberships show no account to pay into                                     |
| Member standing    | `accessPlan.mine` at `router/accessPlan.ts:826` via `membershipStanding` in `packages/api/src/membership-status.ts:77`; shown by `membership-notice.tsx` on web and `MembershipNotice` in `apps/expo/src/app/(tabs)/profile.tsx:174`             | Shows month, status and deadline; no bank details, no "I paid"                     |
| Months             | `membership_month` at `access-schema.ts:205`, paid flag with `recorded_by`; corrections audited in `membership_month_audit`; owner marks through `accessPlan.markMonth` at `:594`, board at `:666`                                               | No claim column, no claims queue                                                   |
| Activation         | `entity.membership_enforced_at` at `entity-schema.ts:56`; read by `payments-gate.ts:52`, `router/membership.ts:317`, `booking.ts:127`, `payments.ts:439`; no procedure writes it                                                                 | Activation is a hand-run script                                                    |
| Branch Payments    | `payments-screen.tsx:34` picks `MyDues`, `BranchMemberships` (activated) or `OwnerPayments`; nav item at `app-shell.tsx:381` shows for owners always                                                                                             | Half retired: the activated branch still shows a page with bank details and a link |
| Staff              | `entity_membership` roles per branch; `coaches-screen.tsx` with `membership.staff`, `stats.coaches`, `invite.list`; pending coaches through `isPendingCoach` in `packages/domain/src/membership.ts`                                              | No cross-branch view                                                               |
| Announcements      | `notification.announce` at `router/notification.ts:98`, `announcementTargets` at `:15`, `notifyAnnouncement` in `packages/api/src/notify.ts:246`; `notification` rows are per entity                                                             | One branch at a time                                                               |
| Organization reads | `stats.organization` / `organizationMembers` / `organizationMetrics` at `router/stats.ts:651-719`: owner check first, then one scoped transaction per entity, combined by a pure function                                                        | The pattern every new organization read follows                                    |
| Dues reminder cron | `packages/db/src/reminder.ts` reads `member_dues` cross-academy                                                                                                                                                                                  | Must skip activated branches; check at slice 4                                     |

**Target design**

1. One organization shell.

   A route group `(app)/(organization)/` holds `overview`, `people`, `memberships`, `staff` and `settings`. URLs do not change; a route group adds no path segment. Its layout renders the same frame as the entity shell with an organization item list: Overview `/overview`, Members `/people`, Memberships `/memberships`, Staff `/staff`, Settings `/settings`. A non-owner sees Overview only, which is the branch list they already get. The entity selector shows "All branches" as current. The frame is one component with two item lists, not a copy of `app-shell.tsx`.

   Badges: Memberships carries open claims, Staff carries pending coach requests across branches. Both come from organization procedures, so they arrive with slices 3 and 5.

2. One bank account, one Settings page.

   `membership_policy` gains `bank_details`. The organization Settings page edits the organization name, the bank details, and grace with the calendar time zone, which move here from the Memberships page. The same page lists every branch with the shared-memberships switch (section 4).

   Every reader of bank details reads the organization row: `membershipStanding` for shared memberships, `payments.myDues` for legacy dues. The per-student reference for a membership month is derived at read time from the plan name and the assignment id, the way `paymentReference` in `packages/domain/src/payments.ts:111` derives it today. The branch editor, its two procedures and `payment-requisites.tsx` go. `payment_settings.bank_details` is dropped one deploy later.

3. A member says "I paid" for a month.

   `membership_month` gains `claimed_at`. A member claims the current month or the month of a mid-month join; the row is created unpaid if it does not exist, with `claimed_at` set. Claiming twice is one claim. The owner confirms (`markMonth` paid, which clears `claimed_at`) or rejects (clears `claimed_at`, nothing else; the member can claim again). The Memberships page shows open claims above the month board, one row per person and month with the plan name. Both clients show the button beside the standing they already show, disabled only while the request is in flight (v6.6). Not stored: an amount. The tracker records that somebody said they paid, not money.

4. Activation from the owner's screen.

   `entity.setMembershipEnforced` takes an entity id and on or off, owner only, organization-scoped. Before flipping on, a preview names how many active members at that branch hold no assignment covering it, because those people stop being able to book. Flipping off is allowed and is ADR 126's rollback level 2. On an activated branch the owner's Payments item disappears; the student item is labelled Membership and renders the standing notice with bank details and the claim button. `OwnerPayments` on a non-activated branch gains one line pointing at organization Settings.

5. Staff across branches.

   `stats.organizationStaff` reads each entity in its own scope, keeps owner and instructor rows plus pending coach requests, and groups by user id in a pure `staffDirectory` beside `member-directory.ts`. One row per person with a role badge per branch and a pending marker. Approve, promote and set role stay on the branch Coaches page, reached by the badge, the same rule as GB5. Instructor invite links stay per branch.

6. Announce to every branch.

   `notification.announceAll` takes the existing announce input plus the branches to reach, default all. Recipients are resolved per entity in its own scope. A person at two branches gets one inbox row per branch and one push. The pure rule, which rows and which single push per user, lives in `packages/domain/src/notify.ts` with a test. The composer is the existing one from `notifications-screen.tsx`, opened from the organization shell with a branch multi-select and a recipient count.

**Slice 0. Lock contracts**

- [x] 0.1 Write ADR 127 with sections: why, one shell, one bank account, the claim, activation as a procedure, staff and announcements as organization reads, what this does not authorize, rollout. Add it to `docs/map.md`.
- [x] 0.2 Add OD1-OD7 to `docs/spec.md` as planned: OD1 organization shell, OD2 one bank account, OD3 membership claim, OD4 activation from Settings, OD5 branch Payments retired, OD6 staff directory, OD7 announce to every branch. Add the row to `docs/roadmap.md`. Link from `docs/architecture.md` §0.
- [x] 0.3 Caller inventory. Grep every reader of `payment_settings.bank_details`, `getRequisites`, `updateRequisites`, `PaymentRequisites`, `membershipEnforcedAt`, and every link to `/overview`, `/people`, `/memberships`. Recorded in the detailed plan, section 0.3.

**Slice 1. Organization shell**

- [x] 1.1 Extract the frame. Split `apps/nextjs/src/app/_components/app-shell.tsx` into a presentational frame taking `items`, the selector and the footer, and the entity item builder that exists today. No behavior change on the entity side. `pnpm typecheck` and `pnpm lint`.
- [x] 1.2 Route group. Move `overview`, `people`, `memberships` under `apps/nextjs/src/app/(app)/(organization)/` and add its `layout.tsx` rendering the frame with the organization items. Add `staff` and `settings` pages as stubs that render `PageHeader` only. Every existing link keeps working because the paths do not change.
- [x] 1.3 Overview header. Drop the two buttons at `overview-screen.tsx:58-61` (the nav has them), keep Add branch, and change "Your academies / Pick a mat" to say gym and branches, since a branch may be a gym.
- [x] 1.4 Selector. `entity-selector.tsx:101` marks "All branches" current when the path is not under `/entities/`.

**Slice 2. One bank account and organization Settings**

- [x] 2.1 Migration `0057`. `membership_policy.bank_details text not null default ''`. Mirror in `packages/db/src/access-schema.ts`. Stamp `_journal.json` one day past `0056`.
- [x] 2.2 Fill script `packages/db/scripts/2026-09-XX-bank-details-to-organization.sql`. For each organization with an empty `membership_policy.bank_details`, copy the default entity's `payment_settings.bank_details` (the entity whose id equals the organization id), inserting the policy row if missing. Dry run first with a `select`. Hand-run on dev; production has no organizations yet, run it there only if one appears before the deploy.
- [x] 2.3 Reference rule. `packages/domain/src/membership-month.ts`: `membershipReference(planName, assignmentId)` with the same shape as `paymentReference`. Test in `packages/domain/test/membership-month.test.ts`.
- [x] 2.4 Policy API. `accessPlan.policy` and `setPolicy` in `router/accessPlan.ts:776-799` carry `bankDetails`, validated with the sanitizer `UpdatePaymentRequisitesSchema` already uses. `membershipStanding` in `packages/api/src/membership-status.ts` returns `bankDetails` and `reference` per assignment. Test in `packages/api/test/access-plan.test.ts`.
- [x] 2.5 Legacy dues read the organization row. `payments.myDues` at `router/payments.ts:425` reads `membership_policy.bank_details` instead of `payment_settings`. Remove `getRequisites` and `updateRequisites`, delete `payment-requisites.tsx`, and remove its use in `payments-screen.tsx`. Test in `packages/api/test/booking-gate.test.ts` or the payments test that covers `myDues`.
- [x] 2.6 Organization Settings screen. New `organization-settings-screen.tsx` on `(organization)/settings`: organization name through a new `organization.rename` (`organizationOwnerIdentityProcedure`, updates `organization.name` only; the default entity keeps its own name, ADR 124), bank details, and the grace block moved from `memberships-screen.tsx:273`, which keeps a link to Settings. Submit buttons disabled only while in flight.
- [x] 2.7 Both clients show where to pay. `membership-notice.tsx` and `MembershipNotice` in `apps/expo/src/app/(tabs)/profile.tsx:174` show bank details and the reference with copy buttons, the way `my-dues.tsx:142-168` does.

**Slice 3. The claim**

- [x] 3.1 Migration `0058`. `membership_month.claimed_at timestamptz` nullable. Mirror in `access-schema.ts`. Stamp `_journal.json`.
- [x] 3.2 Pure rule. `packages/domain/src/membership-month.ts`: `canClaimMonth({ paid, claimedAt, status })` and `claimableMonths(standing, now)` for the current month and a mid-month join. Test first.
- [x] 3.3 Claim API. `accessPlan.claimMonth` (`enrolledProcedure`, own assignment only, upsert unpaid with `claimed_at`, idempotent), `accessPlan.claims` (owner, open claims across the organization with person name, plan name and month), `accessPlan.rejectClaim` (owner, clears `claimed_at`). `markMonth` clears `claimed_at` when it sets paid. Test in `packages/api/test/membership-assignment.test.ts`: claim, claim twice, confirm, reject, a member cannot claim another member's month, an unpaid correction leaves no claim behind.
- [x] 3.4 Web. The button on `membership-notice.tsx`; the "Waiting for you" section above the month board in `memberships-screen.tsx` with Confirm and Reject; the Memberships badge in the organization shell from `accessPlan.claims`.
- [x] 3.5 Expo. The button in `MembershipNotice` in `profile.tsx`, invalidating `accessPlan.mine` on success, the way `MembershipDues` handles `payments.claim` at `:203`.

**Slice 4. Activation and retirement**

- [x] 4.1 Preview rule. `packages/domain/src/membership-access.ts`: `activationPreview(members, assignments, coverage)` returning who is active at the branch with no covering assignment. Test first.
- [x] 4.2 API. `entity.setMembershipEnforced` and `entity.activationPreview` (`organizationOwnerIdentityProcedure`, entity id in the input, refused for an entity of another organization before any read). Test in `packages/api/test/entity-authorization.test.ts` and `general-space-booking.test.ts`: the gate flips with the column, a foreign entity id is `FORBIDDEN`, off restores the legacy gate.
- [x] 4.3 Settings branch list. On the organization Settings page, one row per branch with the switch and the preview dialog naming the count and the first names.
- [x] 4.4 Retire the branch screen. `payments-screen.tsx`: delete `BranchMemberships`; `OwnerPayments` gains one line pointing at organization Settings. `app-shell.tsx:381-384`: hide the owner item on an activated branch, label the student item Membership there, and route it to the standing notice. `settings-screen.tsx` unchanged (it already hides the gate).
- [x] 4.5 Reminder cron skips activated branches. `packages/db/src/reminder.ts` joins `entity` at `:76`; add `membership_enforced_at is null` to the where clause. Test in the reminder test beside it.
- [x] 4.6 Expo. `MembershipDues` and the plan chooser in `profile.tsx:199-312` render nothing on an activated branch (`myDues` already returns `dues: null, canChoosePlan: false`); confirm the notice is what shows, and the dues strip in `app-shell.tsx` reads `access` from the shared resolver there.

**Slice 5. Staff across branches**

- [x] 5.1 Pure grouping. `packages/domain/src/staff-directory.ts` beside `member-directory.ts`: group owner, instructor and pending coach rows by user id, one row per person with a role per branch. Test first.
- [x] 5.2 API. `stats.organizationStaff` (`organizationOwnerIdentityProcedure`), one scoped read per entity like `readEntityDirectory` at `router/stats.ts:337`. Test beside `organizationMembers`.
- [x] 5.3 Web. `staff-screen.tsx` on `(organization)/staff`: rows with branch badges, a branch filter, the badge linking to that branch's Coaches page. Staff nav badge = pending coaches across branches.

**Slice 6. Announce to every branch**

- [x] 6.1 Pure rule. `packages/domain/src/notify.ts`: from per-entity recipient lists, the inbox rows (one per user per entity) and the push set (one per user). Test first.
- [x] 6.2 API. `announcementTargets` in `router/notification.ts:15` takes a scoped db and audience instead of `ctx`. New `notification.announceAll` (`organizationOwnerIdentityProcedure`, input audience, title, body, entity ids default all): resolve per entity, write inbox rows per entity through `notifyAnnouncement`, push once per user. `audienceCountsAll` for the button label. Test in `packages/api/test/notification.test.ts`: two branches, one person at both, two inbox rows, one push.
- [x] 6.3 Web. Extract the composer from `notifications-screen.tsx`, open it from the organization shell header with a branch multi-select and the count.

**Slice 7. Release**

- [x] 7.1 Static gates. `pnpm typecheck` and `pnpm lint` at the root. Hand the user the test commands at the end of this file.
- [x] 7.2 Migrations on dev, then `pnpm -F @matops/db verify`, applied count 59 against `_journal.json`. Run the fill script from 2.2 with its dry run first.
- [ ] 7.3 Walk the pilot organization on dev: one shell, the bank details on a shared membership, a claim from the web profile, confirm on Memberships, flip a branch on and off, the staff page, one announcement reaching two branches once per phone.
- [x] 7.4 Definition of Done. `docs/spec.md` OD1-OD7 to as-built, `docs/architecture.md` §0, `docs/roadmap.md`, `CHANGELOG.md`, and the outcome section appended to ADR 127.
- [ ] 7.5 The later deploy. After 7.4 is on production, migration `0059` drops `payment_settings.bank_details`. Not before: the old code serves for the length of a build.

**Migration and rollout**

Migrations `0057` and `0058` add one nullable or defaulted column each, structure only. `0059` is a drop and ships one deploy later. The fill in 2.2 is a hand-run script with a dry run. No flag: every slice is additive until 4.4, and 4.4 changes only branches an owner has flipped. Rollback of a flipped branch is the same switch turned off, which restores the legacy gate; rollback of the shell is a revert, since no data moved for it.

**Acceptance and verification**

| Case                                                                                                              | How                                                                         |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| A non-owner opening `/staff` or `/settings` gets the no-access state and learns no sibling branch exists          | AUTO: entity-authorization test on the new procedures; manual for the pages |
| Bank details are read from `membership_policy` by both the shared and the legacy path                             | AUTO: 2.4 and 2.5 tests                                                     |
| The fill copies the default entity's account and a second run writes nothing                                      | manual, dev                                                                 |
| A member claims once, twice, and sees one open claim; the owner confirms and the month is paid with no claim left | AUTO: 3.3                                                                   |
| A member cannot claim another member's month                                                                      | AUTO: 3.3                                                                   |
| Reject clears the claim and the member can claim again                                                            | AUTO: 3.3                                                                   |
| Flipping a branch on makes the shared resolver decide bookings there; off restores the legacy gate                | AUTO: 4.2                                                                   |
| A foreign entity id in `setMembershipEnforced` is `FORBIDDEN` before any read                                     | AUTO: 4.2                                                                   |
| The dues reminder never writes for an activated branch                                                            | AUTO: 4.5                                                                   |
| The owner item Payments is absent on an activated branch and present on the others                                | manual                                                                      |
| Staff at two branches is one row with two badges                                                                  | AUTO: 5.1                                                                   |
| One person at two branches gets two inbox rows and one push from `announceAll`                                    | AUTO: 6.1 and 6.2                                                           |
| Expo shows the bank details and the claim button on a shared membership                                           | manual, no simulator here, `docs/mobile-device-test.md`                     |

Test commands to hand the user, never run here:

```
pnpm -F @matops/domain test test/membership-month.test.ts test/membership-access.test.ts test/staff-directory.test.ts test/notify.test.ts
pnpm -F @matops/api test test/access-plan.test.ts test/membership-assignment.test.ts test/entity-authorization.test.ts test/general-space-booking.test.ts
pnpm -F @matops/db test
```

**Log**

(one entry per run, newest last)

- 2026-09-04, steps 0.3 and the detail pass. Wrote [the detailed plan](/Users/kuna/projects/matops/docs/owner-dashboard-detailed-plan.md): per step the files, signatures, validator shapes, UI copy and named test cases, plus the caller inventory 0.3 asked for. Nine corrections to this file, the load-bearing ones being that the dues sweep is `packages/db/src/dues-reminder.ts` and its guard belongs in the claim, that `loadRosterStanding` already answers the activation preview, and that `stats.organizationMembers` already carries the staff directory. No code changed.
- 2026-09-04, step 0.1. Wrote [ADR 127](/Users/kuna/projects/matops/docs/issues/127-the-owner-level.md), eight sections, and added its line to `docs/map.md`. It amends ADR 126 §3 in two places: bank details were per branch, and moving an existing BJJ branch onto the membership gate was explicitly not authorized there. Nothing else changed; no code, no migration.
- 2026-09-04, step 0.2. OD1-OD7 added to `docs/spec.md` as a planned block above the GB one, a v7.5 block with the six-slice matrix added to `docs/roadmap.md`, and one planned paragraph added to `docs/architecture.md` §0. Slice 0 is done, so the next run touches code.
- 2026-09-04, step 1.1. New `apps/nextjs/src/app/_components/shell-frame.tsx` holds the frame, the eleven icons, `initials`, `NavLink` and `TabFace`. `app-shell.tsx` keeps the academy: the `academy.current` gate, the four badge queries, the item list, the dues strip and the `canVisit` guard, and passes the rest down as `selector`, `sidebarExtra`, `headerExtra` and `banners`. A pure move, no behaviour change. `pnpm typecheck` 17/17, `pnpm lint` 15/15.
- 2026-09-04, steps 1.2, 1.3 and 1.4. `overview`, `people` and `memberships` moved under `(app)/(organization)/`, which adds no path segment, and `staff` and `settings` joined them as `PageHeader` stubs. New `organization-shell.tsx` builds the item list and draws `ShellFrame`; the owner test is `entity.list`'s own `canAdd`, so nothing asks a second time. The three screens dropped their logo, their centred column and their hand-placed links, since the frame supplies all three. `EntitySelector` takes an optional `activeId` and marks All branches current without one. One deviation from the detailed plan: the Memberships and Staff badges are NOT wired yet, because `accessPlan.claims` does not exist until slice 3 and `invitedRole` until slice 5; they land with those. `pnpm typecheck` 17/17, `pnpm lint` 15/15. Not clicked through yet.
- 2026-09-04, slice 2. Migration `0057` adds `membership_policy.bank_details`, stamped at 1790208000000, not yet applied to dev. The fill is `packages/db/scripts/2026-09-04-bank-details-to-organization.sql`, dry run then insert, and a second run writes nothing. `accessPlan.policy` and `setPolicy` carry the account, and `setPolicy` is now a replace of all three fields, which is why Settings has one form with one Save. `accessPlan.mine` returns `{ bankDetails, memberships }` with a derived `reference` per membership, and `membershipStanding` was left alone because `forUser` also calls it. `payments.myDues` reads the organization row, `getRequisites` keeps only the gate fields, `updateRequisites` and `payment-requisites.tsx` are gone, and the Payments screen lost its Bank details tab. New `organization.rename` on a new `organization` router, and `entity.list` now carries `organizationName` so the screen needs no second read. Four test cases added and three updated. Deviations from the detailed plan: 2.3 wrote no new function (it reuses `paymentReference`), and `claimedAt` on the standing waits for slice 3, where the column exists. `pnpm typecheck` 17/17, `pnpm lint` 15/15. Tests not run.
- 2026-09-04, slice 3. Migration `0058` adds `membership_month.claimed_at`, stamped at 1790294400000, not applied yet. The pure rule is one function, `canClaimMonth`, with three cases: the run file's `claimableMonths` was not needed because the server derives the month from `monthOf(now)` in the gym's own zone, which is the only month a member is ever shown. `accessPlan.claimMonth` is enrolled-tier and filtered to the caller's own assignment, since RLS scopes the table to the organization and cannot tell two members apart. `claims` and `rejectClaim` are owner-tier; a rejection writes no audit row, because the audit is the paid flag's history. `markMonth` now clears the claim in both directions. Twelve test cases added. The web claims queue sits above the month board, the Memberships badge is wired, and both clients carry the button beside the standing. `pnpm typecheck` 17/17, `pnpm lint` 15/15. Tests not run.
- 2026-09-04, slice 4. 4.1 wrote no code: `loadRosterStanding` already answers who is covered at one branch, from the same pure `membershipAccess` the gate runs, so the preview is a scoped read and a filter. `entity.activationPreview` and `entity.setMembershipEnforced` are owner identity procedures behind one `requireOwnEntity` guard that refuses a foreign or missing branch with FORBIDDEN before any scope opens; the write runs inside `withScope` because `entity` carries RLS. Nine test cases. Settings grew a Branches section whose switch-on dialog names the people who would lose booking. The activated branch lost `BranchMemberships`, the owner Payments nav item and the legacy claims query, and its students get a Membership screen instead of a dues line. The dues sweep guard went into the CLAIM subselect in `packages/db/src/dues-reminder.ts`, not `reminder.ts` and not the resolve, with two tests including one proving the period is left unstamped. Expo hides the dues card and relabels the section. `pnpm typecheck` 17/17, `pnpm lint` 15/15. Tests not run.
- 2026-09-04, slice 5. No new domain file and no new procedure: `DirectoryEntry` and `DirectoryBranch` gained `invitedRole`, which `rosterOf` already selected and `readEntityDirectory` was dropping, and `staffRows` plus `pendingCoachCount` went in beside `combineDirectory`. `stats.organizationMembers` carries them, so the staff screen and the Members screen answer from one read. Seven domain cases and one API case. `staff-screen.tsx` lists one row per person with a badge per branch linking to that branch's Coaches page, and the nav badge counts waiting coach seats per branch. `pnpm typecheck` 17/17, `pnpm lint` 15/15. Tests not run.
- 2026-09-04, slice 6. `announcementFanOut` in `packages/domain/src/notify.ts` decides the two lists: one inbox row per user per branch, one push per user. `notification.announceAll` and `audienceCountsAll` are owner identity procedures, where the per-branch `announce` stays staff, and both resolve recipients one entity scope at a time through the shared `recipientsPerBranch`. `readOrganizationEntities` moved out of `stats.ts` into `packages/api/src/organization-read.ts` so both callers share one copy. Delivery is a new `notifyAnnouncementAcross` rather than `deliver`, which pushes once per row. The composer moved to `announce-form.tsx` and takes a scope: the branch screen posts where it is, the overview posts to the branches an owner ticks. Four domain cases, five API cases. `pnpm typecheck` 17/17, `pnpm lint` 15/15. Tests not run.
- 2026-09-04, slice 7, partly. 7.1 is green: `pnpm typecheck` 17/17 and `pnpm lint` 15/15 after every step. The docs now say what is true rather than what is planned: `docs/spec.md` OD1-OD7 reads built and unverified, `docs/roadmap.md` carries the six slices at `wip` with the three open items named, `docs/architecture.md` §0 matches, and `CHANGELOG.md` has a v7.5 block marked not yet verified. **Open, and needing a person:** 7.2 the migrations on dev (reading `.env` and running the migrate and verify commands was refused in this session), 7.3 the walkthrough, and 7.5 the later `0059` drop. The test commands are at the end of the detailed plan.
- 2026-09-04, steps 7.2 and 7.4. Migrations applied to dev: `pnpm -F @matops/db verify` reads **58 of 58**, `membership_policy.bank_details` is `text NOT NULL DEFAULT ''` and `membership_month.claimed_at` is a nullable timestamptz. The fill copied Alma beta's account from its default branch onto the organization, and a second run wrote nothing (`INSERT 0 0`). Suites green: **1441 tests across 118 files**, domain 658, api 565, db 179, validators 36, notifications 3. Docs flipped to as-built with the seven OD rules given their as-built notes. **Still open:** 7.3 the walkthrough needs a person, and 7.5 the `0059` drop waits for a deploy after this one.
- 2026-09-04, step 7.3, first pass. The click-through found a crash on every organization screen: `FeedbackLink` sits in the shared frame and called `useEntity()`, which only the branch shell provides, so the server render threw and Next fell back to client rendering. Fixed at the root rather than at the call site: `useEntityMaybe()` in `entity.tsx` returns the context or null, and the feedback mail names the branch only when there is one. Swept the whole organization tree afterwards, five screens plus the form, the shell and every component they import: nothing else reaches for the entity. Static gates green again.
