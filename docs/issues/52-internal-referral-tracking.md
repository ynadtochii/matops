# 52 — Internal referral attribution and reporting

**Status:** accepted · **Date:** 2026-08-19 · **Area:** referrals / payments / staff web

## Context

Academies learn about new students through existing members, but matops had no
durable way to record who referred whom or to compare those students' membership
and confirmed-payment performance. The first release needs trustworthy internal
attribution, not a commission or payout system.

The attribution is valuable only if it survives membership suspension/removal,
cannot be casually rewritten by staff, and can report old confirmed payments
without copying payment data into a second ledger.

## Decision

- Store current state in one RLS-scoped `member_referral` row per
  `(academy_id, student_member_id)`. `referrer_member_id` may be null only after
  an owner clear; the retained row keeps that state locked against another
  initial assignment. The database unique key handles concurrent assignment and
  a check constraint rejects self-referral.
- Append every state change to RLS-scoped `member_referral_audit`: `assigned`,
  `corrected`, or `cleared`, with old/new referrer membership ids, actor user id,
  and timestamp. History is append-only through the app role.
- A referral target is a student membership. Pending, active, and suspended
  students may receive an initial attribution; removed students are historical.
  Any retained membership in the same academy may be a referrer, regardless of
  role or status. Relationships are direct, not multi-level.
- Owners and instructors may make the one initial assignment. Only owners may
  correct or clear it. Corrections and their audit insertion execute in the one
  tenant transaction already provided by the tRPC procedure seam.
- Reporting joins current attribution to the existing `payment_claim` history.
  Revenue is `status = confirmed`, grouped by currency, with the current month
  determined from `confirmed_at` in the academy timezone. Claims confirmed
  before attribution count retroactively; correcting attribution moves all
  history to the corrected referrer without rewriting claims.
- O9 is a staff-only screen. It returns names, membership/plan/dues state, and
  reporting totals, but not email, phone, bank details, proof, or claim controls.
  Removed students are returned for history and hidden by the client by default.

## Consequences

- Attribution is intentionally sticky: instructors cannot fix a typo, and even
  an owner clear remains an auditable state rather than deleting the row.
- Reports always reflect the current attribution. This is simpler and more
  useful operationally than preserving competing historical report ownership;
  the audit answers who changed what.
- Payment data remains the source of truth. No denormalized revenue totals,
  scheduled recomputation, or new financial lifecycle is introduced.
- Currency totals are arrays, not a single misleading number. The existing UI
  still assumes two-decimal display formatting; currency-specific minor-unit
  precision remains the broader payments follow-up.

## Alternatives rejected

- **Editable referral field on `member`:** Better Auth's member table is outside
  the RLS domain seam and offers no audit/concurrency model.
- **Delete on clear:** loses the distinction between never assigned and cleared,
  allowing ordinary staff to overwrite an owner correction.
- **Snapshot payments into referral rows:** duplicates financial truth and makes
  corrections/reconciliation brittle.
- **Attribution-time-only revenue:** ignores the approved retroactive reporting
  rule and makes existing students appear artificially worthless.
- **Commission/payout columns now:** premature financial behavior; tracking must
  prove useful before settlement rules exist.

## Verification

- Pure referral tests cover target/referrer eligibility, removed history,
  self-referral, locked initial state, academy-month keys, and currency grouping.
- PGlite coverage targets RLS isolation, fail-closed behavior, one row per
  student, self-referral checks, and audit isolation.
- The dashboard/mutation procedures cover role tiers, cross-academy membership
  validation, concurrent unique conflicts, atomic correction/audit writes, and
  retroactive confirmed-payment reporting.
- Manual checks remain for desktop/PWA layout, filters, confirms, owner history,
  and the instructor locked state.
