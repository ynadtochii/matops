# 157 · Card payment webhook: the gym's own Stripe confirms the month

**Status:** accepted, built (tests written, not run; migrations `0014_stripe_hook` and `0015_stripe_hook_problem` applied to dev 2026-10-28, not production) · **Date:** 2026-10-28 · **Area:** `packages/db` (`stripe_hook`, `card_payment`), `packages/domain` (`parsePaymentLinkReference`), `packages/api` (`month-write.ts`, `card-payment.ts`, `secret-box.ts`, `stripe-signature.ts`, `router/cardPayment.ts`), `apps/nextjs` (Settings, Memberships, `/api/stripe/hooks/[token]`) · **Plan:** [Stripe steps](../stripe-one-time-payments.md), step B1 · **Builds on:** [156](156-plan-payment-link.md)

## Context

Step A (ADR 156) sends students to the gym's own Stripe Payment Link with `client_reference_id=<assignmentId>_<YYYY-MM>`, and staff confirm the month by hand. MatOps still has no Stripe platform account, so it cannot call Stripe for a gym. The gym's own Stripe can send MatOps a signed webhook.

## Decision

1. **One webhook URL per gym**, `/api/stripe/hooks/<token>`. The owner creates it in Settings, adds it in their Stripe Dashboard for `checkout.session.completed`, and pastes the endpoint's signing secret back. `stripe_hook` holds the gym, the token (plain, so Settings can show the URL again; the token alone cannot pass the signature check), the encrypted secret, and the time of the last verified event. Like `drop_in_link`, the table has no RLS and `matops_app` has no grant: the route resolves the token on the base connection before any gym is known, and everything after runs in `withScope({ organizationId })`.
2. **The secret is encrypted** with AES-256-GCM under `PAYMENT_HOOK_KEY` (32 bytes, base64, server only, never in the database). Without the key the Settings card is hidden and the route returns 503. To rotate, move the old key to `PAYMENT_HOOK_KEY_PREVIOUS` and set a new `PAYMENT_HOOK_KEY`: secrets sealed with either key still open, and each gym's next save seals with the new one. The secret is never returned to a browser or logged.
3. **The payload is trusted only after the signature check** with that gym's secret (raw body, `v1` HMAC, 5-minute tolerance). MatOps has no API key for the gym, so it does not fetch the session. In production (`VERCEL_ENV=production`) test-mode events are ignored, so a test payment never confirms a real month.
4. **Matching.** Only `checkout.session.completed` with `payment_status` `paid` counts. The reference names the membership and month. The month is confirmed only when the membership exists in that gym, applies in that month, the month is unpaid or reported, and `amount_total` and the currency equal the month's price.
5. **One month write.** `writeMonthDecision` (moved with its helpers from the router to `month-write.ts`) is the write "Mark paid" uses: lock, price snapshot, upsert, audit row, then the booking promotion after commit. A card confirmation writes `reviewedBy` null and an audit row with event `stripe_paid`, `actorId` null and the Checkout Session id as reason. A hold is never lifted.
6. **Every paid session gets a `card_payment` row** (RLS on the gym), unique on the Session id, so a repeated event changes nothing. Outcomes: `confirmed`; `paid_twice` (the month was already confirmed); `needs_review` (no reference, unknown membership, a month the membership does not cover, a rejected month, or a different amount), with a plain reason. Memberships, Payments shows "Card payments to check" for anything not confirmed until staff hide it.
7. **Owner only** sets up, replaces or turns off the webhook. Owners and managers read its state and the review list.
8. **Limits.** Bodies over 64 KB get 413. Each server process allows 300 requests a minute per IP (Stripe sends from a few shared addresses), and the shared `rate_limit` table allows 600 a minute per gym; over either, 429 and Stripe retries.
9. **Setup feedback.** A message that fails the signature check, or a test-mode message on the live site, is recorded on the hook (`last_problem`, migration `0015`). Settings then names the problem and the fix. A verified message clears it and updates the last-message time.
10. **Guided setup.** Settings shows four numbered steps with a button to Stripe's webhooks page, copy buttons for the URL and the event name, and the secret field. The payment link dialog shows this month's exact amount (`accessPlan.list` returns `currentAmount`) and opens Stripe's Payment Link page. Changing a price on a plan with a link reminds the owner to add a link for the new amount.

## Consequences

- No MatOps Stripe account, no gym API key. The gym's money never passes through MatOps.
- Each gym does a one-time setup in its Stripe Dashboard. Setting up again gives a new URL; the old one stops working.
- A payment whose amount differs from the price (for example a stale link after a price change) is not confirmed automatically; staff see it with the reason.
- Out of scope for B1: subscriptions (`invoice.paid`, step B2) and delayed methods such as SEPA or Multibanco (step B3). A Stripe refund does not change the month.
- `card_payment` keeps the assignment id without a foreign key, like `membership_month_audit`, so the payment record outlives a deleted membership.

## Addendum 2026-10-30: security review fixes

1. **The signature is checked before the gym's budget is used.** The 600-a-minute limit per gym now counts only messages that pass the signature check. Someone who knows a gym's URL but not its secret can no longer use up the budget and delay real Stripe messages.
2. **A failed check writes at most once a minute.** `bad_signature` and `test_event` are not written again while the same problem was recorded less than a minute ago, so junk requests do not cause a database write each.
3. **Each encrypted secret is tied to its gym.** The gym id is bound into the AES-GCM encryption (additional authenticated data), so a secret copied into another gym's row does not open. `sealSecret`, `openSecret` and `openSecretWithAny` take the gym id. No row was sealed before this change on dev or production, so nothing had to be sealed again.
