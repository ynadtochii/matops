# Stripe payments: first release slices

**Status: design only, not implemented. Created 2026-10-13, rewritten 2026-10-26 as slices.** This is the plan for the first Stripe work. It starts with the smallest integration and grows in slices. Slices 1 and 2 are designed in full here. Later slices are listed in section 11, and the [full Stripe design](stripe-gym-payments-design.md) is their reference. **No slice ships to production until its acceptance list in section 10 passes locally in Stripe test mode.**

## 1. Rules

- **The gym owns its Stripe account.** An owner connects a Stripe account they already have, or creates a new one in the same flow.
- **MatOps keeps no owner keys.** MatOps stores only the account id (`acct_...`). It calls Stripe with its own platform key and a `Stripe-Account` header that names the gym's account. It does not store the OAuth `access_token` or `refresh_token`.
- **MatOps holds no money.** Every payment is a direct charge on the gym's account. There is no application fee and no transfer. The gym pays Stripe's fees and sees them in its Dashboard.
- **One account per gym.** A Stripe account links to one MatOps gym, and a gym links to one Stripe account.
- **No business rule changes.** The monthly dues model of ADR 40 stays as it is: plans, monthly prices, deadlines, grace days, access holds, `bookingGate` and the access verdict. Stripe is one more way to reach `confirmed`.
- **The gym's Stripe Dashboard stays the gym's.** Invoices the owner creates there, refunds, receipts, disputes and payouts keep working as today. MatOps does not read or change them.
- **Drop-ins.** `/drop-in/<token>` stays free.

## 2. Today and the target

|                  | Today                                                     | After slices 1 and 2                                     | Next (slice 3)                                    |
| ---------------- | --------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------- |
| Stripe account   | The owner has one and uses it alone                       | Connected to MatOps through OAuth                        | Same                                              |
| How students pay | Stripe invoices sent from the Dashboard, or bank transfer | Also: Pay now on the current month, by card              | Also: a monthly subscription                      |
| Month status     | Manual: "I paid" and "Mark paid"                          | A card payment marks the month `confirmed` automatically | Each paid subscription invoice confirms its month |
| MatOps code      | Manual dues behind the payment flag, no Stripe code       | Connect, Checkout, one webhook                           | Stripe customers, Billing, Customer Portal        |

## 3. Slices

| Slice | What it adds                             | Needed before              |
| ----- | ---------------------------------------- | -------------------------- |
| 0     | Owner switch for the payment flag        | Slice 2 reaches a real gym |
| 1     | Connect a Stripe account, no payments    | Slice 2                    |
| 2     | Pay the current month once, by card      | Slice 3                    |
| 3     | Monthly subscriptions                    | Section 11                 |
| 4     | MB WAY, Multibanco and SEPA Direct Debit | Section 11                 |

Each slice is released on its own after its local acceptance passes.

## 4. Slice 0: payment flag switch

Pay now lives on the membership notice, which shows only while `entity.membership_enforced_at` is set. Today no screen sets it (ADR 142). Slices 1 and 2 can be tested locally by setting it in the dev database, but they cannot reach a real gym without this slice.

- **Settings:** an owner switch, **Track membership payments**. On sets `membership_enforced_at`. Off sets it back to null.
- **On** turns on the existing manual dues for that academy: the Memberships page, bank details, "I paid", deadlines, grace days, holds and the booking gate.
- **Off** hides them again. `bookingGate` skips the payment check, as it does today.
- ADR 142 removed the per-academy payment switch. This slice brings it back, so it needs a new ADR.

This is a product decision, not Stripe code (open question 1).

## 5. Slice 1: connect a Stripe account

### Owner flow

On **Settings**, an owner sees a **Stripe** card with one of three states: **Not connected**, **Finish setup in Stripe**, **Ready**. Managers see the card read-only.

1. The owner taps **Connect with Stripe**.
2. Stripe's page asks the owner to sign in.
   - **Has an account:** the owner picks it and allows the connection.
   - **Has no account:** the owner creates one in the same flow.
3. Stripe sends the owner back to MatOps with a one-time code.
4. MatOps trades the code for the account id and shows the card in its new state.
5. **Disconnect** on the same card removes the connection.

### How it works

- **Stripe Connect OAuth** with `scope=read_write` (Stripe docs: [OAuth with Standard accounts](https://docs.stripe.com/connect/oauth-standard-accounts), [OAuth reference](https://docs.stripe.com/connect/oauth-reference)).
- **Start:** `GET /api/stripe/connect/start?entity=<id>`.
  - The server checks that the signed-in user is the owner of that academy.
  - It makes a random `state` value and stores it with the entity id in a short-lived, http-only cookie (10 minutes).
  - It redirects to `https://connect.stripe.com/oauth/authorize` with `client_id`, `scope=read_write`, `state` and `redirect_uri`. It prefills `stripe_user[email]` and `stripe_user[business_name]`, which help only a new account.
- **Callback:** `GET /api/stripe/connect/callback`.
  - It checks that `state` matches the cookie. This blocks CSRF, an attack where another site starts the flow in the owner's browser. Then it deletes the cookie.
  - It checks again that the user is the owner of that academy.
  - On `error=access_denied`, it returns to Settings with "Connection cancelled".
  - It posts the code to `https://connect.stripe.com/oauth/token` once. Stripe drops the connection if the same code is used twice.
  - It checks that `livemode` in the answer matches the secret key's mode.
  - It reads the account and stores `charges_enabled` and `details_submitted`.
  - If another gym already has this account, the unique index refuses the insert, and the owner sees "This Stripe account is already linked to another gym".
- **Ready** means `charges_enabled` is true. A brand-new account may need more setup first. The card then shows **Finish setup in Stripe**, which links to the gym's Stripe Dashboard. The `account.updated` webhook keeps both values current.
- **Disconnect** posts to `https://connect.stripe.com/oauth/deauthorize` and marks the row disconnected.
- **The gym can also disconnect from its own Stripe Dashboard.** The `account.application.deauthorized` webhook then marks the row disconnected. After that, MatOps can no longer read the account, so this event is not fetched again.
- **After a disconnect**, Pay now disappears. A payment already in progress no longer confirms its month, because MatOps cannot read the account. The owner marks that month paid by hand.

### Limits

- **Stripe says OAuth is "not recommended for new Connect platforms".** It is still supported, and it is the documented way to connect an account that already exists.
- **An account controlled by another platform cannot connect.** If another app created the gym's Stripe account, the owner creates a new account in the same flow.
- **MatOps does not see the gym's own invoices or subscriptions.** A student could pay twice: through a Stripe invoice from the owner and through Pay now. The owner stops sending invoices to students who use Pay now.

## 6. Slice 2: pay the current month by card

### Student flow

1. **Pay now shows** next to "I paid" on the membership notice (web `membership-notice.tsx`, app Profile) only when **all** of these hold:
   - the gym's Stripe account is connected and ready
   - the current month, in the academy's time zone, has a price above 0 and at least Stripe's minimum charge (EUR 0.50)
   - the price is in a currency with two decimals, such as EUR, so `priceMinor` is Stripe's `unit_amount`
   - the current month is `unpaid`
   - the student has no open access hold, from this month or any other. This is the same rule as "I paid" (`claimMonth`). A rejected month still needs the owner to resolve it.
2. **The server checks again.** It loads the student's own active assignment, the current month, its price and currency (`monthEvidence`), and the gym's account. It never takes an amount or a month from the browser.
3. **It creates or reuses one payment row**, in this order:
   1. In a short transaction, take the month lock (`lockMembershipMonth`: an advisory lock, then `select ... for update`). The month row may not exist yet. The lock still covers it.
   2. If an `open` `month_payment` exists for this month and has not passed its `expires_at`, send the student to its Checkout URL and stop.
   3. If an `open` row has passed its `expires_at`, set it to `expired`. This frees the unique index.
   4. Insert a new `month_payment` with status `creating`, the amount and the currency. A unique index allows only one `creating` or `open` row per month. Commit.
   5. Outside the transaction, create the Checkout Session on the gym's account. Use the `month_payment` id as the idempotency key.
   6. Save the session id, URL and `expires_at`, and set status `open`.
   7. If the server stops after step 4, the next tap finds the `creating` row and repeats step 5 with the same key. Stripe returns the same session.
   8. If Stripe answers step 5 with a 4xx error, set the row to `failed`. Stripe replays the same error for the same key for 24 hours, so the next tap needs a new row.
4. **The Checkout Session:**
   - `payment` mode, one line item: "{Plan name}, {Month Year}", with the saved amount and currency
   - `payment_method_types: ["card"]`. Apple Pay and Google Pay appear with cards when the gym has them on.
   - `client_reference_id` = the `month_payment` id. No email, phone or health data.
   - expiry after 30 minutes. A row whose `expires_at` has passed counts as expired; no event is needed.
5. **The student pays and returns.** The return page says **Checking payment**, then **Paid** or **Payment not completed**.
   - **The return is not proof of payment.** Only the confirmation in section 7 changes the month.
   - The return page loads the `month_payment` that belongs to the signed-in student. The session id in the URL is only a hint.
   - **Expo app:** the app opens the Checkout URL in the browser. The return URL is the web return page. When the app comes back to the front, it reloads the month.

### The month write

- **One write path.** The `confirmed` write of `markMonth` moves into one shared function. "Mark paid" and the Stripe confirmation both call it. It does, in order:
  1. lock the month and check the version
  2. take the price snapshot (`monthEvidence`)
  3. upsert the month as `confirmed` with `reviewedAt`. For Stripe, `reviewedBy` is null.
  4. write the audit row: `actorId` null, event `stripe_paid`, the Checkout Session id in `reason`. Screens name the actor "Stripe" when `actorId` is null.
  5. after the commit, move the student's provisional bookings to paid (`promotePaidBookings`) in each academy's own scope. `markMonth` does this with `ctx.afterCommit`. The webhook has no tRPC context, so the shared function takes its own after-commit step.
- **Holds stay with the owner.** The hold release stays only in "Mark paid", where the owner gives a reason. Pay now never shows while a hold is open.

### Edge cases

- **The month is already `confirmed`** (staff marked it paid while the student was paying). MatOps marks the `month_payment` paid and paid twice, and does not change the month. The owner's month board shows **Paid twice, refund in Stripe**.
- **The student tapped "I paid", then paid by card.** The month goes from `reported` to `confirmed`. If a bank transfer also arrives, the owner refunds one of them. The audit shows both events.
- **An owner rejects the month while the student is on Stripe's page.** If the payment succeeds, the month becomes `confirmed`, but the hold stays. The student stays blocked until the owner resolves the hold with "Mark paid", as today.
- **The price changed after the session was created.** The session keeps its amount. MatOps confirms the month and keeps the amount actually paid on the `month_payment`.
- **The assignment was suspended or cancelled during Checkout.** MatOps still confirms the month, and suspension still blocks booking. The owner refunds in Stripe if needed.
- **A refund made in Stripe** does not change the month. The owner marks the month unpaid with the existing control if needed.
- **The month ends while the student is on Stripe's page.** The payment still confirms the month the session was created for.

## 7. Webhook and confirmation (slices 1 and 2)

- **One Connect endpoint**, `POST /api/stripe/webhook`.
  - It checks the signature on the raw body.
  - It checks that the event's live or test mode matches the key.
  - An unknown account or a mode mismatch gets 200 and a log line, so Stripe stops retrying.
- **Finding the gym before RLS.** RLS (row-level security, Postgres rules that show a gym only its own rows) needs the gym id before any read, but the event only names the Stripe account. One named base-connection read, `resolveStripeAccount(accountId)`, returns only the gym id. It is added to the tenancy exceptions in `docs/architecture.md` §5. Everything after it runs inside `withScope({ organizationId })`.
- **Events:**
  - `account.updated` (slice 1)
  - `account.application.deauthorized` (slice 1)
  - `checkout.session.completed` (slice 2)
- **Confirmation steps**, shared by the webhook, the return page and **Check with Stripe**:
  1. Fetch the current Checkout Session or account from Stripe by id. Do not trust the event payload or the browser.
  2. In one short transaction:
     - Load the `month_payment` by `client_reference_id`.
     - Check that the account, amount and currency match it, and that `payment_status` is `paid`.
     - Apply it with the shared month write.
  3. After the commit, run the booking promotion from the shared write.
  4. On an error, roll back, report to Sentry with the session id and gym, and return 500 so Stripe retries.
- **Running the steps twice changes nothing.** A paid row stays paid, and a confirmed month stays confirmed. MatOps therefore keeps no table of processed event ids.
- **No Stripe call runs inside a database transaction.** Every create call sends an idempotency key.

## 8. Data

All migrations add tables or columns only, and contain no data changes. Each new table has RLS on `app.organization_id`, the `matops_app` grant and a PGlite leak test.

- **`payment_provider_account`** (slice 1, one row per gym):
  - gym id (unique)
  - Stripe account id (unique)
  - live or test
  - `charges_enabled`, `details_submitted`
  - connected by and at
  - disconnected at
  - no tokens and no keys
- **`month_payment`** (slice 2, one row per Checkout Session):
  - gym
  - Stripe account id
  - assignment and month (the `membership_month` key)
  - status: `creating`, `open`, `paid`, `failed`, `expired`
  - amount and currency
  - Checkout Session id (unique), URL, `expires_at`
  - payment intent id (unique)
  - paid twice (yes or no)
  - created at

  A unique index allows only one `creating` or `open` row per month.

No column changes on `membership_month`. A month was paid through Stripe when it has a paid `month_payment` row.

## 9. Operations

- **Stripe platform setup (once, in test mode and in live mode):**
  1. A MatOps Stripe account with Connect turned on and the platform profile filled in.
  2. OAuth turned on in Connect settings (Onboarding options, OAuth). Copy the `client_id`.
  3. Redirect URLs: `http://localhost:3004/api/stripe/connect/callback` in test mode, the HTTPS production URL in live mode.
  4. A Connect webhook endpoint for production. Locally, the Stripe CLI forwards events.
- **Env vars:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`. Dev uses test values only. Production uses live values. OAuth and Checkout return URLs come from the configured base URL, never from a request header.
- **Off switch for all gyms:** with no `STRIPE_SECRET_KEY`, the Stripe card and Pay now are hidden. The webhook returns 503, so Stripe keeps retrying events for up to 3 days. When the key is back, payments made in that time still confirm. The manual flow keeps working.
- **Off switch for one gym:** Disconnect (slice 1).
- **Monitoring:**
  - Every confirmation error goes to Sentry with the session id and gym.
  - A webhook endpoint that is set up wrong never reaches Sentry. Stripe emails the platform account when an endpoint keeps failing. The platform owner reads that email.
- **Repair:** **Check with Stripe**, on a month whose `month_payment` is `creating` or `open`, runs the confirmation steps for that row. MatOps has no scheduled jobs, so this recovers an event that Stripe stopped retrying.
- **Code layout:**
  - One `StripeClient` interface in a small `packages/stripe` package, with a real client and an in-memory fake.
  - The fake signs webhook events, so router tests in `packages/api/test` cover the webhook and the shared month write over PGlite.

## 10. Acceptance (local, Stripe test mode)

Run on a laptop against the dev database:

- Use test values in `.env`.
- Forward webhooks with `stripe listen --forward-connect-to localhost:3004/api/stripe/webhook`.
- To test slice 2 before slice 0 exists, set `membership_enforced_at` in the dev database.

Production needs live values and a registered Connect webhook endpoint, and only after every item of that slice passes.

**Slice 0:**

- Turn the switch on. The Memberships page, bank details and "I paid" appear, and the booking gate applies.
- Turn it off. They disappear, and approved students book as today.

**Slice 1:**

- Connect an existing test account. The card shows "Ready".
- Create a new account in the flow and stop halfway. The card shows "Finish setup in Stripe". Finish setup. The card shows "Ready" only after Stripe says so.
- Cancel on Stripe's page. Settings shows "Connection cancelled", and nothing is stored.
- Open the callback with a wrong `state`. Nothing is stored.
- Connect the same account to a second gym. It is refused.
- Disconnect in MatOps. The card shows "Not connected".
- Disconnect from the Stripe Dashboard. The webhook marks the gym disconnected.
- A manager sees the card and cannot change it.
- The database holds no token or key for the gym.

**Slice 2:**

- Pay the current month by test card. The month becomes `confirmed`, the money is on the gym's test account, and the platform account has no charge.
- After a card payment, the student's provisional bookings for the month become paid.
- A student with an open access hold, from this month or an earlier one, sees no Pay now.
- A price of 0, or a price below EUR 0.50, shows no Pay now.
- Decline a card, leave the page, and wait past the 30 minutes. The month does not change. The old row becomes `expired`, and Pay now creates a new session.
- Make the Checkout create call fail with a 4xx error. The row becomes `failed`, and the next tap creates a new row.
- Two taps or two tabs open one session.
- Stop the server between saving the row and creating the session. The next tap reuses the same session.
- Stop the server after payment, before the webhook. Restart, then confirm the month with the replayed event and with "Check with Stripe".
- Mark the month paid while the student is on Stripe's page. The payment is recorded, and the month board shows "Paid twice".
- The same event twice changes nothing.
- Open the return page with another student's session id. It shows nothing about that payment.
- The Expo app opens Checkout in the browser and shows the new month status when it comes back.
- Without `STRIPE_SECRET_KEY`, nothing Stripe-related shows, the manual flow works, and the webhook returns 503. Put the key back. Stripe resends the event, and the month confirms.

## 11. Later slices

Each is a separate decision. The [full Stripe design](stripe-gym-payments-design.md) and MAAT are the reference.

**Slice 3: monthly subscriptions.** Owners will most likely ask for this next.

- One Stripe customer per student on the gym's account.
- Checkout in `subscription` mode, billed on the 1st in the academy's time zone.
- `invoice.paid` confirms the invoice's month through the same shared write.
- The Stripe Customer Portal lets the student update the card. Cancelling and pausing stay in the gym's Dashboard. `customer.subscription.deleted` ends the link.
- Pay now hides for a student with an active subscription, so nobody pays twice.
- Stripe Billing adds its own fee, which the gym pays.

**Slice 4: Portuguese local methods.** MB WAY, Multibanco and SEPA Direct Debit.

- Adds the delayed path: a `processing` status, the `reported` month write, and the events `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`.
- The claims list leaves out months whose payment is processing. A failed delayed payment sets the month back to `unpaid` only if staff did not change it meanwhile.
- Before this slice, check in Stripe test mode whether MB WAY confirms at once. If it does, it can move into slice 2.

**Later:**

- refund sync: a full refund in Stripe sets the month back to `unpaid`
- an owner payment link, `/pay/<token>`, for a student who does not use the app
- linking students to customers and subscriptions that already exist in the gym's Stripe account
- class packs and trial classes

### Choices made

- **Checkout, not Stripe Invoices, for slice 2.** Checkout needs no Stripe customer and has no Invoicing fee. Subscriptions in slice 3 create invoices anyway.
- **Cards only in slice 2.** This leaves out the delayed-payment path until slice 4.
- **OAuth, not accounts that MatOps creates.** One flow covers owners with and without a Stripe account, and the gym keeps full control of its account.

## 12. Open questions

1. **Slice 0. Decide before slice 2 reaches a real gym.** Turning on the payment flag turns on dues enforcement (ADR 40) for that gym. Decide whether owners get the switch or it stays a direct database change.
2. **Portuguese invoices.** Stripe sends receipts. Portuguese businesses may need invoices from tax-authority-certified software. Confirm with an accountant before a Portuguese gym takes live payments.
3. **Country support.** Confirm that Stripe supports the platform country and each gym's country for OAuth-connected accounts.
4. **OAuth's future.** Stripe does not recommend OAuth for new platforms. Check before slice 1 that the MatOps platform can turn it on, and watch for changes.
5. **Slice 3 first month.** Decide how a subscription that starts mid-month pays for the current month: full price, a prorated amount, or the first charge on the next 1st.
