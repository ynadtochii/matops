# Gym-owned Stripe payments

**Status: design only, not implemented. Updated 2026-10-12.** This design copies the structure and flow of [MAAT](https://maatapp.com/), a gym app for BJJ and MMA academies that runs gym payments through Stripe. It replaces the 2026-09-29 drop-in-only draft. The old `stripe` branch (commit `f8100f0`) is not a base for this work. **Nothing ships to production until the full acceptance list in section 9 passes locally in Stripe test mode.** The first release is smaller: [one-time payments for membership months](stripe-one-time-payments.md). This document is the reference for later releases.

## Summary

- Each gym has its **own Stripe account**. MatOps creates it, and Stripe's hosted pages finish the setup. The gym signs in to its own full Stripe Dashboard.
- A gym sells two kinds of product, as in MAAT:
  - **Memberships.** Recurring, charged by Stripe Billing.
  - **Class packs.** A one-off payment for a number of classes, with an optional expiry.
- Students buy on Stripe-hosted Checkout from the web or the app.
- **MatOps owns membership status and the booking rule.** Stripe owns money: charges, retries, receipts, invoices, refunds, pauses, tax and payouts.
- **The manual payment model stays** (ADR 40: monthly dues, "I paid" claim, owner review). A student can have a card membership, a manual membership, or both.
- **MatOps takes no fee.** The gym pays Stripe's own fees and sees them in its Stripe Dashboard. MAAT adds 1%. MatOps does not (see `docs/business-model.md`).
- MatOps never sees or stores card or bank details.

## Who does what

| MatOps                                                           | The gym's Stripe Dashboard                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Connect Stripe and show whether payments are ready               | Bank account, payout schedule, statement descriptor                          |
| Memberships and class packs: price, period, trial days, classes  | Payment methods (cards by default; SEPA Direct Debit if the gym turns it on) |
| Student buys a membership or a pack                              | Refunds, full or partial                                                     |
| Staff cancel a membership (now, end of period, or a chosen date) | Pausing billing                                                              |
| Membership status, badges, the past-due list, the booking rule   | Coupons, changing a billing date                                             |
| Free trial classes for students with no membership               | Smart Retries and failed-payment emails                                      |
| Manual dues (ADR 40)                                             | Invoices, receipts, tax settings and tax reports (see open question 1)       |
| Retry a failed payment, resync from Stripe                       | Disputes and earnings exports                                                |
| Import existing card and SEPA subscriptions (section 6)          | The data migration request to the old provider                               |

**Rule for owners:** do not create subscriptions directly in Stripe. MatOps cannot link them to a student. MatOps shows such a subscription as "not linked" and gives it no access.

## 1. Connecting the gym

- Only an owner can connect. MatOps creates a connected account with these controller settings:
  - `stripe_dashboard.type = full`
  - `fees.payer = account`, so the gym pays Stripe directly
  - `losses.payments = stripe`
  - `requirement_collection = stripe`
- The account country comes from a new country field on the academy. The owner picks it before connecting.
- MatOps then opens a Stripe Account Link (`account_onboarding`) and sends the owner to Stripe.
- **Returning from Stripe does not prove the account is ready.** MatOps reads the account and stores `charges_enabled`, `details_submitted` and the card payment capability. It updates them again on the `account.updated` webhook.
- One gym has one Stripe account. Save the mapping, the live or test mode, and who connected it and when.
- Build every return and refresh URL from a configured base URL, never from a request header.
- **Connecting an account the gym already has (OAuth) is later work.**
- **Turning card sales off** stops new Checkout Sessions. It does not unlink the account. Webhooks for existing subscriptions keep arriving and keep being handled. Subscriptions keep charging until staff cancel them, so the off switch lists every subscription that is still active.

## 2. Products

Both kinds live in MatOps and are copied to the gym's Stripe account as one Product and one Price each.

**Membership** (recurring):

- name, description, price and currency
- billing period: week, month, 3 months, 6 months or year
- free trial days (optional): the card is saved now, and the first charge runs when the trial ends
- the academies it covers (`access_plan_entity`, as today)

**Class pack** (one-off):

- name, description, price and currency
- number of classes, for example 5, 10 or 20
- expiry in days after purchase (optional)

Rules:

- **A price change creates a new Stripe Price** for new buyers only. Current subscribers keep their price. A bulk price increase for current subscribers, which MAAT has, is later work.
- MatOps never deletes a Stripe Price. It archives it.
- Card products use their own price and period. Manual memberships keep the monthly `access_plan_price` model of ADR 40. One plan is either a card product or a manual plan, never both, so the two price models never mix.
- One currency per gym, taken from the Stripe account's default currency. MatOps refuses a product in another currency.
- Limits on classes per week, and coach approval when a student goes over the limit, are later work.

## 3. Buying

1. On web or in the app, a signed-in student picks a membership or a pack and taps Pay.
   - The app opens Checkout in the browser. Apple guideline 3.1.3(e) and Google Play allow outside payment for in-person gym services (see `docs/research/payment-provider-alternatives.md`).
2. The server checks again:
   - The student is an approved, active member.
   - The product is on sale.
   - The gym's Stripe account is ready.
   - For a membership: the student has no live card membership at this academy.
3. MatOps creates one Stripe Customer per person on the gym's account, the first time it is needed. It saves the id on the person, and sends an idempotency key so two requests at once cannot create two customers.
4. MatOps creates a Checkout Session:
   - Membership: `subscription` mode, with `trial_period_days` when the product has trial days.
   - Class pack: `payment` mode.
   - Payment methods come from the gym's own Stripe settings, so SEPA appears only if the gym turned it on. Class packs are cards only, because a pack must be usable as soon as it is paid.
   - Each session has an idempotency key. If an open session already exists for the same student and product, MatOps reuses it.
5. **The billing date is the day of the first payment**, or the day the trial ends. A student who pays on the 18th is charged on the 18th of each period. MatOps does not prorate anything. The gym can move a billing date in its Stripe Dashboard.
6. **The redirect back is not proof of payment.** MatOps records a purchase only from a signed webhook.
   - A card payment completes at once.
   - A SEPA payment confirms days later through `invoice.paid`. Until then the membership shows "Payment processing". Test in Stripe test mode whether Stripe reports this as `active` or `incomplete` before building the status table.

## 4. The booking rule

**Switch.** `entity.membership_enforced_at` stays the one switch, as today. Null means approval-only booking (ADR 142). Set means "a membership is needed to book". The owner turns it on in Settings, which is a new control. Selling card products also needs a ready Stripe account. Both are off for new academies.

When the switch is on, a student can book if one of these holds. This is MAAT's rule.

1. **A card membership admits them** (table below).
2. **A manual membership admits them** under the ADR 40 rules (paid month, reported month, or before the deadline).
3. **A class pack has a class left** and has not expired. The booking uses one class. Cancelling the booking gives it back.
4. **They have free trial classes left.** The owner sets the number per academy, and the default is **0**, as in MAAT. A trial class is counted when it is booked, and a cancelled booking gives it back.

Otherwise the booking is refused with "Buy a membership or a class pack to book."

Card membership status comes from Stripe and is stored with `current_period_end`:

| Stripe status                  | MatOps status      | Admits                                                                    |
| ------------------------------ | ------------------ | ------------------------------------------------------------------------- |
| `trialing`                     | Trial              | Yes                                                                       |
| `active`                       | Active             | Yes                                                                       |
| `past_due`, `unpaid`           | Past due           | Yes by default. No when the owner turns on "Block booking while past due" |
| `paused` (pause set in Stripe) | Paused             | No                                                                        |
| `canceled`                     | Ended              | Yes until `current_period_end`, then no                                   |
| `incomplete`                   | Payment processing | No (see the SEPA check in section 3)                                      |
| `incomplete_expired`           | Not started        | No                                                                        |

- **This fits the current domain code.** `membershipAccess` (`packages/domain/src/membership-access.ts`) already admits when any one covering membership admits. A card membership becomes one more kind of membership in that list. Class packs and trial classes are checked only when the verdict is `not-covered` or `expired`.
- **Each booking records what admitted it:** card membership, manual membership, pack (with the pack id), or trial. Pack and trial use are counted from bookings that are not cancelled, so MatOps keeps no separate counter.
- **Past due is visible.** Staff see a red badge on the roster and member list. The Students page gets a "Past due" filter, like MAAT's list. The student sees a notice that tells them to update their card.
- **Smart Retries.** Stripe retries failed payments. The setup guide tells the gym to set the last-retry action to "mark as unpaid", as MAAT does. MatOps handles either setting.
- **Failed payment.** On `invoice.payment_failed`, MatOps sends the student one in-app notice and push. Stripe's own emails (failed payment, card expiring) are turned on by the gym in its Dashboard.
- **Refunds** are made in Stripe. A refund changes no access by itself, and MatOps shows a "refunded" badge on the payment.

## 5. Cancelling and self-service

- **Students cannot cancel on their own**, as in MAAT. The gym controls the agreement: notice periods, fixed terms and unpaid invoices. The student asks the gym.
- **Staff cancel in MatOps** with three choices: now, at the end of the paid period, or on a chosen date. MatOps cancels the subscription in Stripe after the database write commits. A cancel made in the Stripe Dashboard also arrives by webhook and ends the membership the same way.
- **Students manage cards and invoices** in the Stripe Customer Portal. The Portal is set up for card update and invoice download only: no cancel, no plan switch. Only the signed-in student can open it, and only for their own customer id at this gym.
- **Plan switching** is later work. MAAT's rule, to copy then: an upgrade happens now and is prorated, and a downgrade waits for the next billing date. Stripe computes both.
- **Pausing** happens in the Stripe Dashboard. MatOps shows Paused and refuses booking.

## 6. Moving from another provider

Like MAAT, MatOps helps a gym move its students' saved cards and SEPA mandates from GoCardless, Mindbody, Glofox or another provider. Students do not enter their details again and are not charged twice.

1. **The gym asks Stripe to import the payment data.** The old provider sends it straight to Stripe. MatOps never touches card numbers or bank details. Stripe then creates Customers with saved payment methods on the gym's account and gives the gym a file that maps old ids to new ones. Before building this step, confirm Stripe's import process for a connected account that MatOps created.
2. **The owner uploads one CSV to MatOps**, with one row per student:
   - student email
   - Stripe customer id
   - MatOps membership product
   - next billing date
3. **MatOps shows a dry run** before writing anything. It lists matched students, unmatched emails, customers with no saved payment method, and products that are not card products.
4. **On confirm, MatOps creates one subscription per row.**
   - The first charge is the next billing date, with no charge today and no proration.
   - Each row has an idempotency key, so running the import again creates nothing twice.
   - It saves the customer id on the person and links the subscription to their membership.
5. **The gym cancels the old provider's subscriptions** for the same students before the first MatOps billing date. The import screen says this in plain words, because MatOps cannot do it.

## 7. Webhooks and Stripe calls

- **One Connect webhook endpoint**, `POST /api/stripe/webhook`.
  - It checks the signature on the raw body.
  - It checks that the event's live or test mode matches the key.
  - It looks up the gym from `event.account`.
  - A mode mismatch or an unknown account gets a 200 response and a log line, so Stripe stops retrying.
- **Processing order for each event:**
  1. Fetch the current object from Stripe by id. Never trust the event payload, and never trust the browser.
  2. In one short database transaction:
     - Insert the event id. If it was already processed, stop.
     - Check the amount, currency, account and MatOps reference.
     - Write the new state.
     - Mark the event processed.
  3. After commit, run any side effect in Stripe, such as a cancel.
  4. On an error, roll back, save the error on the event row, and return 500 so Stripe retries.
- **Order does not matter.** Each handler writes the object's current state from Stripe, so an old event can never undo a newer one.
- **No Stripe call runs inside a database transaction.** Every create call sends an idempotency key: accounts, customers, products, prices, sessions, subscriptions and cancels.
- Events handled:
  - Account: `account.updated`.
  - Checkout: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`.
  - Invoices: `invoice.paid`, `invoice.payment_failed`.
  - Subscriptions: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`.
  - Refunds: `charge.refunded`.
- The return page may fetch the session and run the same confirmation path, so the student waits less. Webhooks stay required.

## 8. Data and operations

All migrations are structure only and add columns or tables, so they are safe while the old build still serves. Every new academy or gym table gets RLS, the `matops_app` grant and a PGlite leak test.

**Data:**

- **Academy:** country; free trial classes (default 0); "Block booking while past due" (default off).
- **Gym Stripe account:** gym id (one row per gym), account id (unique), live or test, `charges_enabled`, `details_submitted`, card sales on or off, connected by and at.
- **Stripe events:** event id (unique), type, gym, received at, processed at, last error.
- **Customer:** Stripe customer id on `person`, unique per gym.
- **Product:**
  - On `access_plan`: kind (manual, card membership, or class pack), billing period, trial days, class count, expiry days, Stripe product id.
  - A card price table: Stripe price id, amount, currency, created at, archived at.
- **Card membership:** on `access_assignment`: Stripe subscription id (unique), status, `current_period_end`, cancel date.
- **Class pack purchase:** person, product, classes, expires at, Checkout Session id (unique), payment intent id (unique), refunded at.
- **Booking:** what admitted it (card, manual, pack id, or trial).

Nothing stores card numbers or bank details.

**Operations:**

- **Off switch for all gyms:** with no `STRIPE_SECRET_KEY`, every payment screen is hidden and the webhook returns 200. Subscriptions keep charging in each gym's Stripe account. The runbook must say so.
- **Monitoring:**
  - Every handler error goes to Sentry with the event id and gym.
  - Owners and support see failed `stripe_event` rows.
- **Repair:** a "Resync from Stripe" action fetches one subscription, purchase or account by id and runs the same handler. MatOps has no scheduled jobs, so this is how an event Stripe gave up on is recovered.

## 9. Acceptance before production (local, Stripe test mode)

Run everything on a laptop against the dev database:

- Use Stripe test-mode keys in `.env`.
- Forward webhooks with `stripe listen --forward-connect-to localhost:3004/api/stripe/webhook`.
- Use Stripe **test clocks** for renewals, trial ends and retries.

No live keys and no production deploy until every item passes. Production then needs live keys and a Connect webhook endpoint registered in Stripe.

- **Connecting.**
  - Connect a new test account and finish setup. MatOps shows ready only when Stripe says so.
  - Turn card sales off and on. Events for existing subscriptions keep being handled.
- **Buying.**
  - Membership by card, membership with trial days, membership by SEPA ("Payment processing", then Active), class pack by card.
  - Two taps or two tabs create one subscription or one purchase.
  - A missed browser return still records the purchase from the webhook.
- **Booking rule.**
  - With the switch on: a student with no membership, no pack and 0 trial classes is refused.
  - With 1 trial class: one booking works, the second is refused, and cancelling the first gives the class back.
  - A 5-class pack allows five bookings, and an expired pack allows none.
  - A student with both a manual and a card membership is admitted when either one admits.
  - With the switch off: approval-only booking works as today, and no payment screen shows.
- **Renewals and failures.**
  - Advance a test clock past a renewal and a trial end.
  - Make a renewal fail with a test card. The status shows past due, and booking follows the owner setting.
  - Let the final retry run, with both the "unpaid" and the "cancel" setting.
  - Retry from MatOps.
- **Changes from both sides.**
  - Staff cancel now, at period end and on a date. Cancel in the Stripe Dashboard.
  - The Portal allows card update and invoices only.
  - Pause and resume in Stripe.
  - A refund shows the badge and keeps access.
  - Repeated and out-of-order events change nothing.
  - Stop the server during a purchase, then use "Resync from Stripe".
- **Import.**
  - Import a CSV against test customers with saved test cards.
  - The dry run lists every problem row.
  - Running it twice creates nothing twice.
  - The first charge happens on the given date in a test clock.

## 10. Open questions

1. **Portuguese invoices.** Portugal is the first market. Portuguese businesses may need to issue invoices from tax-authority-certified software, and Stripe invoices may not count. Confirm with an accountant before a Portuguese gym takes live payments. If they do not count, the gym needs a certified invoicing tool next to Stripe.
2. **Import for a connected account.** Confirm that a gym whose Stripe account MatOps created can ask Stripe to import data from its old provider. Also confirm who must make the request: the gym or MatOps.
3. **Country support.** Confirm that Stripe supports both the platform country and each gym's country for Connect accounts with these controller settings.

## 11. What is not in this design

- Connecting an existing Stripe account (OAuth).
- Plan switching with proration.
- A bulk price increase, sign-up fees, add-on products, family discounts.
- Classes-per-week limits with coach approval.
- Students freezing or cancelling their own membership.
- A public visitor paying per class. `/drop-in/<token>` stays free.
- MB WAY and other one-off local payment methods.
- Refunds started from MatOps, MatOps billing gyms, a MatOps fee on payments.
- Automatic reconciliation, a second payment provider.
