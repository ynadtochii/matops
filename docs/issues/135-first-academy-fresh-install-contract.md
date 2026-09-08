# 135: First academy fresh install contract

Date: 2026-09-08. Status: accepted for implementation.

## Problem

The first academy plan replaces several old product paths. The current code still has guardian access, student membership shopping, scheduled jobs, and an external booking API. There are no real users or production records to convert.

The implementation needs one fixed product contract before schema and access work can start.

## Decision

Use the recommended choices from the first academy technical plan.

- Payment grace is an access deadline. New bookings and self check-in stop after seven local calendar days without a claim. A pending claim gives provisional access. Existing reservations stay.
- A student needs an approved branch membership and a plan assignment to train.
- A mid-month assignment costs the full monthly price. Its first deadline is seven local calendar days after its actual start date. Later months use the eighth day of the month.
- A future booking needs assignment coverage on the class date and current payment standing when booked. Self check-in checks standing again.
- A rejected payment creates a person hold for the assignment's branch coverage. The hold survives month and plan changes until an owner or manager resolves it.
- Assigning a free plan approves the agreement. Branch approval remains separate.
- A taught class is ended, not cancelled, and has a current attendance review. Reviewed empty classes count. Reports use branch-local calendar months.
- Each branch accepts a booking window from 1 to 90 local calendar days. The default is 7. Today is the first included date.
- Schedule rebuild refuses booked stale classes. Staff must cancel them through the normal class flow first.
- Hosted visitor booking stays. External keys, origin settings, and integration routes are removed.
- Email sends a bounded first batch after commit. Staff send remaining recipients or retry failures from the saved notice.
- Referral reports show attribution and confirmed membership-month evidence. MatOps does not calculate or pay bonuses.

Older unpaid months stay visible for owner follow-up. Ordinary access uses the current applicable month. Only an unresolved rejection hold survives month rollover.

## Fresh database

Build one fresh schema baseline. Do not backfill or convert guardians, purchases, old links, external keys, or scheduled jobs. Keep audit records for data created after launch.

This decision supersedes ADR 134 where it requires guardian access, student membership shopping, legacy conversion, scheduled jobs, worker delivery, or an external booking API. Organization and branch isolation, manual attendance, hosted visitors, shared membership plans, and explicit branch URLs remain.

## Verification

Write focused tests for the new contracts. Do not run tests during implementation unless the user asks. Run formatting, lint, type checks, schema checks, and source searches before handoff.
