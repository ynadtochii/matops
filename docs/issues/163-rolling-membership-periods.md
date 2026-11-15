# 163: Rolling membership periods

**Status:** accepted, 2026-11-15. Supersedes the calendar-month parts of ADR 126, 129 and 161. Amends ADR 159 (first-period grace). API, web and app built (2026-11-15); suites not run here.

## Problem

A membership was paid by calendar month, from the 1st to the 1st. Someone who joined on 15 November paid the full November price for 16 days, then December was due on 1 December. Gyms sell a month from the day you join. Owners also need to move a member's payment day, or give one member a few more days to pay, and MatOps had no way to do either.

## Decision

1. **A period is one month from the membership's anchor.** The anchor is `access_assignment.start_month`, which now holds any date. Period k starts on the anchor plus k months. When a month is too short, the start is that month's last day. Every start is counted from the anchor, not from the previous period, so an anchor on 31 January gives 28 February, then 31 March (`periodStart`, `periodOf`, `nextPeriod` in `packages/domain/src/membership-period.ts`).
2. **The keys stay, their meaning changes.** `membership_month.month`, `access_assignment.end_month`, `access_assignment_change.effective_month` and `membership_purchase.first_month` hold a period start date. Column names stay, the same way `academy_id` holds an entity id. Prices stay monthly: `access_plan_price.effective_month` keeps its first-of-month check, and a period uses the price in force on its start date.
3. **Existing memberships are not converted.** Their anchor is the 1st, so their periods are still calendar months. New memberships start on the day they are assigned or chosen. CSV import with a start month still anchors on the 1st.
4. **Deadlines.** The first period of a new membership: the join day plus 3 days (`JOIN_GRACE_DAYS`, was 7). Every other period: its start plus the owner's Days to pay. A plan the student chose themselves still has no grace in its first period (ADR 159). A stored `membership_month.deadline` still wins over the computed one.
5. **The owner changes a payment date** (`accessPlan.changePaymentDate`, owner only). The owner picks any date after today. The current assignment ends on that date (`end_month`), and a new assignment on the same plan starts there with the original `starts_on`. So every assignment keeps one fixed anchor, past periods stay on the row they were paid on, and the first period of the continuation renews instead of counting as a join. A period ends at the next anchor date or the assignment's end, whichever is first (`periodBoundary`). Refused when the membership is paused or already ends, a plan change is scheduled, a payment is declined (open hold), or a later period is paid or claimed (`paymentDateProblem`).
6. **The owner changes one due date** (`accessPlan.setDueDate`, owner only). Any date for the current or a later unpaid period. It writes `membership_month.deadline` (creating the unpaid row when there is none) and an audit row (`due_date_changed`, `due_date_reset`). Reset writes the computed deadline back.
7. **The Stripe reference keeps the day** of a rolling period: `<assignment>_YYYY-MM-DD`. A period on the 1st still writes `<assignment>_YYYY-MM`, and the parser reads both, so sessions already open in Stripe still match.
8. **Readers judge each assignment in its own period.** The access loader, roster, booking review, Months board, `mine` and `forUser` work out today's (or the session's) period per assignment from its anchor and read the month rows by those keys. `membershipAccess` itself did not change.

## Data

Migration `0021_rolling_periods`, structure only: drops `access_assignment_start_is_a_month`, `access_assignment_starts_on_in_month`, `access_assignment_end_is_a_month`, `access_assignment_change_is_a_month`, `membership_month_is_a_month` and `membership_purchase_is_a_month`. No new column: the anchor is `start_month`. Old code keeps working while the migration lands, because it only writes first-of-month dates.

## Not done

- No proration. A shortened or stretched period keeps its price.
- No automatic move of existing members to rolling dates. The owner moves each one with Change payment date.
- The plan change writer (ADR 129) is not built, so nothing else writes `access_assignment_change`.
