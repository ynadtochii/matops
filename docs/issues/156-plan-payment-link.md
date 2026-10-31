# 156 · Plan payment link: students pay by card on the gym's own Stripe page

**Status:** accepted, built (tests written, not run; migration `0013_plan_payment_link` applied to dev 2026-10-26, not production) · **Date:** 2026-10-26 · **Area:** `packages/db` (`access_plan_price.payment_link_url`), `packages/domain` (`payment-link.ts`), `packages/validators`, `packages/api` (`accessPlan.setPaymentLink`, `setPrice`, `list`, `mine`), `apps/nextjs` (Memberships plans, membership notice), `apps/expo` (Profile) · **Plan:** [Stripe steps](../stripe-one-time-payments.md), step A

## Context

Gym owners already have Stripe accounts and create payments in their Stripe Dashboard. MatOps cannot open a live Stripe platform account yet: Stripe does not support a business in Ukraine, the operator's country. So the first card payment must work with no MatOps Stripe account, no keys, and no money passing through MatOps. ADR 155 (Connect OAuth) stays on the side branch `stripe-connect-oauth` as step C.

## Decision

1. **The owner pastes a Stripe Payment Link on a plan price.** `access_plan_price.payment_link_url`, nullable, migration `0013_plan_payment_link`. A link belongs to one price row, so a price change for a future month carries its own link, and the current month keeps the link for the amount members were asked for.
2. **Only `https://buy.stripe.com/...` links are accepted** (`isStripePaymentLink` in validators): HTTPS, that exact host, no port, no user info, no fragment, at most 500 characters.
3. **`accessPlan.setPaymentLink`** (owner or manager) sets or clears the link of the price row in effect this month. `setPrice` takes an optional link for the row it writes; a correction of the same month without a link keeps the stored one. `accessPlan.list` returns this month's link per plan.
4. **`accessPlan.mine` returns `cardPaymentUrl`** for the month being judged: the link plus `client_reference_id=<assignmentId>_<YYYY-MM>` and `prefilled_email`. The reference changes nothing now. It lets step B match a payment to its month.
5. **Pay by card** shows on the web membership notice and the app Profile next to the bank details, before "I paid". The page opens in a new tab or the in-app browser. The student then taps "I paid", and staff confirm with Mark paid, as for a transfer. Without bank details, a card link alone is enough to show the payment block.

## Consequences

- No MatOps Stripe account, keys, secrets or webhooks. The gym receives the money and pays Stripe's fees.
- Confirmation stays manual. Staff check the payment in their Stripe Dashboard.
- The owner must create a new Payment Link when a price changes. A link with a different amount from the price in MatOps is not detected in this step.
- A Payment Link with a recurring price starts a Stripe subscription. MatOps does not follow it yet; each month is still confirmed by hand.
- Step B adds a webhook from the gym's own Stripe account to confirm months automatically. Step C (ADR 155) adds Connect OAuth once a MatOps platform account can be verified.

## Addendum 2026-10-30: owner only

A payment link decides whose Stripe account receives the students' money. A manager, or anyone with a stolen manager login, could paste a link to their own account. So `accessPlan.setPaymentLink` is now owner only (new tier `organizationOwnerProcedure`), and `setPrice` refuses a link from anyone but the owner. Managers can still change a price without a link, and the Payment link button and the link field are hidden from them. Decision 3 above said "owner or manager"; this replaces it.
