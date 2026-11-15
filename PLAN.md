# Goal
Make membership periods rolling: each membership falls due on its own payment day, not on the 1st of every month. The owner can change a member's payment day and push back the due date of any one period.

## Behavior
- A membership is paid in periods of one month counted from its payment day. Joining on 15 Nov gives 15 Nov to 14 Dec, then 15 Dec to 14 Jan.
- A payment day of the 29th, 30th or 31st falls on the last day of shorter months (31 Jan, 28 or 29 Feb, 31 Mar). Every date is counted from the original day, so it never drifts down.
- Due date (the first moment access stops if unpaid):
  - first period of a staff-assigned plan: start + 3 days (replaces the fixed 7, `JOIN_GRACE_DAYS`)
  - first period of a plan the student chose: no grace (ADR 159, unchanged)
  - renewals: start + the owner's Days to pay (`membership_policy.grace_days`, unchanged)
- Existing memberships stay on calendar months (payment day the 1st). Nothing converts them automatically. The owner moves a member with Change payment date.
- Prices stay monthly (`access_plan_price.effective_month` keeps its first-of-month check). A period uses the price in force on its start date. No proration anywhere.
- No reminders, no timers. Everything is worked out from dates on read.

### Owner: change payment date
- Student Membership tab: "Pays on the 15th of each month · Next payment 15 Dec". **Change payment date**, owner only (UI and server).
- The owner picks any next payment date after today. The current period shortens or stretches to reach it. Its paid status and price stay. From that date the member pays on that day each month.
- The dialog shows the effect before saving: "This period runs 15 Nov to 9 Dec. From 10 Dec they pay on the 10th of each month."
- Refused, with a message that says what to do, only when the result would break records:
  - a period after the current one is paid or claimed ("They paid ahead to 14 Mar. Discard that purchase first, or pick a date after it.")
  - a plan change is scheduled
  - the membership is suspended or ended

### Owner: change one due date
- On the student's Membership tab and on the Months board row: **Change due date** for the current or a future period, owner only.
- Any date the owner wants, earlier or later. A date in the past closes booking now.
- Writes `membership_month.deadline` (creates the unpaid row when there is none) and an audit row with the old and new date and an optional reason.
- The access check already reads the stored deadline first (`api/src/membership-access.ts`), and claims and decisions keep it (`held?.deadline ?? evidence.deadline` in `api/src/month-write.ts`). A Reset button removes the override and goes back to the computed date.

## Decisions
- Keep the tables. `membership_month.month`, `access_assignment.start_month` / `end_month`, `access_assignment_change.effective_month` and `membership_purchase.first_month` hold a period start date. DB column names stay (same precedent as `academy_id`). TypeScript names that become false are renamed (`MonthKey` → `PeriodKey`, `nextMonth` → `nextPeriod`, `appliesInMonth` → `appliesInPeriod`).
- New columns `access_assignment.period_anchor` and `period_anchor_from`, both null until a payment date change. Structure only, no backfill.
- Change payment date stays on the same row: the period running at the change ends on the new date, and later periods count from it.
- The Stripe reference becomes `assignmentId_YYYY-MM-DD`. The parser still accepts the old `assignmentId_YYYY-MM` (maps to `-01`), because sessions that are already open in Stripe carry it.
- `MonthSchema` drops `endsWith("-01")`. The server checks that the date is a real period start of that assignment.

## Implementation Steps
1. **Domain** (`packages/domain`, tests first): `periodStart(anchor, k)`, `periodOf(date, anchor)`, `nextPeriod`, `periodEnd` (clamped to the assignment end), `appliesInPeriod`, `payDeadline` with the three rules above, `paymentDateProblem`, `dueDateProblem`. Port `monthsFrom`, `upfrontStart`, `paidUntil` to periods. Tests: 31 Jan through Feb, leap years, Dec to Jan, null anchor equals today's months, shortened and stretched current period, refusal after pay ahead, deadline override.
2. **Migration `0021_rolling_periods`**: add `period_anchor`, drop the four `*_is_a_month` checks. Check that the `_journal.json` `when` is above `1789853331052`. Update the Drizzle schema to match.
3. **Loaders**: `membership-access.ts` and `membership-status.ts` work out `nowPeriod` / `sessionPeriod` per assignment and query by `(assignment_id, month)` pairs. Same for `bookingsNeedingReview` per booking. `membershipAccess` itself does not change.
4. **Writers**: `assignOne` (stop forcing `-01`, write the anchor), plan change and end at `nextPeriod`, `studentPlan.choose`, `claimMonth`, `markMonth`, `purchase-write`, `card-payment` with the reference parser. New owner procedures `accessPlan.changePaymentDate` (`lockAssignmentsOf`, one transaction, audit) and `accessPlan.setDueDate` / reset (`lockMembershipMonth`, version check, audit).
5. **Boards and exports**: `monthBoard` (each row is that member's current period, unpaid first), `claims`, `mine`, `stats.ts`, `dataTransfer` (export gains the period end), seed `augment.ts`.
6. **Clients**: web `memberships/months.tsx`, `member-detail`, `my-dues`, `choose-membership`, `membership-notice` (period labels "15 Nov - 14 Dec", "Paid through 14 Mar 2027", the two owner dialogs). Expo `membership.tsx` and `(tabs)/profile.tsx` (labels only, students cannot change dates).
7. **Docs**: ADR 163 "Rolling membership periods" (supersedes the calendar-month parts of ADR 126, 129, 161). Spec FP6, FA2, FA4, S9, S11, O7. `architecture.md`, `roadmap.md`, `CHANGELOG.md`.

## Verification
- `pnpm typecheck` and `pnpm lint` after each step.
- Tests for the user to run: `pnpm -F @matops/domain test`, `pnpm -F @matops/api test`, `pnpm -F @matops/db test`.
- Router tests over PGlite: a member who joins on the 15th is admitted until the 18th and blocked from the 18th at 00:00. A changed payment date moves the next due date. A due date override admits and blocks as set and survives a claim and a confirm. The old Stripe reference still confirms a calendar month.

## Current Step
Built (2026-11-15): steps 1 to 7, then review fixes. Deviation from the plan: Change payment date does not split the assignment. It writes `period_anchor` and `period_anchor_from` on the same row, so holds, pause, end and pay ahead keep working. DB names and most TS names (`month`, `MonthKey`) kept. Typecheck and lint pass. Tests written, not run: `pnpm -F @matops/domain test`, `pnpm -F @matops/api test`. Migration `0021` not applied to dev yet.

## Risk
- Production has one live academy. The migration only adds a column and drops checks, so the old code keeps working while it lands. Before step 4 ships, check (read-only) how many `access_assignment` rows production holds.
- The loaders move from one org-wide month to one period per assignment. That is the main place for bugs, so the step 3 tests must cover the union of two assignments with different payment days.
