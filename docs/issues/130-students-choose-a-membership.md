# 130: Students choose a membership

Date: 2026-09-06
Status: code implemented. Workspace typecheck passes 17/17 and lint passes 15/15. Tests were written but have not run. The migration has not been applied. Browser control timed out, so browser acceptance remains open.

## Problem

A student can join a branch but must ask staff to assign a shared membership. Choosing a bundle also leaves staff coordinating access across its branches. Giving students the existing staff assignment action would grant access before payment review.

## Decision

Keep join approval, purchase selection and payment confirmation separate. Reuse shared plans, monthly payment records, branch memberships and existing request transactions. Add one `membership_purchase` record and an `access_plan.student_selectable` flag, defaulting to false. Do not add a billing service, event bus or payment provider.

Owners and managers publish plans for student selection. Existing plans remain private until published. An approved student sees published plans covering their current branch, with all included branches named. Selection supports the current or next calendar month in the organization's membership time zone. The full amount and service dates are shown; no proration applies.

The `membershipPurchase` router provides `catalog`, `mine`, `select`, `claim`, `cancel`, `review`, `confirm`, `reject`, `close` and `setAvailability`. Catalog reads allow pending students to preview plans. Selection requires an active student membership. Every included branch must be live and use shared memberships.

A purchase stores the selected price, currency, coverage, plan version and payment reference. It grants no access. The student follows transfer instructions outside the app and claims **I paid**. A claim remains a statement for staff to verify, never proof of payment. An unclaimed purchase can be cancelled; staff resolve claimed purchases. `reject` returns the request for correction and stays idempotent. `close` records the outcome of a rejected request or a resolution case and releases the student to choose another plan. Students can cancel rejected free requests.

An owner or manager confirms the purchase in one transaction. Confirmation creates the assignment, records its paid month for a paid plan and enrolls eligible missing branches. A free plan still requires approval but creates no paid month or payment audit. The effective historical price makes later free months usable without a payment record. Repeated requests must not create duplicate assignments or payment records. Future starts remain future starts.

Existing branch roles remain unchanged. A bundle cannot restore a suspended, rejected, archived or removed membership. Confirmation rechecks restrictions, overlapping assignments and purchase terms. Changed price or coverage, and payment for a month that has passed, move a confirmed transfer to `resolution` without an assignment. Staff record how they handled it and close the record. No automatic refund is implied.

## Read-only before approval

`booking.book` and `checkin.checkIn` use `memberProcedure`. `bookingGate` rejects pending membership before either payment policy runs. This applies to legacy branches too, closing their provisional-booking exception.

Schedule, class details, own booking history and existing enrolled reads remain available. Account edits remain available. Membership selection and claims are the actions that let an approved student obtain access. `booking.cancel` remains enrolled so users can release existing seats when payment blocks new bookings.

The web booking hook reads the gate for pending students and refuses new booking while the gate loads or fails. The server is the final check. Staff access stays unchanged. The same API approval check applies to older mobile builds without changing procedure inputs or response shapes.

Historical provisional participation rows remain intact. They can still appear in reads and be cancelled. This decision supersedes the pending booking and self check-in permission in ADRs 22-24. It does not change staff attendance recording.

## Compatibility and delivery

Migration `0067_concerned_namora.sql` adds the purchase table, selection flag, constraints, indexes, row-level access policy and grants. It has not been applied. Use an additive migration with no data backfill. Existing plans default to private, and existing assignments and paid months keep their behavior. First purchases remain separate from assignments until confirmation, so assignment grace cannot grant early access. Existing renewal grace remains unchanged.

The first release adds student selection and staff review on the web. Organization invitations, plan selection before approval, separate branch discovery, free-trial policy, card processing and student plan changes remain outside this scope. Branch codes continue to work.

## Verification

Regression cases were written for published and private plans, tenant boundaries, pending selection refusal, duplicate selection and confirmation, stale terms, restricted branches, current and next months, and claims without access. Approval tests cover both booking and QR check-in, browsing, legacy gates and cancellation.

Workspace typecheck passes 17/17 and lint passes 15/15. Tests have not run in this session. Browser control timed out. Apply the migration to dev and walk the student and staff flow before deployment. A migration file in the repository does not mean the database has changed.

## Lessons from review

Check the runtime database role's grants before adding row locks. PostgreSQL `SELECT FOR UPDATE` needs update permission even when no data changes. Identity tables intentionally deny that permission to `matops_app`; a successful typecheck cannot verify database grants.

Every unresolved request needs a way to finish. Keep returning a claim for correction separate from closing it after staff resolve the issue.
