# 161: Pay several months upfront

**Status:** accepted, 2026-11-01. Extends ADR 40, 128, 158 and 159. API, web and app built (2026-11-01).

## Problem

A membership is paid one month at a time (ADR 40). Gyms sell several months at once, often cheaper: "3 months, 10% off". MatOps cannot record that. Staff mark each month by hand, a student cannot claim more than the current month (`claimMonth` uses today's month), and there is no place for a discount.

A gym will have many plans (BJJ, BJJ and gym, gym and sauna). Separate plans for "BJJ 3 months" and "BJJ 6 months" would multiply the list and the prices to keep in step.

## Decision

1. **One plan, one optional pay-ahead rule.** A plan keeps its monthly price and price history (ADR 128). The owner can add one rule: **from N months** (2 to 12), either **% off** (1 to 90) or a **fixed price per month** lower than the monthly price. Without a rule, paying ahead costs months times the monthly price. Every plan uses the same rule shape, and the Plans list shows it as a short label ("From 3 months: 10% off"). The owner sets it when creating the plan (optional, needs a price) or later from the plan's Pay ahead row.
2. **A student or staff member picks the number of months, 1 to 12** (`MAX_UPFRONT_MONTHS`). The total is worked out from the monthly price of the first month and the rule (`upfrontTotal`). Below the rule's start the student sees a hint: "Pay 3 months to save 10%".
3. **One purchase, one row per month.** `membership_purchase` holds the money: first month, months, total and the rule used (a snapshot). The claim, proof and review stay on the month rows, written the same on each month of the purchase, so the claim and review code stays one shape. Each covered month gets its own `membership_month` row pointing at the purchase, with its share of the total (`splitTotal`: equal shares, the leftover cents on the first month). The booking gate, the month board and every reader of month rows stay as they are.
4. **Cash and bank only for more than one month.** Card stays for a single month on a plan with a Stripe link (ADR 156, 157). The webhook does not change.
5. **Extend.** A purchase starts at the first month not yet paid or claimed (`upfrontStart`), so a student whose current month is paid can pay ahead. Membership shows "Paid until 31 March" (`paidUntil`).
6. **Staff record a purchase** when assigning a plan or later, on the student's Membership tab. The rule fills the total. **Only the owner** may type another total, for a personal deal.
7. **A claim for several months is one item** in To check. Confirm and reject act on every month of the purchase together.
8. **No auto-renew.** When the paid months end, the next month is unpaid and the renewal banner asks the student to choose again, with the same picker.
9. **The owner can discard a purchase.** Its future months stop counting (their rows are removed, an audit row is kept) and the student can choose again. Months already used stay. MatOps does not refund; the gym settles money itself.
10. **Paid months keep the price that was paid.** A later price or rule change does not touch them. A fixed per-month rule that is no longer below the monthly price gives no saving (`upfrontTotal` never charges more than months times the monthly price), and the price dialog warns the owner.
11. **No plan swap with paid future months.** `canSwapChosenPlan` already refuses a plan referenced by a purchase.

## Data

Migration `0020_upfront`, structure only:

- `access_plan`: `discount_from_months` (2 to 12), `discount_percent` (1 to 90), `discount_month_minor` (a positive amount in the plan's currency). A check allows none, or `from` with exactly one of the other two.
- `membership_purchase`: `id`, `organization_id`, `assignment_id`, `first_month`, `months` (1 to 12), `total_minor`, `currency`, `discount_from_months`, `discount_percent`, `discount_month_minor` (the snapshot), `recorded_by`, `discarded_at`, `discarded_by`, `created_at`. Its status is the status of its months. RLS on the organization, like `membership_month`.
- `membership_month.purchase_id`, nullable, with a same-organization foreign key and no cascade. `deleteOrganizationAssignments` deletes purchases after months.

## Pure rules (`packages/domain/src/upfront.ts`)

`upfrontTotal`, `upfrontHint`, `splitTotal`, `upfrontStart`, `paidUntil`, `discountProblem`.

## Not in scope

Auto-renew and subscriptions, card payment for more than one month, refunds, freezing a term, promo codes, family discounts, more than one rule per plan, and discounts that start or end on a date.

## Code

- Rules: `packages/domain/src/upfront.ts` (`upfrontTotal`, `upfrontHint`, `splitTotal`, `monthsFrom`, `upfrontStart`, `paidUntil`, `discountProblem`, `upfrontRuleLabel`).
- Write: `packages/api/src/purchase-write.ts`. `quotePurchase` picks the first free month and the total, `writePurchase` locks every month, refuses one already paid or claimed, and writes the purchase, the month rows and their audit rows. `dropPurchaseMonths` removes months on reject and discard and keeps any month a hold points at.
- API: `accessPlan.setDiscount` (owner), `accessPlan.create` with an optional `discount` (owner only, checked against the price), `accessPlan.recordPurchase` (owner or manager; another total is owner only), `accessPlan.discardPurchase` (owner). `claimMonth` takes `months`; with more than one month, or a start after this month, it needs a cash or bank method. `markMonth` paid on a month of a reported purchase confirms all its months. `rejectClaim` on a purchase rejects that month, removes the others and discards the purchase. `claims` returns one row per purchase with `purchase`. `mine` returns `paidUntil`, `paidUntilLabel` and `upfront`; `monthBoard` and `forUser` return `paidUntilLabel`, and `forUser` lists live purchases. `studentPlan.options` returns each plan's `discount`; `studentPlan.choose` treats a purchase as a reference, so the plan cannot be swapped.
- Web: Plans tab "Pay ahead" row and dialog (`memberships/plans.tsx`), months picker and Pay ahead mode (`choose-membership.tsx`, `my-dues.tsx`), purchase line in To check, "Paid through" on Months, Record months and Discard on the student's Membership tab (`record-months.tsx`).
- App: the same picker and Pay ahead on `apps/expo/src/app/membership.tsx`.
- Tests: `packages/domain/test/upfront.test.ts`, `packages/api/test/upfront-purchase.test.ts`, the RLS coverage list.
