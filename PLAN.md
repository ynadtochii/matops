# Goal

Add a staff-only referrals feature where owners and instructors attribute student memberships to an academy member and review confirmed-payment performance, without calculating commissions or payouts.

## Context

The feature builds on the existing RLS tenant seam, Better Auth membership records, and manual-transfer payment claims. The approved behavior is defined as product screen O9 and technical decision ADR 52.

## Decisions

- Any retained membership in the active academy may be a referrer, including students, staff, suspended members, and removed members.
- Pending, active, and suspended student memberships are referral targets; removed students remain in history and are hidden by default.
- Staff may make one initial assignment. Assigned students are locked for instructors; only owners may correct or clear an attribution.
- Clearing leaves an auditable, locked unassigned state. A later assignment therefore uses the owner correction flow.
- A student cannot refer themselves and has at most one current referral row per academy.
- Reporting uses owner-confirmed payment claims, including claims confirmed before attribution. Current-month boundaries use the academy timezone and `confirmed_at`.
- Corrections move all historical reporting to the current referrer. Prior values remain only in the audit log.
- Monetary totals remain grouped by ISO currency.
- Referral relationships are direct only. Codes, invite automation, commissions, discounts, payouts, exports, and student visibility are deferred.

## Implementation Steps

1. Add pure referral eligibility, mutation, and currency-grouping rules in `packages/domain/src/referrals.ts`, shared Zod inputs in `packages/validators/src/index.ts`, and focused domain tests.
2. Add `member_referral` and `member_referral_audit` Drizzle tables, migration `0018` with RLS/indexes/self-referral constraints, and DB isolation/constraint tests.
3. Add testable referral operations and a `referral` tRPC router with staff dashboard/assign and owner correct/history procedures; register it in the app router.
4. Build the responsive `/referrals` web screen with summary cards, referrer and student filters, assignment confirmation, owner correction, and audit history; add it to owner/instructor navigation only.
5. Extend both demo seed modes and surgical cleanup to include assigned and unassigned referral examples.
6. Document O9 and ADR 52, update roadmap/architecture/changelog, and mark this plan complete.
7. Run static verification (`pnpm typecheck` and `pnpm lint`) and fix issues. Do not execute tests; provide exact focused test commands to the user.

## Current Step

Implementation complete. Focused tests are written but were not executed under the session rule; desktop/PWA manual interaction checks remain for the user.

## Completion

- Steps 1–6 complete.
- Step 7 complete: repo-wide typecheck (17/17), lint (15/15), and Drizzle migration consistency check passed.
- Tests were not run. The focused commands are listed in the final handoff.

## Edge Cases & Risks

- Initial assignment races are resolved by the unique academy/student key and surfaced as a precondition error.
- Cross-academy IDs are rejected before writes; RLS provides a second isolation boundary.
- Removed students are included in reporting data but excluded by the dashboard default.
- Missing dues and missing confirmed payments produce explicit empty/null values rather than errors.
- Revenue aggregation never combines currencies.

## Test Plan

- Domain: membership eligibility, pending/suspended/removed cases, self-referral, assignment state, and currency grouping.
- Database: academy RLS isolation, uniqueness, self-referral constraint, and audit isolation.
- API operations: staff assignment, duplicate/concurrent rejection, instructor correction denial through procedure tier, owner correction/clearing, and cross-academy rejection.
- Reporting: removed/default visibility, retroactive payments, correction behavior, missing dues/payments, and multiple currencies.
- Manual: desktop and PWA filters/grouping, confirmation/correction/history, instructor locked state, and loading/error/empty states.

## Doc Updates

- `docs/spec.md`: O9
- `docs/issues/52-internal-referral-tracking.md`: ADR 52
- `docs/map.md`, `docs/roadmap.md`, `docs/architecture.md`, and `CHANGELOG.md`
