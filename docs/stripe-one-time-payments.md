# Stripe one-time payments: first release

**Status: design only, not implemented. Created 2026-10-13, revised after two reviews the same day.** This is the first Stripe release. It adds one thing: a student pays the **current** membership month online, and a confirmed payment marks that month paid. An owner payment link is release 1b. Automatic monthly payments and the rest of the [full Stripe design](stripe-gym-payments-design.md) come later and reuse this release. **Nothing ships to production until the acceptance list in section 9 passes locally in Stripe test mode.**

## 1. Goal

A student taps **Pay now** on the current month, in the same place as "I paid". They pay on a Stripe-hosted page with any method the gym has turned on. When Stripe confirms the payment, MatOps marks the month `confirmed` through the same write that the owner's "Mark paid" uses. The owner does not review anything.

## 2. What does not change

- **Business rules.** The monthly dues model of ADR 40 stays exactly as it is: plans, monthly prices, deadlines, grace days, access holds, `bookingGate` and the access verdict. Stripe is only a new way to reach `confirmed`.
- **Which month.** Only the current month, in the academy's time zone, can be paid. This is the same month "I paid" covers (`claimMonth` uses `monthOf(new Date())`).
- **The manual flow.** Bank details, "I paid", the owner's claims list and "Mark paid" all keep working. A gym can use both.
- **Drop-ins.** `/drop-in/<token>` stays free.

## 3. What is new on screen

- **Settings:** a Stripe card for owners (section 4).
- **Student membership notice** (web `membership-notice.tsx`, app Profile): a **Pay now** button next to "I paid", and a **Payment processing** line while a delayed payment settles.
- **Return page** after Stripe Checkout: **Checking payment**, then **Paid**, **Payment processing** or **Payment not completed**.
- **Owner month board:**
  - a **Paid twice, refund in Stripe** label
  - an **Also reported as bank transfer** label
  - a **Check with Stripe** button on a month whose Stripe payment is not final

## 4. Connecting the gym

On **Settings**, an owner sees a **Stripe** card with one of three states: **Not connected**, **Finish setup in Stripe**, **Ready**.

1. The owner picks the country of the business and taps **Connect Stripe**. The country goes straight to Stripe and is not stored.
2. MatOps creates a connected account on the gym's behalf with these controller settings:
   - `stripe_dashboard.type = full`, so the gym gets its own full Stripe Dashboard
   - `fees.payer = account`, so the gym pays Stripe's fees directly
   - `losses.payments = stripe`
   - `requirement_collection = stripe`
3. MatOps creates an Account Link (`account_onboarding`) and sends the owner to Stripe. Return and refresh URLs come from a configured base URL, never from a request header.
4. **Returning from Stripe does not prove the account is ready.** MatOps reads the account and stores `charges_enabled` and `details_submitted`. The `account.updated` webhook keeps them current.
5. **Stop card payments.** The owner can switch online payments off on the same card. Pay now then disappears, and no new sessions are created. The account stays linked, so payments already in progress still confirm their months.

Rules:

- Only an owner can connect or switch payments off. Managers can open Settings, and they see the Stripe card read-only.
- One gym has one Stripe account.
- MatOps takes **no fee**. The month stores the full price. The gym receives the price minus Stripe's fees, and sees those fees in its Stripe Dashboard.
- The gym turns payment methods on and off in its Stripe Dashboard: cards, Apple Pay, Google Pay, MB WAY, Multibanco, SEPA Direct Debit. **MB WAY and Multibanco work only in EUR**, so a plan priced in another currency offers cards and wallets only.
- Refunds, receipts, disputes and payouts happen in the gym's Stripe Dashboard.

## 5. Paying the current month

### Student flow

1. **Pay now shows** only when **all** of these hold:
   - payments are on and the gym's Stripe account is ready
   - the current month has a price above 0 and at least Stripe's minimum charge (EUR 0.50)
   - the price is in a currency with two decimals, such as EUR, so `priceMinor` is Stripe's `unit_amount`
   - the current month is `unpaid`
   - the student has no open access hold, from this month or any other. This is the same rule as "I paid" (`claimMonth`). A rejected month still needs the owner to resolve it.
   - no Stripe payment for this month is processing
2. **The server checks again.** It loads the student's own active assignment, the current month, its price and currency (the same `monthEvidence` that "Mark paid" uses), and the gym's account. It never takes an amount or a month from the browser.
3. **It creates or reuses one payment row**, in this order:
   1. In a short transaction, take the month lock (`lockMembershipMonth`: an advisory lock, then `select ... for update`). The month row may not exist yet. The lock still covers it.
   2. If an `open` `month_payment` exists for this month and has not passed its `expires_at`, send the student to its Checkout URL and stop.
   3. If an `open` row has passed its `expires_at`, set it to `expired`. This frees the unique index.
   4. Insert a new `month_payment` with status `creating`, the amount and the currency. A unique index allows only one `creating`, `open` or `processing` row per month. Commit.
   5. Outside the transaction, create the Checkout Session on the gym's account. Use the `month_payment` id as the idempotency key.
   6. Save the session id, URL and `expires_at`, and set status `open`.
   7. If the server stops after step 4, the next tap finds the `creating` row and repeats step 5 with the same key. Stripe returns the same session.
   8. If Stripe answers step 5 with a 4xx error, set the row to `failed`. Stripe replays the same error for the same key for 24 hours, so the next tap needs a new row.
4. **The Checkout Session:**
   - `payment` mode, one line item: "{Plan name}, {Month Year}", with the saved amount and currency
   - payment methods from the gym's Stripe settings (no `payment_method_types`)
   - `client_reference_id` = the `month_payment` id. No email, phone or health data.
   - expiry after 30 minutes. A row whose `expires_at` has passed counts as expired; no event is needed.
5. The student pays on Stripe's page and returns. The return page says **Checking payment** until the server knows the result. **The return is not proof of payment.** Only the confirmation in section 6 changes the month.
   - The return page loads the `month_payment` that belongs to the signed-in student. The session id in the URL is only a hint.
   - **Expo app:** the app opens the Checkout URL in the browser. The return URL is the web return page. When the app comes back to the front, it reloads the month.

### Month status

| Stripe result                                                   | Month status                       | Booking (existing rules) |
| --------------------------------------------------------------- | ---------------------------------- | ------------------------ |
| Paid at once (card, wallet, MB WAY)                             | `confirmed`                        | Allowed                  |
| Checkout completed, payment still processing (Multibanco, SEPA) | `reported`                         | Allowed (provisional)    |
| Delayed payment succeeds                                        | `confirmed`                        | Allowed                  |
| Delayed payment fails                                           | back to `unpaid`, never `rejected` | Existing deadline rules  |
| Session expires or the student leaves                           | no change                          | No change                |

- **One write path.** The month writes of `claimMonth` (`reported`) and `markMonth` (`confirmed`, `unpaid`) move into one shared function. "I paid", "Mark paid" and the Stripe confirmation all call it. It does, in order:
  1. lock the month and check the version
  2. take the price snapshot (`monthEvidence`)
  3. upsert the month: `reported` sets `reportedAt`; `confirmed` and `unpaid` set `reviewedAt`. For Stripe, `claimedBy` and `reviewedBy` are null.
  4. write the audit row
  5. on `confirmed`, after the commit, move the student's provisional bookings to paid (`promotePaidBookings`) in each academy's own scope. `markMonth` does this with `ctx.afterCommit`. The webhook has no tRPC context, so the shared function takes its own after-commit step.

  The hold release stays only in "Mark paid", where the owner gives a reason. Stripe never releases a hold, because Pay now never shows while a hold is open.

- **The claims list leaves out** months whose Stripe payment is processing. The owner cannot reject money that is still settling.
- **A Multibanco reference can stay unpaid for days.** The month stays `reported`, and the student can book as provisional, until Stripe reports success or failure. This is accepted for this release.
- **Audit rows from Stripe** have `actorId` null and the events `stripe_processing`, `stripe_paid` or `stripe_failed`, with the Checkout Session id in `reason`. Screens that show the audit name the actor "Stripe" when `actorId` is null.

### Edge cases

- **The month is already `confirmed`** (for example staff marked it paid while the student was paying). MatOps marks the `month_payment` paid and paid twice, and does not change the month. The owner's month board shows **Paid twice, refund in Stripe**.
- **The student tapped "I paid", then paid by card.** The month goes from `reported` to `confirmed`. If the bank transfer also arrives, the gym is paid twice. The month board shows **Also reported as bank transfer** on a month whose audit has a `reported` event from the student before the Stripe payment.
- **An owner rejects a month while a Stripe session is open.** Rejection creates a hold. If the payment still succeeds, the month becomes `confirmed`, but the hold stays. The student stays blocked until the owner resolves the hold with "Mark paid", as today.
- **A delayed payment fails, but staff already changed the month.** MatOps sets the month back to `unpaid` only if the month version is still the one this payment wrote. Otherwise staff's change stays.
- **The price changed after the session was created.** The session keeps its amount. MatOps confirms the month and keeps the amount actually paid on the `month_payment`.
- **The assignment was suspended or cancelled during Checkout.** MatOps still confirms the month, and suspension still blocks booking. The owner refunds in Stripe if needed.
- **A refund made in Stripe** does not change the month in this release. The owner marks the month unpaid with the existing control if needed.
- **The month ends while a delayed payment is processing.** The payment still confirms the month it was created for.

## 6. Webhook and confirmation

- **One Connect endpoint**, `POST /api/stripe/webhook`.
  - It checks the signature on the raw body.
  - It checks that the event's live or test mode matches the key.
  - An unknown account or a mode mismatch gets 200 and a log line, so Stripe stops retrying.
- **Finding the gym before RLS.** RLS (row-level security, Postgres rules that show a gym only its own rows) needs the gym id before any read, but the event only names the Stripe account. One named base-connection read, `resolveStripeAccount(accountId)`, returns only the gym id. It is added to the tenancy exceptions in `docs/architecture.md` §5. Everything after it runs inside `withScope({ organizationId })`.
- **Events:**
  - `account.updated`
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
- **Confirmation steps**, shared by the webhook, the return page and **Check with Stripe**:
  1. Fetch the current Checkout Session or account from Stripe by id. Do not trust the event payload or the browser.
  2. In one short transaction:
     - Load the `month_payment` by `client_reference_id`.
     - Check that the account, amount and currency match it.
     - Apply the session's current state with the shared month write.
  3. After the commit, run the booking promotion from the shared write.
  4. On an error, roll back, report to Sentry with the session id and gym, and return 500 so Stripe retries.
- **Running the steps twice changes nothing.** Each run writes the session's current state, and a paid row stays paid. MatOps therefore keeps no table of processed event ids.
- **No Stripe call runs inside a database transaction.** Every create call sends an idempotency key.

## 7. Data

All migrations add tables or columns only, and contain no data changes. Each new table has RLS on `app.organization_id`, the `matops_app` grant and a PGlite leak test.

- **`payment_provider_account`** (one row per gym):
  - gym id
  - Stripe account id (unique)
  - live or test
  - `charges_enabled`, `details_submitted`
  - payments on or off
  - connected by and at
- **`month_payment`** (one row per Checkout Session):
  - gym
  - assignment and month (the `membership_month` key)
  - status: `creating`, `open`, `processing`, `paid`, `failed`, `expired`
  - amount and currency
  - Checkout Session id (unique), URL, `expires_at`
  - payment intent id (unique)
  - paid twice (yes or no)
  - the month version this payment wrote
  - created at

  A unique index allows only one `creating`, `open` or `processing` row per month.

No column changes on `membership_month`. A month was paid through Stripe when it has a paid `month_payment` row.

## 8. Operations

- **Env vars:** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Dev uses test keys only. Production uses live keys.
- **Off switches:**
  - For all gyms: with no `STRIPE_SECRET_KEY`, the Stripe card and Pay now are hidden. The webhook returns 503, so Stripe keeps retrying events for up to 3 days. When the key is back, payments already in progress still confirm. The manual flow keeps working.
  - For one gym: the owner's "payments off" control (section 4).
- **Monitoring:**
  - Every confirmation error goes to Sentry with the session id and gym.
  - A webhook endpoint that is set up wrong never reaches Sentry. Stripe emails the platform account when an endpoint keeps failing. The platform owner reads that email.
- **Repair:** **Check with Stripe** runs the confirmation steps for one `month_payment`. MatOps has no scheduled jobs, so this recovers an event that Stripe stopped retrying.
- **Code layout:**
  - One `StripeClient` interface in a small `packages/stripe` package, with a real client and an in-memory fake.
  - The fake signs webhook events, so router tests in `packages/api/test` cover the webhook and the shared month write over PGlite.
- **Payment flag:** the membership notice and the claims list show only while `entity.membership_enforced_at` is set, and no web control sets it (ADR 142). For local testing, set it in the dev database. In production, setting it also turns on all of ADR 40 for that gym: deadlines, grace days, holds and the booking gate. So the first live Stripe gym is also the first gym with dues enforcement. See open question 1.

## 9. Acceptance (local, Stripe test mode)

Run on a laptop against the dev database:

- Use test keys in `.env`.
- Forward webhooks with `stripe listen --forward-connect-to localhost:3004/api/stripe/webhook`.

Production needs live keys and a Connect webhook endpoint registered in Stripe, and only after every item below passes.

- **Connect:**
  - Connect a new test account and stop halfway. The card shows "Finish setup in Stripe".
  - Finish setup. The card shows "Ready" only after Stripe says so.
  - Switch payments off. Pay now disappears, and a payment already in progress still confirms its month.
- **Paying:**
  - Pay the current month by test card. The month becomes `confirmed` and booking follows the existing rules.
  - A student with an open access hold, from this month or an earlier one, sees no Pay now.
  - A price of 0, or a price below EUR 0.50, shows no Pay now.
  - Pay with a delayed method:
    - Success: `reported`, then `confirmed`. The month never appears in the claims list.
    - Failure: `reported`, then `unpaid`.
  - Decline a card, leave the page, and wait past the 30 minutes. The month does not change. The old row becomes `expired`, and Pay now creates a new session.
  - Make the Checkout create call fail with a 4xx error. The row becomes `failed`, and the next tap creates a new row.
  - Two taps or two tabs open one session.
  - Stop the server between saving the row and creating the session. The next tap reuses the same session.
  - Stop the server after payment, before the webhook. Restart, then confirm the month with the replayed event and with "Check with Stripe" on the still `open` row.
  - After a card payment, the student's provisional bookings for the month become paid.
  - The Expo app opens Checkout in the browser and shows the new month status when it comes back.
  - Open the return page with another student's session id. It shows nothing about that payment.
- **Edge cases:**
  - Mark the month paid while the student is on Stripe's page. The payment is recorded and the month board shows "Paid twice".
  - A delayed payment fails after staff changed the month. Staff's change stays.
  - The same event twice changes nothing.
  - Tap "I paid", then pay by card. The month board shows "Also reported as bank transfer".
- **Off switch:** without `STRIPE_SECRET_KEY`, nothing Stripe-related shows, the manual flow works, and the webhook returns 503. Put the key back. Stripe resends the event, and the month confirms.

## 10. Release 1b: owner payment link

Built right after this release, once it passes locally.

- In the owner's month board, the current month has **Copy payment link**, for a parent or a student who does not use the app.
- The link is `/pay/<token>`, a public page. It shows the academy name, the plan, the month, the amount and the student's first name only. Its **Pay now** button runs the same steps as section 5.
- **Finding the gym before RLS:** the link table has no RLS, like `drop_in_link` (ADR 147). It stores the gym id, the month key, a SHA-256 hash of the token, and who created and revoked it. The page reads it on the base connection, then runs everything else inside `withScope`.
- One live link per month. Copying again returns the same link, and the owner can revoke it.
- The page refuses to pay when the month is no longer the current one, the month is not `unpaid`, the student has an open access hold, the assignment is not active, or payments are off.
- Requests are rate-limited with the existing `rate_limit` table, keyed by IP and token hash.

## 11. Open questions

1. **Payment flag control. Decide before the build.** This release is usable only while `membership_enforced_at` is set. Setting it turns on dues enforcement (ADR 40) for that gym, which is a product decision. Decide whether a release adds an owner switch for it or it stays a direct database change.
2. **Portuguese invoices.** Stripe sends receipts. Portuguese businesses may need invoices from tax-authority-certified software. Confirm with an accountant before a Portuguese gym takes live payments.
3. **Country support.** Confirm that Stripe supports both the platform country and the gym's country for connected accounts with these controller settings.

## 12. Next releases

Each item is a separate decision. The [full Stripe design](stripe-gym-payments-design.md) and MAAT are the reference.

1. **Automatic monthly payments.** A subscription anchored to the 1st, in the academy's time zone. Each `invoice.paid` confirms one month through the same shared write. This adds Stripe customers and the Customer Portal for card updates.
2. **Refund sync.** A full refund in Stripe sets the month back to `unpaid`.
3. **Class packs and trial classes**, following MAAT.
4. **Importing saved cards and SEPA mandates** from another provider.
