# Student membership selection and multi-branch joining

Status: first release implemented, static checks passed. Date: 2026-09-06.

The user authorized implementation with read-only browsing until approval. Code and regression tests are written. Workspace lint and typecheck pass. Tests have not run, browser control timed out, and migration 0067 has not been applied. Organization invitations and trials remain later slices.

## Goal

Let an approved student choose a published membership, make a bank transfer, and submit a payment claim. Let the gym confirm payment and grant the branches included in that membership.

The student should understand what they are buying and when they can train. The owner or manager should confirm payment without also assigning the plan and enrolling each branch manually.

## Ideas captured

| Proposal                                                    | Recommendation                                                                                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Students choose memberships after branch approval           | Build first. Keep staff assignment available.                                                                                                 |
| Show BJJ + gym bundles to a BJJ student                     | Yes. Show plans covering their selected branch first, with every included branch named.                                                       |
| Show memberships from every branch                          | Offer a separate “Other branches” view later. Limit discovery to the same organization and published plans.                                   |
| Make the gym branch available after bundle payment approval | Yes for missing branch enrollments, subject to existing branch restrictions. Payment confirmation must show the branches it will grant.       |
| Replace branch codes with organization codes                | Keep branch codes. Add an organization invite link with a branch picker later. Do not break existing links, printed codes, or mobile clients. |
| Choose a plan during joining                                | Allow an optional preview or saved preference later. Recheck availability and price after approval.                                           |
| Require plan selection when there is no grace               | After approval, make choosing a plan the next action. Do not charge a person the gym has not accepted.                                        |
| Create a member request and payment reference together      | Create the member request at joining. Create a payment reference only when an approved person confirms a priced membership selection.         |

## Current system evidence

- Plans already belong to an organization and cover explicit branches: `packages/db/src/access-schema.ts:34` and `:139`.
- Code joining creates a pending branch membership: `packages/api/src/router/membership.ts:269`. Approval is separate at `:475`.
- The shared catalog and assignment API require an owner or manager: `packages/api/src/router/accessPlan.ts:771` and `:1086`.
- Assignment currently enrolls missing covered branches immediately and can restore an inactive assignment: `packages/api/src/router/accessPlan.ts:184`, `:259`, and `:550`.
- Student transfer instructions and claims already exist: `packages/api/src/router/accessPlan.ts:1965` and `:2095`. A claim does not confirm payment.
- Confirmation changes the monthly paid record today. It does not perform enrollment: `packages/api/src/router/accessPlan.ts:1669`.
- Branch suspension takes priority over paid membership coverage: `packages/domain/src/membership-access.ts:89`.
- Renewal grace and joining grace differ. Mid-month assignments receive seven days even when renewal grace is zero: `packages/domain/src/membership-month.ts:17` and `:101`.
- Billing uses calendar months without prorating: `packages/domain/src/membership-month.ts:9`.
- A separate legacy branch-dues selection flow exists at `packages/api/src/router/payments.ts:383`. It refuses migrated branches. Do not extend that old model for this feature.

## Product rules proposed

### Keep three decisions separate

1. **Branch approval:** the gym accepts this person as a student.
2. **Membership selection:** the student chooses a plan and its payment terms.
3. **Payment confirmation:** an owner or manager verifies the bank transfer.

“I paid” reports a transfer. It must not approve the person or verify money automatically.

Publishing a self-service plan means the organization allows approved students to purchase its listed branch coverage. Confirming its first payment approves missing covered branch enrollments. A branch instructor who can approve local students must not gain organization-wide payment permissions.

Existing pending, suspended, rejected, removed, or archived branch records need an explicit staff decision. A purchase must never restore them silently. Hide or block purchase options with known restricted coverage until staff resolves the restriction. If a restriction appears after transfer, preserve the payment record and show a staff follow-up. Do not promise full activation.

### First payment and grace

Recommended first release: new self-service purchases activate after payment confirmation. Existing staff assignments and renewal grace keep their current behavior.

Do not call renewal grace a free trial. A student without a covering membership currently receives no shared-membership access. If the gym wants trials, define an explicit trial policy in a later slice. Do not obtain trials accidentally through the fixed seven-day assignment grace.

An approved student waiting for payment sees plans, transfer instructions, and payment status. Booking stays unavailable until the first purchase activates. A paid future start remains unavailable until its start date.

### Catalog

Add an owner/manager control: “Students can choose this plan”. Default it off for existing plans.

A selectable plan must be published, unarchived, priced, and cover live branches. Its full coverage must be safe to grant through self-service. For this release, every covered branch must use shared membership enforcement. Otherwise enrollment could grant access through an older branch gate before the purchased start date. Missing bank details prevent paid checkout and explain that the gym must provide payment instructions.

Each option shows plan name, monthly price, included branches, start date, amount due now, next renewal date, and when access begins. Zero-price plans say “Free” and skip bank transfer and payment claims. Approval and branch restrictions still apply.

On a BJJ branch, show BJJ-only and BJJ + gym plans together. Explain “Includes Alma BJJ and Alma Gym”. Do not mix gym-only plans into that first choice. They do not solve the student's current BJJ access need.

### Billing choices

Keep calendar-month billing for the first release. Offer starting this month or next month. Show the exact service dates before selection. State clearly that a partial current month costs the full monthly amount. Do not add automatic prorating in this release.

Snapshot the quoted amount, currency, start month, and branch coverage. A price or coverage change before submission requires a fresh confirmation. Once a transfer is claimed, preserve the quoted terms for review. If live plan terms differ at activation, stop automatic activation and require staff resolution with the student. The current access model reads live plan coverage, so storing a quote alone cannot freeze branch entitlements. Do not introduce versioned membership coverage in this release.

Unclaimed selections for an ended month show an expired warning and stop presenting bank transfer instructions. The student may cancel and choose again if they have not paid. A claimed transfer remains reviewable for its original service month. If September has ended, record a verified transfer as “Payment received, resolution needed” without creating an active assignment. Staff must agree the correct service period with the student before activation. Merely marking September paid on a new ongoing assignment is unsafe: October renewal grace could grant access. Do not automatically carry the money into October.

## First-release student flow

1. Enter a branch code and confirm its name.
2. Submit the join request. Show “Waiting for branch approval”.
3. After approval, show “Choose your membership” with plans covering that branch.
4. Review one plan, its included branches, start month, and payment terms.
5. Confirm selection. Create one pending purchase and a stable payment reference.
6. Transfer using the displayed amount and reference, then select “I paid”.
7. Show “Waiting for payment confirmation”, with the selected plan and branches still visible.
8. An owner or manager confirms the transfer. Activate the membership and enroll missing included branches.
9. Refresh membership status, booking access, and the branch picker. Show a confirmation naming the branches now available.

Example: an approved Alma BJJ student chooses BJJ + Gym. Before confirmation, Alma Gym is listed as included and awaiting activation. After confirmation, its branch appears in the picker. If that person was suspended at Alma Gym, payment cannot remove the suspension.

## Owner and manager flow

- Publish suitable plans from Memberships > Plans.
- Keep join requests in the approval queue and transfers in Payments. These are different tasks with different permissions.
- Add first-purchase claims to the existing payment queue, alongside renewal claims, with clear reason labels.
- Show student, plan, amount, currency, service month, reference, and branches before confirmation.
- Use a clear action such as “Confirm payment and activate membership”.
- Allow a payment claim to be returned with a reason and next step. Preserve its history.
- If money arrived but access cannot be granted, record that fact and require staff follow-up. Do not describe it as an unpaid or missing transfer. Refund handling remains manual.

## Technical approach

Use a separate pending purchase record. Do not expose the manager assignment mutation to students and do not disguise pending purchases as suspended memberships.

The record stores organization, student, selected branch, plan, quoted coverage, amount, currency, start month, stable reference, claim status, and the resulting assignment ID. Expiry follows the service month without a separate expiry job. Store confirmation and rejection actors and timestamps. Scope reads to the caller's organization and own purchases.

This keeps existing active-assignment access and renewal calculations intact. The existing month records remain the source of confirmed membership payments after activation. A first-purchase claim and its resulting monthly payment must appear once in the operator queue, not twice.

Add student catalog, select, read purchase, claim purchase, and withdraw-unclaimed-selection operations. Add manager confirmation and return-for-correction operations. Reuse existing transfer components and payment queue presentation where their contracts fit.

Confirmation runs in one database transaction:

1. Lock the purchase and check whether it was already confirmed.
2. Recheck organization, student standing, plan validity, and branch restrictions.
3. Validate the quoted terms and the selected service month. Expired service periods or changed terms require resolution, not automatic assignment. Record money received separately from access activation.
4. For an eligible purchase, create or link the intended assignment without restoring unrelated inactive records.
5. Mark the correct month paid for a paid purchase and retain the original reference. Free memberships need no fake payment record. Historical prices decide whether payment is required in later months.
6. Enroll missing covered branches. Membership start dates still control booking and training access.
7. Save the activation result and audit record.

Repeated selection or confirmation must return the existing result. Database constraints must prevent duplicate purchases and duplicate assignments under concurrent requests. Notifications happen after the transaction and can retry without repeating activation.

For future starts, enroll eligible covered branches on payment confirmation and label coverage “Starts on [date]”. The existing assignment start-month checks must deny access before that date, including for an already enrolled student. No separate enrollment job is needed. Other valid memberships keep their existing access. Recheck branch restrictions on each booking and admission as today.

Students with an existing membership should not accidentally buy overlapping coverage. In the first release, route overlapping plan changes to staff. Preserve the existing next-month staff plan-change flow. Allow only one unresolved first purchase per student and organization until additional purchases have a defined workflow.

## Delivery slices

- [x] **1. Published catalog:** plan availability control, student-safe catalog, branch coverage labels, no payment writes. Existing plans remain private.
- [x] **2. First purchase:** pending purchase model, quote and month handling, transfer instructions, claim states, duplicate protection. No premature access.
- [x] **3. Confirmation and coverage:** one payment queue, atomic activation, branch enrollment, exception handling, notifications, and picker refresh. Release slices 2 and 3 together.
- [x] **4. Onboarding handoff:** schedule access notices link to membership selection when uncovered. Pending students can preview plans without a payment obligation. Approval and purchase status refresh while waiting.
- [ ] **5. Organization invite:** add a join link with organization name and branch picker. Skip the picker for a single eligible branch. Keep branch codes as preselected entry points into the same flow.
- [ ] **6. Later choices:** explicit trials, student upgrades and downgrades, additional non-overlapping memberships, and optional prorating.

Likely modules: `packages/db/src/access-schema.ts` and migrations; `packages/validators`; `packages/api/src/router/accessPlan.ts`; `packages/api/src/router/membership.ts`; `packages/api/src/router/organization.ts`; `packages/api/src/membership-sweep.ts`; `packages/domain` purchase rules; web `my-dues.tsx`, `membership-notice.tsx`, `memberships-screen.tsx`, and joining components.

Build web first. Shared API changes must remain compatible with mobile clients. New membership selection screens in the native app are a separate delivery task.

## Acceptance and verification

- [ ] Approved BJJ student can choose a published BJJ + Gym plan and submit one claim.
- [ ] Pending students cannot create a payable purchase in the first release.
- [ ] Selection and “I paid” grant no new access by themselves.
- [ ] Payment confirmation makes eligible covered branches available at the agreed start date.
- [ ] Existing branch restrictions and assignment suspensions cannot be bypassed.
- [ ] Hidden, archived, unpriced, foreign-organization, or stale plans cannot be purchased through a direct API call.
- [ ] Repeated and concurrent requests produce one purchase, one paid month, and one activation result.
- [ ] Mixed existing coverage, zero-price plans, missing bank details, future starts, and month boundaries have explicit outcomes.
- [ ] Failed or returned claims retain their reference, history, and a clear next step.
- [ ] Existing staff assignment, legacy dues, renewal grace, and scheduled plan changes keep working.
- [ ] Keyboard users can complete selection, claim, and confirmation. Waiting, failure, and success states are readable.

Write focused domain and API regression tests for these rules. Do not run tests during an agent session unless requested. Run lint and typecheck for affected packages. Manually verify the full web flow with separate student and manager accounts before rollout.

Pilot with one organization and a small set of published plans. Track approval-to-selection time, selection-to-confirmation time, abandoned purchases, duplicate claims, activation failures, and manual staff assignments. Compare staff actions per new paid member with the current flow. Do not assume a revenue gain before measuring it.

## Decisions used for implementation

1. Publication and first-payment confirmation approve missing covered branches, preserving every existing restriction.
2. First payment must be confirmed before access. Free plans require staff activation. Trials remain separate.
3. Keep calendar-month pricing, with current or next-month starts and full terms before selection.

Organization invitations are recommended as an additive later slice. They are not required to deliver student membership selection.

## Implementation verification

- Workspace `pnpm typecheck`: 17 tasks passed.
- Workspace `pnpm lint`: 15 tasks passed.
- `git diff --check`: passed.
- Added 17 API purchase cases and domain rules, plus updated pending booking checks. Tests were not run.
- To run the purchase cases: `pnpm --dir /Users/kuna/projects/matops/packages/api test test/membership-purchase.test.ts`.
- Migration: `packages/db/migrations/0067_concerned_namora.sql`, not applied. Existing plans default to private. Publish eligible plans after applying it.
- Browser verification could not run because browser control timed out.

## Lessons from review

- Check the runtime database role before choosing a row lock. Identity tables may be readable without allowing locking reads.
- Give returned requests a path to correction or closure. A uniqueness constraint must not trap the user in a rejected selection.
- Distinguish a zero price from a missing price. Free access does not require recording money that was never received.
