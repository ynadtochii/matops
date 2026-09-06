# Goal

Finish the organization and branch pivot as a coherent product. Registration creates an organization only. The owner lands in the organization shell and creates the first branch there. The release also completes setup, shared memberships, permissions, product language, measurement, and pilot rollout.

## Context

MatOps now supports one organization with BJJ and general-space branches. Shared people, memberships, payment status, staff, and reporting exist. The current creation path still provisions a default BJJ branch inside the Better Auth organization hook. A later repair path also treats an organization without a branch as broken.

The product still has several post-pivot gaps. General-space creation can be shown when the server will reject it. Sharing assumes a BJJ academy. Shared membership plans have no price. Membership migration is one person at a time. New setup still teaches the old single-academy model. Organization work is restricted to owners. The latest owner and general-branch flows still need manual acceptance.

Production has no customer data. Prefer a hard product cutover for new organizations. Keep rollback only where the pilot already depends on it.

## Decisions

- Registration creates the Better Auth organization and owner membership only. It creates no `entity`, `entity_membership`, `academy_profile`, public code, or curriculum track.
- The owner lands on `/overview` inside the organization shell after creating the organization.
- An organization with zero branches is valid. It is an onboarding state, not a provisioning failure.
- The zero-branch overview shows one primary action: `Create your first branch`.
- The owner chooses the first branch type and name. Do not assume the first branch is BJJ.
- The first live branch becomes `is_default = true`. Preserve the current compatibility rule by giving the first branch the organization id when safe.
- First-branch creation is atomic and serialized on the organization row. Two requests cannot create two default branches.
- `canCreateBranches` is derived from an active organization owner role. It defaults to true for the creator.
- `general_branches_enabled` remains the entitlement for creating `general_space`. Its database default becomes true. Existing live organizations are backfilled to true because the product now supports both branch types.
- `entity.list` returns separate `canCreateBranches` and `canCreateGeneralBranches` capabilities. The client never offers an action the server will reject.
- New branches use shared memberships from creation. Legacy branch dues remain only for existing pilot migration and rollback, then become read-only and are removed.
- Shared membership plans gain a monthly price and currency. Price changes need an effective month. Historical months keep the amount that applied to them.
- Organization managers can run normal organization operations without receiving destructive owner rights.
- The organization directory gains a person detail view. It owns shared membership work. Branch screens continue to own local role, rank, attendance, and suspension work.
- The next release adds no new branch types, automatic payment collection, waitlists, private hire, resource inventory, shared curriculum, or cross-branch referrals.
- Web remains the pilot surface until the full mobile device checklist passes.

## Success Criteria

- A new owner creates an organization and reaches a useful zero-branch organization shell.
- The owner can create either supported branch type without hidden flags or terminal errors.
- The first branch is the only default branch and receives all rows required by its type.
- A new branch never starts on the legacy dues model.
- The owner can finish first setup without a terminal or founder intervention.
- A member sees the amount, currency, payment details, reference, status, and deadline for a shared membership.
- An owner can migrate or assign several members, clear every uncovered member, preview affected bookings, and activate a branch.
- A manager can handle delegated organization work but cannot perform owner-only destructive actions.
- General-space screens show only supported actions and use branch or session language.
- The team can measure organization activation and retained student use without a manual spreadsheet.
- The complete BJJ-only and multi-branch journeys pass manual web checks. Mobile stays out of the promise until device checks pass.

## Implementation Steps

### 0. Lock the revised product contract

- [ ] Add a new ADR that supersedes the automatic-default-branch parts of ADR 124 and the pilot-only general-branch flag rule in ADR 126.
- [ ] Update `docs/spec.md` with the organization-only registration state, first-branch creation, shared-membership defaults, pricing rules, manager permissions, and setup journey.
- [ ] Update `docs/architecture.md` with the valid zero-entity organization state and the first-branch transaction.
- [ ] Update `docs/roadmap.md` so completed v7.4 cells no longer say todo. Add this plan as the active post-pivot release.
- [ ] Record the migration order around the reserved later drop of `payment_settings.bank_details`. Do not reuse migration `0059` for another change.

### 1. Split organization creation from branch provisioning

- [ ] Remove `provisionOrganization` from the Better Auth `afterCreateOrganization` hook in `packages/auth/src/index.ts`.
- [ ] Change `academy.create` into an organization creation procedure, or add a focused `organization.create` procedure and retire the old entry point in `packages/api/src/router/academy.ts`.
- [ ] Return `organizationId` only. Refresh the active-organization session cookie and route the owner to `/overview`.
- [ ] Remove the post-login repair that calls `organizationsMissingEntity` and creates a BJJ branch automatically.
- [ ] Remove `organizationsMissingEntity`. A live organization with no entity is valid.
- [ ] Keep organization-level defaults lazy where current readers already support them. Create required organization settings during registration only if a screen cannot work without them.
- [ ] Rename the web form and copy from academy creation to gym creation in `create-academy.tsx` and `start/page.tsx`.
- [ ] Update the root app landing rule. An owner with an active organization and zero branches goes to `/overview`, not `JoinByCode`.

### 2. Make the organization shell work with zero branches

- [ ] Change `overview-screen.tsx` so an owner with zero branches sees an organization setup state, not the student code-join screen.
- [ ] Show `Create your first branch` as the primary action. Keep join-by-code for signed-in people with no owned organization and no branch membership.
- [ ] Keep Overview, Settings, and Profile usable with zero branches. Hide or disable Members, Memberships, and Staff only where their empty states would not help setup.
- [ ] Make organization queries return valid zero totals when there are no entities.
- [ ] Remove loading and error copy that calls a zero-branch organization an academy.

### 3. Rebuild branch creation around the first branch

- [ ] Extend `entity.list` to return `canCreateBranches` and `canCreateGeneralBranches`.
- [ ] Change `organization.general_branches_enabled` to default true. Add an explicit migration that backfills existing live organizations to true.
- [ ] Hide the general-space option when `canCreateGeneralBranches` is false. Explain the entitlement if a future plan turns it off.
- [ ] Change `createEntity` in `packages/db/src/provision.ts` to detect the first live entity inside one transaction.
- [ ] Lock the organization row before choosing the first branch. Set `isDefault` only when no live branch exists.
- [ ] Give the first branch the organization id when it does not conflict. Later branches keep random ids.
- [ ] Provision `entity_membership` for the creator. Provision `academy_profile` and the default curriculum track only for BJJ.
- [ ] Set `membership_enforced_at` on every new branch, including BJJ. New branches use shared memberships immediately.
- [ ] Make retries idempotent. A partial first-branch failure must repair the same branch and never create a second default.
- [ ] Add optional `Copy from another branch` for schedule templates and staff. Do not copy bookings, attendance, ranks, notes, referrals, or payment history.

### 4. Add a guided organization setup journey

- [ ] Add an organization setup checklist with server-derived completion states.
- [ ] Cover gym name, first branch, branch location and time zone, schedule, staff, bank details, membership plan, member assignment, access readiness, and first invite.
- [ ] Show the checklist on the zero-branch overview and keep a compact progress card until setup is complete.
- [ ] Adapt the branch dashboard checklist by type. BJJ can mention classes, curriculum, and visitor links. General space uses sessions and supported member links.
- [ ] Add branch launch health to the organization overview: missing schedule, missing staff, no covered members, no public BJJ classes, and unfinished membership setup.
- [ ] Make each item link directly to the screen where the owner can finish it.

### 5. Complete shared membership economics

- [ ] Add monthly price and ISO currency to `access_plan` in `packages/db/src/access-schema.ts`.
- [ ] Add an effective-month price history record, or an equivalent immutable monthly snapshot. A later plan edit must not rewrite old months.
- [ ] Update validators and `accessPlan` procedures for plan creation and price changes.
- [ ] Show price and currency on plan cards, assignment dialogs, member notices, payment claims, payment history, and the owner month board.
- [ ] Store or resolve the amount that applied to each membership month. Keep paid status separate from confirmed revenue.
- [ ] Define price-change behavior: existing assignments use the new price from the selected future month. No proration in this release.
- [ ] Keep bank transfer and `I paid`. Do not add a payment provider.

### 6. Build organization-level member and migration work

- [ ] Add an organization person route and detail screen from `people-screen.tsx`.
- [ ] Show branch roles, local status, shared assignments, covered branches, current standing, payment history, and open claims.
- [ ] Let authorized organization users create, change, suspend, and cancel shared assignments there.
- [ ] Keep local role, approval, rank, notes, attendance, and branch suspension on the branch member screen.
- [ ] Add bulk assignment from selected people, CSV input, or an existing branch plan.
- [ ] Add an uncovered-members work queue grouped by branch.
- [ ] Add a repeatable reconciliation job for large coverage changes. Fail with clear context if any member cannot be updated.
- [ ] Extend activation preview with future bookings that would be cancelled.
- [ ] Add an activation readiness result with blocking counts for uncovered people, missing prices, missing bank details, and incomplete reconciliation.
- [ ] Keep the final activation action explicit and reversible during the pilot.

### 7. Add organization manager permissions

- [ ] Define an organization `manager` role or explicit capability set in the Better Auth access-control model.
- [ ] Let managers view organization people, plans, payments, staff, and reports.
- [ ] Let managers assign memberships, confirm claims, post announcements, and handle setup.
- [ ] Keep organization deletion, owner promotion or removal, commercial subscription ownership, and access-policy activation owner-only.
- [ ] Show the effective role in the organization shell and hide actions the role cannot run.
- [ ] Keep API checks as the authority. Navigation rules are only presentation.

### 8. Remove the dual dues model from normal use

- [ ] Keep legacy branch dues visible only on branches that existed before the cutover and have not migrated.
- [ ] Move legacy migration into one guided flow instead of a permanent Settings switch.
- [ ] After successful pilot migration, make legacy plan and dues editing read-only.
- [ ] Apply the reserved migration that drops `payment_settings.bank_details` only after the old production build can no longer read it.
- [ ] Plan a later removal of legacy `membership_plan`, `member_dues`, and `payment_claim` only after data retention and export rules are settled.
- [ ] Remove dead automatic-provisioning helpers, stale academy creation contracts, and duplicate dues UI within this change area.

### 9. Make every branch surface type-aware

- [ ] Define shared product terms: Gym for organization, Branch for every entity, Academy or mat for BJJ, Space for general space, Session for the shared schedule item.
- [ ] Add small type-aware copy helpers for common headings, empty states, loading labels, and share actions.
- [ ] Update organization navigation to use People. Update branch navigation to use Roster where that avoids two different Members destinations.
- [ ] Split `share-links-dialog.tsx` actions by branch type. General spaces must never request BJJ public-booking settings.
- [ ] Load each share action independently so one unavailable capability cannot hide valid links.
- [ ] Add a signed-in `Join another branch` path on web and mobile. Keep switching separate from joining.
- [ ] Keep public general-space visitor booking out until pilot evidence shows it is needed.

### 10. Add product entry, commercial state, and measurement

- [ ] Update the public entry page to explain the BJJ-first Academy offer and the qualified multi-branch Facility offer.
- [ ] Add organization commercial fields for offer, pilot end date, agreed price, billing contact, and account status.
- [ ] Show the pilot or trial end date in organization Settings. Keep collection manual until willingness to pay is proven.
- [ ] Add first-party product events for organization creation, first branch, first schedule, first student, first booking, first attendance, first plan, first assignment, second branch, branch activation, and paid commitment.
- [ ] Add a weekly retained-use report. Do not depend on a hand-maintained spreadsheet.
- [ ] Use weekly active organizations as the main metric. Require a real student booking or attendance event.
- [ ] Track time to first schedule, time to first student booking, setup completion, second-branch activation, two-branch weekly use, and week-two student booking.
- [ ] Track the counter-metric: owner activity with no student activity.
- [ ] Keep Facility sales-led until at least two customers make a dated paid commitment.

### 11. Verify and release

- [ ] Write or update focused unit, API, database, and component tests for every changed contract.
- [ ] Run affected package lint and typecheck after each implementation slice.
- [ ] Do not run tests during agent sessions. Hand the exact focused commands to the user after each slice.
- [ ] Apply new migrations to dev in order and verify the migration journal count.
- [ ] Walk the complete single-BJJ journey on web.
- [ ] Walk the complete organization-only registration and first-branch journey on web.
- [ ] Walk BJJ plus general-space creation, setup, shared membership, booking, attendance, payment claim, manager access, and branch switching.
- [ ] Verify denied actions with a manager, instructor, student, and unrelated organization member.
- [ ] Complete the outstanding Expo device checklist before calling mobile supported for this release.
- [ ] Run one BJJ plus general-space design partner for four weeks. Require both branches to record real booking or attendance activity.
- [ ] Ask for a dated Facility payment commitment before adding more general-space features.
- [ ] Update `docs/spec.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/map.md`, `CHANGELOG.md`, `docs/pilot-plan.md`, and `docs/business-model.md` with the as-built result.

## Test Plan

Write tests for these cases during implementation. Do not run them in an agent session.

- Organization creation writes no entity rows and returns an active owner organization.
- An organization with no branches loads Overview and Settings with valid empty data.
- The first concurrent branch creation produces one default branch and one owner entity membership.
- Retrying partial first-branch provisioning creates no duplicates.
- BJJ and general-space first branches receive only their required rows.
- A new BJJ branch starts on shared memberships.
- Branch capabilities match owner role and the general-branch entitlement.
- Shared plan price changes apply from the selected month and do not alter prior months.
- Bulk assignment is idempotent and preserves suspended branch memberships.
- Activation readiness and the final gate use the same coverage rule.
- Activation preview names uncovered people and affected future bookings.
- Manager permissions allow daily work and reject owner-only actions.
- General-space sharing makes no BJJ-only request.
- Product events fire once for idempotent retries.

Suggested commands for the user after implementation:

```bash
pnpm typecheck
pnpm lint
pnpm -F @matops/domain test
pnpm -F @matops/db test
pnpm -F @matops/api test
pnpm -F @matops/validators test
pnpm -F @matops/notifications test
```

Use focused file filters where each package supports them before running full package suites.

## Rollout

1. Ship documentation and contract changes first.
2. Ship organization-only creation and the zero-branch shell together. Do not deploy one without the other.
3. Ship first-branch creation, capability responses, and the default-true general-branch flag together.
4. Ship plan prices and historical amount rules before migrating real members.
5. Ship bulk migration and activation readiness before moving any existing BJJ branch.
6. Keep legacy dues available only as pilot rollback.
7. Complete web acceptance on dev, then deploy.
8. Apply the delayed bank-details drop only after the old build is gone.
9. Run the four-week mixed-facility pilot.
10. Turn Facility into a public offer only after paid commitment evidence.

## Risks

- Removing automatic provisioning makes zero-branch organizations normal. Every landing and repair path must stop treating them as corrupted.
- The first branch currently inherits the organization id. Losing that rule can break old QR, seed, and default-branch assumptions.
- Two concurrent first-branch requests can race unless the organization row is locked.
- Price edits can rewrite history unless amounts use an effective month or monthly snapshot.
- Bulk coverage changes can leave partial membership state unless reconciliation is repeatable.
- A permanent legacy dues path will keep two product models alive and raise support cost.
- Manager access can expose sibling branch data if any procedure relies only on navigation hiding.
- Product analytics can collect personal data. Events should use organization, branch, role, and state identifiers without names, phone numbers, email addresses, or payment details.

## Current Step

**Built and unverified, 2026-09-04.** All eleven steps are done, one epic item per run; the record of what changed and why is [EPIC.md](EPIC.md)'s log. Static gates are green (`pnpm typecheck` 17/17, `pnpm lint` 15/15) and migrations `0060` to `0064` are applied to the **dev** branch, 63 rows against 63 journal entries.

Three things are outstanding, all of them human work:

- **The suites are written and were not run.** The focused commands are in EPIC.md's log; `pnpm test` is the finish.
- **Nobody has clicked through it.** The manual acceptance list is in EPIC.md's log: registration with no branch, the BJJ-only journey, a mat plus a general space, denied actions per role, money and measurement, and the Expo checklist that has been outstanding since v1.8.
- **Two hand-run fills.** `packages/db/scripts/2026-09-04-general-branches-backfill.sql` and, only when a gym actually commits, `2026-09-04-paid-commitment.sql`.

Nothing is committed. The whole release sits in the working tree on `dev`, and merging `dev` into `main` is the production deploy.

## Open Questions

- None. The plan uses the decisions above. Change them before implementation if the intended commercial or permission model differs.
