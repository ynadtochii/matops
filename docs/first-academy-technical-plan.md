# First academy: technical change plan

Status: implemented on 2026-09-08. Manual pilot acceptance remains open.

Prepared on 2026-09-08 against `dev`, commit `c0ab10ebaa197e48a392d3b73986ffaa32d38160`.

Product source: [first-academy product decisions](/Users/kuna/projects/matops/.scratch/handoffs/2026-09-08-1334-first-academy-product-plan.md:1). Requirement IDs P01-P12 refer to that brief.

## 1. Scope and precedence

Build the owner's academy record system. Keep simple student booking and instructor attendance workflows. Retain coach counts, drifting, referrals, promotions, optional curriculum, advance booking, and manual schedule rebuild.

The user's latest instruction changes the data assumptions: this product has no real users and is not in production. Design for an empty database filled from scratch. This supersedes the brief's existing-record transition requirements and the conflicting production narrative in `CLAUDE.md`.

There is no backfill, legacy claim conversion, old-link support, dual payment model, staged column removal, or compatibility deployment. Removing guardians includes removing their storage. Removing shopping includes removing purchase storage. Keep audit history for records created after launch.

This document plans the fresh installation. It does not run a reset, migration, seed, commit, or deployment. Product choices below remain open where the brief did not settle them.

Retain the current stack: Next.js, tRPC, domain functions, Drizzle, Postgres, and Better Auth. No new library or service is needed. Keep organization-level agreements and branch-level operating permissions. Native distribution remains deferred; shared API changes must still compile with Expo callers.

### Planning checklist

- [x] Read the product brief and repository rules.
- [x] Inspect scheduling, membership, reports, attendance, notifications, public booking, and person authorization.
- [x] Inventory web, Expo, API, domain, validators, schema, import/export, scripts, hidden schedules, docs, and relevant test files.
- [x] Define the fresh schema, request flows, removal list, implementation order, and acceptance checks.
- [x] Resolve the product gates in section 2 before implementing their dependent behavior.
- [x] Implement and verify the slices in section 11.

## 2. Product gates and recommended choices

These recommendations are not confirmed product decisions. Record the user's choices in a new decision note before dependent code changes. Unrelated removals can proceed independently.

| ID  | Choice                                               | Recommendation and tradeoff                                                                                                                                                                                                                                                       | Dependent work                          |
| --- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| D1  | Seven-day grace: warning only or access deadline?    | Block new student bookings and self check-in after grace without a claim. A pending claim permits provisional access. Warning-only reduces friction but gives grace no access effect. Neither option cancels reservations.                                                        | P09 eligibility, payment wording, setup |
| D2  | Can an approved student train without an assignment? | Require assignment. Show a clear owner task and student status. Allowing training before assignment is possible, but needs a separate unpaid-access rule. Assignment never approves a pending branch membership.                                                                  | P09 first booking                       |
| D3  | Mid-month price and deadline                         | Full month price, no proration. Seven local calendar days from the actual start date, even across month end. Each later month has its own deadline. This can create two payments close together.                                                                                  | P09 start dates and claims              |
| D4  | Future-class access                                  | Require coverage on the class date and payment standing at booking time. Future unpaid months do not block advance booking before their deadline. Recheck current standing at self check-in. Preserve existing reservations if standing changes.                                  | P06/P09                                 |
| D5  | Durable rejection scope                              | Preserve rejection across claims, renewal, and plan changes. Recommend a hold on the declined assignment's branch coverage, attached to the person. An organization-wide hold is simpler but blocks unrelated paid agreements. Confirm scope.                                     | P09 rejection                           |
| D6  | Free plan approval                                   | Treat explicit owner/manager assignment of a free plan as agreement approval. Branch approval remains separate. No student self-approval and no paid flag for a zero-cost agreement.                                                                                              | P09 free plans                          |
| D7  | Coach's taught-class definition                      | Count ended, non-cancelled classes with a current attendance review, including reviewed empty classes. Unreviewed work stays visible separately. Counting all ended classes avoids review dependency but can overstate delivered work. Use calendar-month selection initially.    | P01                                     |
| D8  | Advance window boundary                              | Default 7; permit integers 1-90. Include today plus the following X-1 branch-local dates. End at midnight after the last date. Apply to all self-service paths, including hosted visitors. This aligns visible dates with booking rules but changes today's exact-duration guard. | P06/P11                                 |
| D9  | Rebuild with booked stale classes                    | First release: refuse the destructive part until staff explicitly cancel those classes and handle notices. Allow safe calendar extension separately. Bulk cancellation within rebuild is possible, but adds a larger notice and confirmation flow.                                | P07                                     |
| D10 | Remove external API or all anonymous booking?        | Retain hosted booking and its private return/cancel flow. Remove keys, integration routes, and origin settings. If all anonymous booking is unwanted, cut hosted routes and share links too; staff visitors remain.                                                               | P11                                     |
| D11 | Job-free email at larger recipient counts            | Attempt a bounded first batch in the action. Show remaining recipients and explicit Send remaining / Retry failed actions. This requires staff attention for large changes. A scheduler is excluded.                                                                              | P07/P10/P11                             |
| D12 | Referral bonuses                                     | Ship attribution and confirmed-month evidence only. Keep recipient rules, first-versus-recurring eligibility, rates, and payouts outside MatOps until specified. This supports manual decisions without inventing a payroll rule.                                                 | P04                                     |

Retain prior decisions that claims and confirmation are separate, pending review permits provisional access, and rejection cannot be bypassed. Late reporting remains available. A new report after rejection may enter review but cannot clear the hold.

D1 also needs a debt-history rule. Recommend showing older unpaid months for owner follow-up while evaluating ordinary grace against the current month. Only explicit rejection creates a hold that survives month rollover. Blocking for every older unpaid month is a stricter alternative; choose it explicitly before implementing the access reader.

For shared memberships, retain the organization's membership timezone. Booking windows and class reports use the branch timezone. A single academy should use the same timezone for both. Do not silently recalculate old payment deadlines after a timezone change.

## 3. Current behavior and change map

Paths below are absolute. Line numbers describe the inspected commit, not future edits.

| Requirement        | Current implementation                                                                                                                                                                                                                                                                                     | Required change                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| P01 coach counts   | [coach.ts](/Users/kuna/projects/matops/packages/domain/src/coach.ts:245) counts ended, non-cancelled classes. [stats.ts](/Users/kuna/projects/matops/packages/api/src/router/stats.ts:121) does not load review state for this count.                                                                      | Use D7's definition, selected month, and inspectable class lists. Keep coach invitations and approvals.           |
| P02 drifting       | [stats.ts](/Users/kuna/projects/matops/packages/api/src/router/stats.ts:664) reads latest present marks. It excludes inactive, staff, and never-attended people.                                                                                                                                           | Keep rules, split from discarded dashboard aggregates, show days since recorded attendance and a full list.       |
| P03 curriculum     | [schedule-screen.tsx](/Users/kuna/projects/matops/apps/nextjs/src/app/_components/schedule-screen.tsx:25) gates navigation. [curriculum.ts](/Users/kuna/projects/matops/packages/api/src/router/curriculum.ts:369) protects student visibility and notes.                                                  | Keep existing capabilities and storage. Verify off/on and privacy paths.                                          |
| P04 referrals      | [referral.ts](/Users/kuna/projects/matops/packages/api/src/router/referral.ts:89) reports confirmed purchases by confirmation month.                                                                                                                                                                       | Read owner-confirmed membership months by agreement month. Remove revenue and bonus calculations.                 |
| P05 promotions     | [rank.ts](/Users/kuna/projects/matops/packages/api/src/router/rank.ts:76) appends promotions. Its clear action at line 144 deletes current rank without an event.                                                                                                                                          | Retain BJJ/Judo, add audited correction/clear events, keep student history.                                       |
| P06 booking window | [booking.ts](/Users/kuna/projects/matops/packages/domain/src/booking.ts:46) fixes seven elapsed days. [student-screen.tsx](/Users/kuna/projects/matops/apps/nextjs/src/app/_components/student-screen.tsx:36) uses browser-local seven-day filtering.                                                      | Store branch setting and use one timezone-aware rule for listing and booking.                                     |
| P07 rebuild        | [materialize.ts](/Users/kuna/projects/matops/packages/db/src/materialize.ts:298) finds stale future generated rows. Rebuild at line 358 deletes classes, participation, and visitor visits.                                                                                                                | Separate extension from rebuild, preserve cancellation records, version the preview, and apply D9.                |
| P08 attendance     | [attendance.ts](/Users/kuna/projects/matops/packages/api/src/router/attendance.ts:142) compares saved review and current roster signatures. Historical corrections use reasons at line 647.                                                                                                                | Preserve this authority and reuse it in coach counts. Keep staff walk-ins and historical edits.                   |
| P09 memberships    | [membership-access.ts](/Users/kuna/projects/matops/packages/api/src/membership-access.ts:173) implements provisional access and durable rejection through purchases. [accessPlan.ts](/Users/kuna/projects/matops/packages/api/src/router/accessPlan.ts:2260) merely clears ordinary rejected month claims. | Move claims, rejection, and history into monthly membership records before deleting purchases.                    |
| P10 jobs           | [.github/workflows/cron.yml](/Users/kuna/projects/matops/.github/workflows/cron.yml:1) invokes jobs. [notification-outbox.ts](/Users/kuna/projects/matops/packages/db/src/notification-outbox.ts:58) scans and retries email.                                                                              | Delete schedules and callable workers. Replace delivery with explicit, scoped actions.                            |
| P11 public API     | [booking-page.tsx](/Users/kuna/projects/matops/apps/nextjs/src/app/book/[code]/booking-page.tsx:71) calls the integration API.                                                                                                                                                                             | Replace hosted-page dependency before deleting integration code.                                                  |
| P12 adults         | [person.ts](/Users/kuna/projects/matops/packages/api/src/router/person.ts:191) authorizes guardians; guardian management begins at line 814.                                                                                                                                                               | Delete guardian storage and all delegated self-service authorization. Keep account-free adults and staff actions. |

## 4. Fresh database and ownership model

### 4.1 Identities and permissions

Keep `person` as the organization-owned student record. `accountUserId` remains nullable and unique within an organization. Staff may create an adult without email or a login. A verified account links to one person in that organization through the existing controlled linking flow.

Make `personId` required for student-subject assignments and assignment changes. Remove their duplicated subject `userId` fallback. In other touched student-record tables, remove migration-only dual reads once the person path is complete. Actor, coach, reviewer, and authentication fields remain account IDs. Branch membership IDs remain operational identities; do not replace staff identity with paid enrollment.

Self-service resolves the subject from session user plus organization. It does not accept another person's ID as authority. Staff use separate procedures with existing branch and organization permission checks. Remove account unlinking and moving-account controls from release scope.

Retain database row-level security, which restricts queries to their organization or branch. Keep composite foreign keys that prevent cross-organization references. Keep explicit erase ordering. Every new table must appear in schema exports, grants, security policies, erase handling, and export coverage where applicable.

### 4.2 Schema decisions

| Record                                                   | Target                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `person`, `entity`, `entity_membership`                  | Retain. No guardian relationship, child type, birth-date requirement, or family plan. Add `bookingWindowDays` to `entity`, since both supported branch types allow booking. Default 7 with D8's database constraint.                                                          |
| `access_plan`, `access_plan_entity`, `access_plan_price` | Retain organization scope, explicit branch coverage, and effective-month price history. Remove `studentSelectable`. Require a valid price/currency before assignment; zero is valid.                                                                                          |
| `access_assignment`                                      | Required `personId`, existing plan and organization references, start month, exclusive end month, status, assigning actor/branch, and explicit local `startsOn`. Preserve future-month changes.                                                                               |
| `access_assignment_change`                               | Retain dated change history against the person. Do not infer student identity from the actor.                                                                                                                                                                                 |
| `membership_policy`                                      | Retain membership timezone. Fix release grace at seven days. Retire editable grace and reminder settings after D1 is chosen. Preserve or remove enforcement controls according to D1; do not leave contradictory modes.                                                       |
| `membership_month`                                       | One row per assignment/month when a claim or staff action occurs. Replace cleared-claim behavior with explicit `unpaid`, `reported`, `confirmed`, or `rejected` state. Store version, claim actor/time, review actor/time, amount, currency, deadline, and timezone snapshot. |
| `membership_month_audit`                                 | Extend to append-only state events: reported, confirmed, rejected, corrected, and confirmation removed. Store before/after state, actor, time, reason when required, and price evidence.                                                                                      |
| Proposed `membership_access_hold`                        | Record unresolved rejection separately from monthly standing. Person, source assignment/month, affected branch coverage, actor, reason, created time, and explicit resolution. Use D5's final scope. A plan change must not evade it.                                         |
| `membership_purchase`                                    | Remove, with purchase-only constraints, validators, exports, and callers. No conversion.                                                                                                                                                                                      |
| `person_guardian`, `scheduled_job_run`                   | Remove completely. Remove class reminder timestamps and monthly reminder timestamps.                                                                                                                                                                                          |
| Email records                                            | Replace worker outbox state with notice and recipient-attempt records described in section 7. No next-run time or retry schedule.                                                                                                                                             |
| Rank history                                             | Support promotion, correction, and clear events with prior/new rank and actor. Keep current-rank projection and both supported systems.                                                                                                                                       |

Enforce unique assignment/month records in Postgres. Validate month keys as first-of-month dates. Enforce end month after start month and keep actual start date within the start month. Keep compatible repeat assignments after an old period ends. Refuse overlapping duplicate periods for the same person and plan under a person-scoped transaction lock. Do not impose a new one-plan-per-person rule on existing multi-plan coverage.

Keep money as integer minor units plus currency. Reuse effective price history. Freeze the price evidence used by a claim or payment decision. A later plan edit must not change it. Prevent silent retroactive price changes; corrections require an explicit audited action.

### 4.3 Fresh installation

Use a new fresh-install schema baseline and matching Drizzle metadata. Include the existing custom role, grants, security policies, indexes, and foreign keys. Do not use `db:push`, because it skips hand-written security setup.

Move superseded migration history outside the active migration directory if retaining it for reference. Do not edit historical decision notes. Regenerate the active journal and snapshots together. Update PGlite setup, database verification, and migration-count assumptions to the new baseline.

Simplify `packages/db/scripts/deploy-migrate.mjs` to install the active schema. Remove staged legacy-dues gates and `ALLOW_LEGACY_DUES_DROP`. Delete obsolete person and dues conversion scripts and their runbook instructions. Seeds remain separate from schema installation.

Update seed creation and teardown for required person subjects and the new monthly states. Supply small fixtures for free, unpaid, reported, confirmed, rejected, suspended, account-free, future-change, visitor, and empty-reviewed-class cases. Real academy locations and agreements are operator input, not assumptions taken from demo fixtures.

The later reset must target an explicitly identified disposable database. Install schema, verify security, then seed. Do not run old application code against the new schema. Before real records exist, recovery can recreate the fresh database. After pilot data exists, use backup/restore and forward fixes rather than another reset.

## 5. Memberships and access without jobs

### 5.1 Monthly continuity

An assignment continues while its dates and status apply. Renewal does not create another assignment or carry forward payment confirmation. A missing monthly row means unpaid, not missing membership.

Reads derive requested calendar months from the assignment and effective price. Do not insert rows on page load. Claims and staff decisions create month rows transactionally. Owner queues derive missing unpaid months for a bounded selected period. Exports include assignment periods, price history, stored month states, and audit events so absence can be interpreted correctly.

Reuse the pure date functions in [membership-month.ts](/Users/kuna/projects/matops/packages/domain/src/membership-month.ts:1). Pass `now` explicitly. Replace the UTC slice of assignment `createdAt` in access readers with `startsOn`.

Under D3, a September renewal deadline is September 8 at 00:00 in the membership timezone. A September 29 start has an October 6 deadline for September. October independently has an October 8 deadline. A late September claim does not confirm October.

For a future assignment entered in September for October, use the actual October start date. Entry time is not the grace start. Store deadline and price evidence when a real month action occurs. Restrict timezone changes once active agreements exist unless a separate explicit change flow is designed.

### 5.2 Mutation contracts

Keep owner/manager agreement management in `accessPlan`. Extract shared transaction helpers from the large router so imports and UI calls use identical rules. Do not add a general billing framework.

| Action             | Required behavior                                                                                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assign             | Validate person, plan, price, coverage, dates, and actor scope. Return an existing identical assignment idempotently. Never restore suspended/cancelled assignments or activate archived people implicitly.                              |
| Change/end         | Keep future-month behavior and exclusive end month. Record actor and decision. Coverage loss creates a derived owner review list; it cancels no bookings.                                                                                |
| Report payment     | Resolve the signed-in person. Validate assignment applies in the month. Compare the amount/price version shown by the UI. Lock the assignment/month and create one effective report. A duplicate does not append duplicate events.       |
| Confirm            | Require existing financial authority. Lock current state, confirm the shown month and amount, append history. Resolve relevant rejection holds explicitly in the same transaction when authorized. Never silently clear unrelated holds. |
| Reject             | Store rejection and reason, append history, and create the durable hold. Keep all reservations. A repeated report cannot resolve the hold.                                                                                               |
| Correct paid state | Keep historical corrections with actor and reason. Distinguish removing a mistaken confirmation from explicitly rejecting a claim. Display the resulting access consequence before submission.                                           |
| Resolve hold       | Explicit owner/manager approval with reason and audit. May accompany confirmation. A new assignment, month rollover, or claim cannot call it implicitly.                                                                                 |

Use a version on month records to reject stale owner decisions. Handle claim versus confirmation and two simultaneous reviews in one transaction. On conflict, show the latest state instead of overwriting it. Lock subjects and agreement records in a consistent order across assignment, payment, and booking paths.

### 5.3 One access result

Keep pure decisions in `packages/domain/src/membership-access.ts`. Keep database loading in `packages/api/src/membership-access.ts`. Route `payments-gate.ts`, booking, self check-in, membership screens, and owner review lists through that result.

Return structured reasons, not only a boolean: branch status, assigned coverage, applicable month, deadline, payment standing, hold, access state, and explanation. Include `provisional` separately. The client displays these facts and never decides eligibility from a local paid flag.

Evaluate in this order:

1. Verify identity, organization, branch, archive/suspension, and existing role rules.
2. Resolve applicable assignment coverage for the class date. Apply D2 where no assignment exists.
3. Check unresolved holds for that person and branch. They take precedence over grace or a repeated report.
4. Evaluate current payment standing under D1/D3/D4, or an explicitly approved free assignment.
5. Apply class availability, booking window, and the existing branch capacity policy atomically.

Preserve staff authority to record real attendance and historical corrections. Payment status must not erase evidence that someone attended. Self check-in follows access policy; staff recording attendance is a different permission path.

Do not save a future booking as guaranteed paid access. Recheck eligibility when a student checks in. Suspension, rejection, or overdue state does not silently delete reservations. Show affected bookings in the owner review flow.

### 5.4 Screens, imports, and exports

Replace `my-dues.tsx` content with assigned plan, covered dates, amount/currency, bank details, reference, deadline, claim state, and clear action. Remove `membership-selection.tsx`, `membership-purchase-review.tsx`, catalog calls, purchase-resolution UI, and start-month shopping.

Keep owner assignment and monthly review in `memberships-screen.tsx` and the person record. Update queue counts and cache invalidation after every assignment or payment action. A no-plan state routes the owner to assignment and tells the student what is missing.

[dataTransfer.ts](/Users/kuna/projects/matops/packages/api/src/router/dataTransfer.ts:724) currently calls assignment logic and writes paid records during import. Use the new shared helpers. Preserve preview, duplicate detection, account-free records, and atomic commit. Require an actual start date when an imported mid-month agreement needs one.

Export claims, confirmations, corrections, holds/resolutions, and frozen money evidence. Remove guardian, purchase, and reminder fields. Keep authorization and paginated export behavior. Update the export format version without an old-format conversion path.

## 6. Booking windows and safe calendar work

### 6.1 One booking window

Replace `BOOKING_WINDOW_DAYS` with a default plus validated branch setting. Change `canBook` and refusal formatting to accept the resolved rule. Use existing timezone helpers to calculate local-date boundaries.

Under D8, September 8 with X=7 displays September 8-14. Booking requires `startsAt > now` and `startsAt < September 15 00:00` in the branch timezone. Daylight-saving changes do not add or remove a calendar date.

Provide one server-resolved window for schedule data and UI labels. Use it in `class.mine`, self-booking, class deep links, hosted availability, route prefetch, and retained Expo callers. Replace browser-local grouping with explicit branch-local date keys. Keep My bookings visible outside a reduced window so cancellation remains easy.

The current materialization horizon is 180 days. Retain it for staff planning. Student window growth does not expand staff permission or automatically generate a schedule. Show the actual generated-through date and warn owners if it falls inside the student window. Existing reservations survive setting reductions.

### 6.2 Extension and rebuild contracts

Keep generation in `packages/db/src/materialize.ts`; remove only its global sweep. Retain conflict checks for general-space rooms and the unique template/start key.

Expose two explicit operations:

- `template.extend`: fill missing future occurrences to the 180-day horizon. Preserve cancelled classes and all existing records.
- `template.rebuildPreview` / `template.rebuild`: compare desired occurrences with existing future generated classes and apply D9. Never touch past classes or unrelated one-offs.

Preview returns exact affected class IDs, dates, action per class, participant/visitor counts, generated-through result, and a version. Include active reservations separately from historical/cancelled participation. Include future classes beyond the chosen horizon as preserved, not stale merely because they fall outside the comparison range.

Do not trust a client-supplied affected list. Recompute on confirmation under a branch schedule lock and compare the version. The version covers template content/status, occurrence state, reservation/visitor state, and horizon. A new booking, template edit, or cancellation invalidates it and requires a fresh preview.

Every writer that can invalidate the plan must follow the same locking/version protocol, including booking and visitor insertion. A preview hash without writer coordination is not a race guard. Lock only the relevant branch and affected classes, using a consistent order.

Under D9, booked stale classes block rebuild. Staff cancel them explicitly through the existing cancellation flow and see delivery results. A later rebuild preserves those cancellation records. For unbooked stale future occurrences, prefer recorded cancellation over deletion too. No participation or visitor rows are removed by rebuild.

Remove automatic revival of explicitly cancelled occurrences from timing-edit paths. Use an explicit restore action if restoration remains needed. A one-off or template edit that moves a booked class must use the same change-notice rules. Do not make rebuild safe while leaving template edits able to bypass it.

Calculate the branch generated-through date from the minimum cursor across active templates, with paused/deleted templates excluded. Show no recurring schedule when none exist. Repeated extension creates no duplicates; any generation conflict rolls back its transaction with a named class/time error.

## 7. Email and notices without workers

Reuse the current after-commit boundary in [trpc.ts](/Users/kuna/projects/matops/packages/api/src/trpc.ts:392). Keep network calls outside database transactions. Replace the sweep in `notification-outbox.ts`; do not retain a callable global drain operation.

### 7.1 Durable intent and explicit attempts

Within the class-change transaction, write the class change, notice identity, recipient snapshots, and account inbox records. Include students, account-free people with contact details, and booked visitors. Save missing-email outcomes too. The recipient set describes the event when it happened, not whoever is booked during a later retry.

Use one notice per committed change version and one logical recipient/channel row per notice. Keep recipient identity distinct from destination email. Protect uniqueness in Postgres. Store template/payload version so retries send the intended event. Newer changes do not overwrite older notices.

Recipient states: `not_attempted`, `sending`, `accepted`, `failed`, `unknown`, and `no_email`. Record attempts with time, attempt owner, provider reference when available, and a safe error code. “Accepted” means the provider accepted the request, not that the recipient read or received it.

After commit, the action awaits a bounded first batch. Proposed starting limits: 20 recipients, concurrency 4, transport timeout 5 seconds, total send budget 25 seconds. These are implementation limits to validate against the configured runtime and provider before release, not claims about provider guarantees.

Return the committed action result, notice ID, and delivery counts. A delivery failure must not present the saved cancellation as failed. If the response is lost after commit, repeating the same action returns the existing notice through its action/version identity.

### 7.2 Manual continuation

Add branch-authorized `notice.status` and `notice.sendRemaining` / `notice.retryFailed` procedures. They accept a notice ID, not arbitrary recipients, message bodies, or another branch ID. They claim a bounded set transactionally, then send outside the transaction.

Never resend rows already recorded as accepted. Concurrent clicks cannot claim the same recipient. Store an attempt lease to prevent overlapping sends. Expired sending attempts appear as unknown when read; no timer repairs them. An explicit recovery action decides how to continue.

Use the stable recipient delivery ID as the provider idempotency key. A timeout after acceptance can leave an unknown result. Verify the provider's idempotency retention and reconciliation support during implementation. Do not promise unlimited duplicate prevention for ambiguous outcomes. After the safe retry window, require explicit status reconciliation or a clearly described manual resend choice.

Keep the owner work list visible for failed, unknown, and unattempted recipients. Sending another batch requires an explicit click. Do not use cron, delayed functions, background polling that sends, client timers, or a queue consumer.

Update [resend.ts](/Users/kuna/projects/matops/packages/notifications/src/resend.ts:23) to return useful failure categories and enforce transport timeout. Keep authentication email working. Use injectable sender, clock, and limits in delivery helpers.

Apply this flow to hosted booking confirmations as well as class edits and cancellations. Return the booking reference and private status/cancel link immediately even if email fails. A duplicate visitor submission must reuse its booking and confirmation intent.

## 8. Complete removals and hosted visitor replacement

### 8.1 Jobs

Delete `.github/workflows/cron.yml` and all four routes under `apps/nextjs/src/app/api/cron/`: deliver, memberships, materialize, and remind. Remove `packages/api/src/cron-auth.ts`, `job-run.ts`, `membership-sweep.ts`, `packages/db/src/reminder.ts`, and worker-only exports/functions.

Remove `organization.jobHealth`, the job panel in `overview-screen.tsx`, stale-job counts, `CRON_SECRET` validation/examples, package subpath exports, retry schedules, and reminder/sweep-only tests. Remove any active host schedule configuration and deployed scheduler secrets during later release setup. Keep unrelated CI schedules unless they invoke product jobs.

Membership continuity comes from section 5. Calendar extension comes from section 6. Payment reminders become in-app standing and manual owner follow-up. Overdue reservation cancellation is deleted. Login and class-change notices remain.

### 8.2 Public integration API

Working assumption: D10 retains hosted visitors. Replace the `/book/[code]` page's integration calls with application-owned server actions backed by a small visitor service. Keep HTTP input schemas even though these actions are internal to the application UI.

Resolve the six-digit academy code on the server. Require hosted booking enabled and a live branch. Return only the allowed class projection. Revalidate class state, visitor window, and existing capacity rules at booking time. Keep same-origin mutation checks and current rate-limit protections; anonymous requests remain untrusted.

Preserve validated contact fields, privacy/risk UI, confirmation, private return token, cancellation, and changed/cancelled-class status. Keep private token checks on every status or cancellation request. Exclude tokens from logs, analytics, public projections, and referrer leakage. Disabling new hosted bookings must not prevent an existing holder from viewing or cancelling their booking.

Delete `apps/nextjs/src/app/api/public/v1/`, the external contract in `packages/api/src/public/index.ts`, `PUBLIC_API_BASE`, publishable-key lookup/rotation, origin allowlists, and their package exports. Split reusable visitor rules out of `packages/domain/src/public-api.ts` and `packages/db/src/public-api.ts` before deleting integration parts.

Drop `academy_profile.publicApiKey` and `publicApiOrigins`; retain `publicBookingEnabled` and class `publicBookable` if hosted booking stays. Replace `public-booking.tsx` integration setup with a hosted switch and share link. Remove keys from provisioning and browser props.

No old keys or booking links need conversion. Deleted integration endpoints return 404. If D10 removes anonymous booking too, delete hosted pages/actions and their switches/share links. Retain staff visitor records and check for any other public drop-in form before deciding its fate.

### 8.3 Guardian and child behavior

Delete `guardianCandidate`, `addGuardian`, `removeGuardian`, `mySubjects`, guardian return fields, and guardian validators. Replace guardian-aware subject access with strict self ownership. Consolidate `person.schedule/bookClass/cancelBooking` callers onto self-only class/booking APIs. Keep staff roster procedures separate.

Remove `person_guardian`, schema relations, grants, export kind, erase entries, and seed teardown references. Remove guardian success fixtures and replace them with cross-person denial cases. Remove dedicated child/family purchase options wherever found. Do not infer that a discipline name or rank system is a child feature.

Update Expo `book-control.tsx`, `class/[id].tsx`, profile claims, and any subject picker despite native launch deferral. An old or hostile client must not retain a callable guardian path. Keep nullable account/email on person records and verified account linking. No age checks or new birth-date collection.

## 9. Retained reports and daily records

### Coach counts, P01

Add a focused selected-month report using branch-local `[month start, next month start)` class-start boundaries. Under D7, taught means ended, not cancelled, and review fingerprint still current. Reuse `attendanceReviewSnapshot`; do not add another completion flag.

Return taught, unresolved-ended, and cancelled counts with paginated dated source classes. Keep future scheduled classes separate if shown. Include former coaches in historical results and active coaches with zero classes. Reassignment updates both coaches' counts without changing attendance. Preserve existing reassignment permissions and record the actor/reason where required.

Remove teaching minutes, averages, headcounts, weekday breakdowns, and comparison cards from the report. Keep coach approval/invitation controls. Owners/managers retain cross-coach reporting; preserve existing instructor own-report access without exposing other coaches' data or adding reports to daily attendance.

### Drifting, P02

Split a focused owner/manager reader from `stats.dashboard`; do not compute removed Insights to get drifting. Preserve existing elapsed-day bands at 8, 14, and 28 days. Include only active non-staff students with previous recorded attendance. Suspended, archived, and never-attended people remain excluded. Do not add a new paused state.

Return person, last recorded attendance, whole elapsed days, band, and person/contact route. Support the full list instead of only six dashboard rows. Attendance additions and corrections invalidate the list. Label the date as recorded attendance, since incomplete registers do not prove absence.

### Curriculum, P03

Retain tracks, library blocks, categories, week placements, parallel blocks, run notes, and class themes. Keep organization module defaults off and the separate student-visibility setting. Re-enabling restores content. Keep API module guards and omit staff notes from student results. Ordinary schedule creation never depends on curriculum being enabled.

### Referrals, P04

Replace purchase-derived `monthRevenue` and `lifetimeRevenue` with selected agreement-month evidence from section 5. Show referrer, referred person, joining date, assignment/month ID, confirmation actor/date, and stated amount/currency where relevant. Pending and rejected claims cannot appear as confirmed payment.

Keep referral assignment/correction history, self-referral checks, unassigned and cleared states, and current owner/manager permissions. Referrers may be retained branch members, including coaches. Keep payment evidence private from students and ordinary instructors.

Join organization-level payment facts to branch-level attribution using existing scoped readers. Use the assignment/month identity to prevent duplicate evidence from coverage joins. Do not total different currencies or describe marked-paid amounts as bank revenue. A correction to attribution changes the current report while preserving who changed it and when. No bonus computation or payout table.

### Promotions and attendance, P05/P08

Keep BJJ/Judo validation, current ranks, promotion history, and student-only own-history reads. Add clear/correction events with previous value, new value, actor, time, and reason. Keep current rank as the latest valid projection. Do not disguise a correction as a promotion or delete old events.

Preserve named staff rosters, present/absent marks, bulk marks, adult walk-ins, visitors, finish review, and the review queue. Keep stale-roster rejection, unmarked resolution, and explicit zero-present confirmation. Keep instructor editing limits and owner/manager correction reasons for older history. Review changes must refresh coach counts; attendance changes must refresh drifting.

## 10. Role-specific UI and documentation

- Owner/manager: one clear selected-branch home with operational work, people, and settings. Keep payments, coach counts, drifting, referrals, and promotions reachable. Preserve explicit organization versus branch scope and multi-branch support.
- Instructor: today's classes, roster, attendance completion, permitted approvals/notes/promotions, and optional curriculum. Staff who train use student booking views.
- Student: schedule, easy cancellation, assigned membership/payment state, and own promotion history. Remove statistics, shopping, child selectors, and business reports.
- Visitor: retain the hosted flow under D10, with confirmation, return, and cancellation.

Remove generic Insights and busiest-class summaries from `dashboard-screen.tsx`, broad metrics cards in `overview-screen.tsx`, and student statistics in `my-classes-screen.tsx`. Remove unused query fields and computations, not the entire `stats` router. Keep operational queue and directory readers.

Remove announcement composer and announce procedures from web and API. Keep the class-change inbox. Hide attendee names in the server contract: remove student access to `class.attendees`, web/Expo consumers, and route prefetch. Keep counts and own booking state; staff use named attendance rosters.

Update `organization-setup.ts` so disabled curriculum/referrals do not block readiness. Bank details apply to paid agreements, not free ones. Follow D1 for payment-enforcement readiness. No new mandatory onboarding wizard. Keep import preview, export, reversible archive, payment correction, staff approval, and permission boundaries.

During implementation, update active behavior in `docs/spec.md`, `docs/architecture.md`, `docs/roadmap.md`, `PLAN.md`, README, pilot/release runbooks, and CHANGELOG. Retire current-use public integration instructions. Add a new decision note and index it in `docs/map.md`; supersede conflicting older ADRs rather than rewriting them. Record the no-real-users/fresh-install premise so old production prose cannot reintroduce backfills.

## 11. Implementation slices

Estimates are focused engineer-days, including code, focused test writing, static checks, and docs. They exclude waiting for decisions and academy acceptance. Total planning range: 19-30 days. Re-estimate after the gates are resolved.

| Slice | Outcome and current-to-target change                                                   | Main files/modules                                                                                                           | Dependencies                                                       | Data risk and acceptance                                                                                                                    | Estimate |
| ----- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| S0    | Lock release rules and fresh schema contract                                           | This plan, new decision note, schema inventory, active migration metadata                                                    | D1-D12 as applicable                                               | No reset during planning. Final rules replace conflicting specs.                                                                            | 0.5-1    |
| S1    | Adult student identity; remove guardian authority and legacy subject fallbacks         | `person-schema.ts`, `person.ts`, person validators, self booking, Expo callers, import/export, erase/seed                    | S0                                                                 | Cross-person access denied; account-free staff records work. P12.                                                                           | 2-3      |
| S2    | Owner assignment, monthly claims, holds, and shared access rules; remove shopping      | `access-schema.ts`, membership domain/access/gate, `accessPlan.ts`, `membershipPurchase.ts`, payment screens, import/export  | S1; D1-D6                                                          | History, concurrency, free plans, suspension, renewal, and rejection verified. P09-A/B/C/D/E/G. P09-F transition is superseded by fresh DB. | 4-6      |
| S3    | Durable notices with request-driven delivery and manual recovery; remove all job paths | Outbox schema/helper, `resend.ts`, class/notification/template routers, cron routes, workflow, env, job UI                   | S0; D11; S2 before membership sweep removal is considered complete | No silent lost intents, no accepted-recipient resend, no global worker. P10.                                                                | 3-5      |
| S4    | Discoverable configurable booking and safe calendar extension/rebuild                  | `entity-schema.ts`, settings, booking/query-window domain, class/booking/template API, `materialize.ts`, student/template UI | S2/S3; D8/D9                                                       | Concurrency, cancellation preservation, timezone, capacity, and horizon verified. P06/P07/P08.                                              | 3-5      |
| S5    | Hosted visitor flow independent of external integration API                            | Hosted page/actions, visitor service, public helper splits, settings/provisioning, public route deletion                     | S3/S4; D10                                                         | Tokens stay private, duplicate submissions safe, confirmation/cancellation work, old API absent. P11.                                       | 2-3      |
| S6    | Focused owner evidence and preserved teaching records                                  | `stats.ts`, `coach.ts`, referral/rank/attendance routers and schemas, report screens                                         | S2/S4; D7/D12                                                      | Source lists match counts; currency and privacy checks pass; correction history retained. P01-P05/P08.                                      | 2-3      |
| S7    | Role-specific navigation, discarded surface removal, release docs                      | Shell, dashboard/overview, student/class screens, announcement API, setup domain, Expo callers, docs                         | S2/S5/S6                                                           | No hidden callable removed features; retained queues and optional modules work.                                                             | 1-2      |
| S8    | Assemble fresh install, seed, and verify pilot                                         | Baseline migrations, deploy migrator, security/erase/export checks, seed/verify scripts, manual acceptance                   | S1-S7                                                              | Empty install is complete; security verified; no old-code/new-schema overlap.                                                               | 1.5-2    |

Each slice checklist:

- [x] Confirm relevant product gates and inspect all affected callers before edits.
- [x] Implement pure rules and transaction boundaries before UI state.
- [x] Update meaningful focused tests, fixtures, export/erase/security coverage, and active docs.
- [x] Run lint, typecheck, formatting, and diff checks. Do not run tests without the user's explicit request.
- [x] Record actual validation and remaining acceptance work.

## 12. Verification and release acceptance

### Focused checks to write during implementation

| Area            | Required cases                                                                                                                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh schema    | Empty install; application role grants; cross-organization/branch denial; required person links; duplicate month/period rejection; erase/export completeness.                                                                                                                                                 |
| Membership      | Midnight/month/year rollover; daylight-saving change; no app use for several months; no copied confirmation; mid-month import; late report; concurrent claim/review; stale owner action; hold across plan/month changes; free agreement; suspended person; future class date; existing reservations retained. |
| Booking         | Every self-service entry point; branch/browser timezone difference; first/last allowed instant; window reduction; student discoverability; general-space hard capacity and academy soft capacity; cancellation outside the current window.                                                                    |
| Rebuild         | Preview changes after new booking/visitor/template edit; cancelled occurrence preservation; beyond-horizon preservation; past/one-off preservation; stale booked refusal; repeated extension; overlap rollback; timing-edit notices.                                                                          |
| Delivery        | Transaction rollback sends nothing; commit followed by transport failure; crash/timeout after acceptance; concurrent retries; accepted-recipient skip; missing email; more than one batch; lost response; cross-branch notice ID denial; hosted confirmation.                                                 |
| Reports         | Reviewed empty class; stale review; reassignment; former coach; selected-month boundary; drift bands/exclusions/corrections; referral claimed versus confirmed; currency separation; duplicate branch coverage; rank clear/correction history.                                                                |
| Privacy/removal | No guardian or purchase operations; no public integration routes; no job routes or active scheduler; no student attendee names; no announcement writes; no staff curriculum notes in student output.                                                                                                          |

Update existing focused suites such as `membership-access-reader.test.ts`, `access-plan.test.ts`, `membership-plan-change.test.ts`, `person-management.test.ts`, `coach-stats.test.ts`, and `attendance-writes.test.ts`. Replace purchase, public integration, and outbox-worker tests with the new contracts. Remove only tests for intentionally deleted behavior; retain security and source-record checks.

Suggested commands for the user after those test updates, not run in this planning task:

```sh
pnpm --dir /Users/kuna/projects/matops/packages/domain test
pnpm --dir /Users/kuna/projects/matops/packages/validators test
pnpm --dir /Users/kuna/projects/matops/packages/api test test/membership-access-reader.test.ts test/access-plan.test.ts test/membership-plan-change.test.ts test/person-management.test.ts test/coach-stats.test.ts test/attendance-writes.test.ts
pnpm --dir /Users/kuna/projects/matops/packages/db test
```

Add the final delivery/hosted/rank/referral test filenames to the implementation handoff once written. Test commands above do not validate this proposed design until the code and assertions change.

### Manual pilot acceptance

- [ ] Owner creates the actual week, sees the generated-through date, extends it, and handles a stale booked class safely.
- [ ] Owner imports an account-free adult, assigns the actual plan, and confirms a month without duplicate identity or payment records.
- [ ] Student signs in, sees the assigned agreement, reports payment, books within the configured window, and cancels without shopping.
- [ ] Rejection blocks the agreed actions, preserves reservations, survives another claim/month, and resolves only through explicit approval.
- [ ] Instructor completes attendance, records a visitor/walk-in, and corrects history within permissions.
- [ ] Owner checks coach counts, drifting, and referral payment evidence against their source records.
- [ ] Staff records and corrects a promotion; student sees their own history.
- [ ] Curriculum off creates no setup burden; on restores content and protects staff notes.
- [ ] Cancellation and visitor confirmation show honest email outcomes; failed and remaining sends can be handled manually.
- [ ] A new month works without any job or user creating a renewal record.
- [ ] Owners/managers/instructors/students and a second organization cannot cross their permission boundaries.

Observe requests for help, duplicate entry, attendance completion time, and whether owner decisions can be made from these records. Do not add a new analytics platform for this pilot.

### Planning verification performed

Read-only code and configuration inspection covered all P01-P12 areas and their web/Expo callers. No live database or provider inspection was performed. No tests, reset, migration, seed, or deployment ran.

Workspace lint passed 15/15 tasks and typecheck passed 17/17 tasks. All tasks were Turbo cache hits. These checks describe the unchanged implementation, not the proposed design. Document formatting, all linked local paths, P01-P12 coverage, and whitespace checks passed. Only this technical document was added.
