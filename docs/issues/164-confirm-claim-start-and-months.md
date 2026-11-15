# 164: Confirm a claim with its start day and months

**Status:** accepted, 2026-11-15. Builds on ADR 127 (claims), ADR 159 (students choose a plan), ADR 161 (pay ahead) and ADR 163 (rolling periods). API and web built (2026-11-15).

## Problem

A student who chooses a plan starts their membership that day, so their payment day is the day they chose. The money often arrived on another day: cash at the desk two days before, or a transfer the next morning. The owner also took payments for several months at the desk and had no way to say so while checking the claim.

## Decision

1. **Confirm opens a dialog** (`accessPlan.confirmClaim`) in To check, with two fields filled from the claim.
2. **Starts on**, only for the first payment of a membership: the claim's first period is the start, the membership has no payment date change, and nothing on it is confirmed yet (`canMoveClaimStart`). The default is the day they paid (the cash date) or else the day they sent the claim (`claimStartDay`). The day must be today or earlier, and no more than one month before the claim (`claimStartProblem`). Saving moves `start_month` and `starts_on` to that day, so it is also the payment day.
3. **Months**, 1 to 12. The default is what the student reported. More months are written as a pay-ahead purchase (ADR 161) at the plan's price and rule, and the membership renews monthly after them.
4. **Only the owner changes the values.** A manager sees the same dialog read-only and confirms the claim's defaults. The server refuses a manager who sends a different start, months or total. The owner can also type a different total, as in Record months.
5. **A renewal claim** shows only Months. The payment day of a running membership changes with Payment date (ADR 163).
6. **How it is written.** With no change, the claim's rows are confirmed through `writeMonthDecision`, as Mark paid does. With a change, the claim's rows (and, when the start moves, every row of the membership) are removed with a `claim_adjusted` audit row each, the old purchase is marked discarded, and the new months are written confirmed with the claim's payment details (method, cash taker, date, note, receipt). One month at the plain price stays a single month row; anything else is a purchase. A final `claim_adjusted` audit row keeps the start, months, total and note.
7. Refused when a row being replaced was declined before (it has a hold), or when the moved start would overlap another membership on the same plan.

## Data

No migration.

## Not done

- Mark paid on the Months board still confirms a claim as it is, without moving the start.
- The Expo app is unchanged: students do not confirm claims.
