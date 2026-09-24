# Automatic payments: final plan (2026-09-24)

This is the one payment plan for matops. A gym connects its own Stripe
account. A student pays one month by card, or turns on automatic monthly
payment. A visitor pays for one class. matops moves no money and stores no
card. It mirrors what Stripe reports. The manual rail (bank transfer, "I paid",
staff confirm) stays and is the default.

Nothing here is built. No implementation, deploy, provider account change or
live payment is authorized by this file.

---

## 1. What was checked today

Against the repo (HEAD `22c1926`, branch `main`, 99 uncommitted paths):

- Migrations are `0000_baseline` plus `0001` to `0003`. The next is **`0004`**.
  ADRs run to 140, so the new one is **141**.
- No scheduler exists: `.github/workflows/` holds only `ci.yml` and
  `apps/nextjs/vercel.json` holds only the region. ADR 135 excludes scheduled
  jobs. `CLAUDE.md` still describes cron routes and a public REST API that are
  gone; fix it in the same change as ADR 141.
- `markMonth` (`packages/api/src/router/accessPlan.ts:1943`) resolves an access
  hold **only** when staff pass `resolveHoldReason`. A provider payment must
  not resolve a hold.
- `appendMonthAudit` (`accessPlan.ts:1039`) requires `actorId`, while the
  column is nullable. A provider write has no user, so the helper's input
  becomes optional there.
- The reception route (`apps/nextjs/src/app/api/reception/route.ts`) and
  `resolveReceptionLink` (`packages/db/src/reception.ts:100`) are the template:
  a sessionless route resolves one id on `ctx.baseDb`, then everything runs
  in `withScope`.
- `expo-web-browser` is already a dependency, so the app opens Checkout with
  no native change.

Against Stripe's documentation (fetched 2026-09-24):

- **"You can't use one-time prices in Checkout Sessions when
  `proration_behavior` is `none`."** (billing-cycle page). So one Checkout
  cannot carry the current month as a one-time line plus a subscription
  anchored on the 1st with no proration.
- Checkout in `subscription` mode does accept `subscription_data.billing_cycle_anchor`
  and `proration_behavior: none`, which makes the period up to the anchor free
  and raises no invoice until the first full period.
- Accounts v1 is still supported and is **required** for OAuth. Stripe
  recommends v2 for new platforms but does not deprecate v1. The choice is
  below (D2).
- Stripe retries a failed webhook delivery for up to three days in live mode.

## 2. Decisions

### D1. In the monorepo, as a module. Settled.

The user decided this. No separate payment service: Stripe already sits
between matops and the money, and the repo has every pattern a webhook needs.

### D2. Stripe Connect, the gym's own dashboard, direct charges, a new connected account

matops creates the connected account with the v1 Accounts API and controller
properties (`stripe_dashboard.type = full`, `fees.payer = account`,
`losses.payments = stripe`), then sends the owner through a hosted Account
Link. matops stores the `acct_…` id and nothing else about the account.

The gym is the merchant of record. Every customer, product, price, checkout,
subscription and portal call carries the `Stripe-Account` header. Stripe's
fees are the gym's, payouts land in the gym's bank, refunds and disputes are
handled in the gym's dashboard. No application fee, no field for one.

**Existing Stripe accounts.** Hosted onboarding lets the owner sign in with a
Stripe login they already have, and the connected account is added under that
login. Connecting an account the gym already uses elsewhere, as-is, needs
OAuth. That is a later slice, added only when a pilot gym asks. This answers
the account question without building two flows.

### D3. Hosted Stripe surfaces only, cards only in this wave

| Job | Surface |
|---|---|
| Pay one month | Checkout Session, `mode: payment` |
| Start automatic payment | Checkout Session, `mode: subscription` |
| Change card, see invoices, stop renewing | Customer Portal, plan switching off |
| Visitor pays one class | Checkout Session, `mode: payment`, guest |

No Stripe.js, no card fields, no Payment Sheet, no `client_secret`.

Every Checkout is created with `payment_method_types: ['card']`. Apple Pay and
Google Pay ride on `card` in Checkout, so they still work. **SEPA Direct Debit
is out of this wave**, for a concrete reason: a delayed
method makes `checkout.session.completed` arrive with `payment_status =
unpaid`, and the real answer comes later as
`checkout.session.async_payment_succeeded` or `_failed`. Restricting to cards
is one parameter and removes two event types and every "paid or not yet"
state from wave 1. SEPA is a later slice that adds exactly those two handlers.

### D4. The calendar month stays the unit. Subscribing starts next month.

`membership_month` is one row per assignment per calendar month. A
subscription must bill those months and no others.

- `subscribe` opens Checkout in `subscription` mode with
  `subscription_data.billing_cycle_anchor` = local midnight on the 1st of next
  month in the organization's calendar zone, and `proration_behavior: none`.
  Stripe raises no invoice until that 1st. The student pays nothing at
  Checkout; Checkout only saves the card.
- **The current month is paid separately**, through the same **Pay this month**
  button slice A3 builds (or by transfer, as today). If the current month is
  still owed when the student presses **Set up automatic payment**, the
  standing shows both buttons and says so in one line: "This month is still
  due. Automatic payment starts on 1 October." Two taps instead of one, and no
  unsupported API combination.
- Every `invoice.paid` names its month from the first line's `period.start`,
  read in the calendar zone through `monthOf`. A pure
  `monthForInvoiceLine(periodStart, timeZone)` in `packages/domain` does that.
- A month written by Stripe is `confirmed`, `reviewed_by` null,
  `paid_via = 'stripe'`, `stripe_invoice_id` set, audit event `provider_paid`
  with a null actor. Staff can still mark it by hand.

A "one page, one payment" flow can come back later through a trial
ending on the 1st (Checkout allows one-time items with a trial), once the
two-tap flow is measured to lose students. Not now.

### D5. One shared confirmation path

Both rails write the same transition. Extract `confirmMonth(tx, {assignment,
month, actor | provider})` from `markMonth`: lock the month, keep the version
rule, snapshot evidence, set `confirmed`, append audit, call
`promotePaidBookings`. `markMonth` calls it with a user; the webhook handlers
call it with provider evidence.

**The webhook never resolves an access hold.** A rejected claim's hold clears
only through the existing explicit staff resolution. Same for approval and suspension: a payment changes none
of them.

### D6. Prices: next month only while anyone is on a card

`access_plan_price` already is a price history by month. Each chargeable row
gets a `stripe_price_id` under one `stripe_product_id` per plan. A zero price
gets no Stripe price and no subscribe button.

New pure rule, `canPriceFromOnCard`: a plan with at least one live subscription
may record a price change **effective next month only**. `canPriceFrom` already
forbids the current month and the past. The change reaches each live
subscription as `subscriptions.update` with the new price and
`proration_behavior: none`, so the next invoice, next month's, carries it.

### D7. matops mirrors every assignment action to Stripe, and survives a crash

A cancelled student who keeps being charged is the one bug this feature must
never have.

| matops action | Stripe call |
|---|---|
| `accessPlan.cancel` | `subscriptions.cancel`, no proration, no final invoice |
| `accessPlan.suspend` | `subscriptions.update` `pause_collection = { behavior: 'void' }` |
| resume | clear `pause_collection` |
| `setPrice` (next month) | `subscriptions.update` with the new price, no proration, one call per live subscription |
| `scheduleChange` | `subscriptions.update` `cancel_at` = the effective month's 1st. The new assignment starts on the manual rail and offers **Set up automatic payment** again |
| `cancelScheduledChange` | clear `cancel_at` |

Moving the subscription to the target assignment is not done. Ending it is
one call, reuses the subscribe path, and needs no new
rule. Keeping the subscription across a plan change is later work.

**Crash gap.** The Stripe call runs in `ctx.afterCommit`,
after the matops row is written. If the process dies between the commit and
the call, a stored error alone would never appear. So the tenant transaction
also writes `stripe_sync_pending_at = now()` on the assignment **before**
commit; the after-commit task clears it on success or writes
`stripe_sync_error` on failure. The owner's screen shows "Waiting for Stripe"
for a pending mark older than a minute and the error text otherwise, both with
**Retry**. Retry re-reads the assignment and re-issues the mirror call, which
is safe to repeat for every call in the table. No queue, no worker.

### D8. A failed charge notifies. It never suspends.

`invoice.payment_failed` writes nothing to the month. The month stays unpaid,
`monthVerdict` says within-grace until the deadline and blocked after, as for
a student who forgot to transfer. Stripe's own retries run for weeks. The
student's standing shows **Fix your card** (a Portal link) and a notice goes
out through the existing notice tables. Suspension stays a staff action.

### D9. The webhook is the fourth enumerated seam exception

`POST /api/stripe/webhook`, modelled on the reception route:

1. Read the raw body, verify the signature with the Connect endpoint secret.
   Refuse a `livemode` that does not match the key in use.
2. Resolve the organization from `event.account` through
   `resolveStripeAccount(accountId, exec)` on `ctx.baseDb`. That lookup is the
   exception: one table, one id, like `resolveReceptionLink`. An unknown
   account is logged to Sentry and answered 200.
3. Open `withScope({ organizationId })`, insert the event into `stripe_event`
   with `ON CONFLICT DO NOTHING`. A duplicate answers 200 at once.
4. Run the handler for the type inside the same transaction. A throw rolls the
   event row back too and answers 500, so Stripe retries. The row also carries
   `error` and `processed_at`, written on a second attempt, so a stuck event is
   visible in the database and in Sentry.

Handled: `account.updated`, `account.application.deauthorized`,
`checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`charge.refunded`. Everything else is recorded and ignored.

**Out of order and stale events.** A handler never trusts the event's
payload for state. It re-reads the object from Stripe by id (`invoices.retrieve`,
`subscriptions.retrieve`) before writing, so a late `payment_failed` after a
`paid` sees the invoice is paid and does nothing. That is one retrieve per
event and removes every ordering rule.

### D10. Recovery is manual in this wave, and gated

No scheduled reconciliation. ADR 135 excludes scheduled jobs and the repo has
no scheduler to hang one on. What catches a missed event:

- Stripe retries a 500 for three days and emails the platform about a failing
  endpoint.
- `stripe_event` rows with an `error`, plus Sentry.
- **Resync** on an assignment: retrieve the subscription and its latest paid
  invoice, rewrite the mirror, safe to repeat. **Check with Stripe** on the
  organization runs Resync over every live subscription, on demand.

A daily reconciliation sweep is written down as later work with a gate: build
it when a missed event is actually observed in the pilot, and record the
change against ADR 135 then. Building it now needs a scheduler the release
contract deliberately does not have.

### D11. Disconnect

`disconnect` clears the connection row. Subscriptions on the gym's Stripe keep
running, because they are the gym's. matops stops writing months from that
account, and every assignment with a `stripe_subscription_id` is shown to the
owner as **Still charging on Stripe** with two choices: cancel it in the
Stripe dashboard, or reconnect. Students are **not** automatically told to pay
by transfer while a card subscription may still charge them, because that
would collect the same month twice.

### D12. Refunds

A full refund (`charge.refunded`, `amount_refunded == amount`) sets the month
back to `unpaid` with audit `provider_refunded`; the earlier `provider_paid`
audit row stays as evidence. A partial refund writes the audit row only.
Disputes are the gym's, in its dashboard, and are recorded as events and
ignored in this wave.

### D13. Who can pay

A student pays through the enrolled tier, so they are signed in on web or in
the app. A person with no account link keeps the manual rail. Payment links
for people without accounts are later work. A visitor pays as a guest from the hosted `/book/<code>` page, which already carries a
private status token per booking.

## 3. Schema delta (migration `0004`, structure only)

| Table | Change |
|---|---|
| `payment_provider_account` *(new)* | `organization_id` pk, `provider` (`stripe`), `account_id` unique, `livemode`, `charges_enabled`, `details_submitted`, `connected_by`, `connected_at`, `disconnected_at`. RLS on `organization_id`. Revoked from `matops_debug_ro`. |
| `stripe_event` *(new)* | `id` (Stripe event id) pk, `organization_id`, `type`, `livemode`, `received_at`, `processed_at`, `error`. RLS on `organization_id`. |
| `access_plan` | + `stripe_product_id` nullable |
| `access_plan_price` | + `stripe_price_id` nullable |
| `person` | + `stripe_customer_id` nullable, unique with `organization_id` |
| `access_assignment` | + `stripe_subscription_id` nullable unique, `stripe_sync_pending_at`, `stripe_sync_error` |
| `membership_month` | + `paid_via` (`transfer` default, `stripe`), `stripe_invoice_id` nullable unique, `stripe_checkout_session_id` nullable unique |
| `academy_profile` | + `drop_in_price_minor`, `drop_in_currency`, null together (slice A6) |
| `drop_in_visit` | + `stripe_payment_intent_id` nullable unique, `paid_at`, `paid_minor`, `paid_currency` (slice A6) |

`organization` is a Better Auth table `matops_app` cannot write, so the
connection lives in its own row. No drops, no backfill. Bump the `when` in
`_journal.json` by hand after `drizzle-kit generate`.

## 4. Code layout

- **`packages/stripe`** *(new, thin, shaped like `packages/notifications`)*:
  `env.ts` with `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, both optional
  so the feature no-ops when unset; one `StripeClient` interface with the
  calls this plan names; the real one wraps the `stripe` npm package with a
  pinned API version; a fake for tests. The only package that imports `stripe`.
- **`packages/domain`**: `monthForInvoiceLine`, `subscriptionAnchor(now,
  timeZone)`, `canPriceFromOnCard`, `subscriptionMirror(status,
  pauseCollection, cancelAt)` to the assignment words the UI uses,
  `dropInPrice`. Tests first (delivery.md §5).
- **`packages/api`**: `stripe?` injected beside `baseDb?` in
  `createTRPCContext`, so router tests pass the fake through `ctxFor`.
  `confirmMonth` extracted from `markMonth`. A new `payments` router:
  `connectStatus`, `connect`, `disconnect` (owner identity tier, the commercial
  tier of ADR 129), `payMonth`, `subscribe`, `portal` (enrolled), `resync`,
  `resyncAll`, `retrySync` (organization manager). Webhook handlers in
  `packages/api/src/stripe/handlers.ts` as `(event, tx, stripe) =>
  Promise<void>`.
- **`apps/nextjs/src/app/api/stripe/webhook/route.ts`**: raw body, verify,
  resolve, scope, dispatch.
- **`packages/db/src/stripe-account.ts`**: `resolveStripeAccount(accountId,
  exec)`, the enumerated exception.
- Env: add both keys to `turbo.json` `globalEnv` and `.env.example`.

## 5. Slices

Each ships alone and leaves the product working. The manual rail is untouched
throughout. Sizes are estimates, not commitments.

### A1. Connect the gym's Stripe  ·  about 3 days
- [ ] Migration `0004` part one: `payment_provider_account`, `stripe_event`.
- [ ] `packages/stripe` with env, interface, real client, fake.
- [ ] `payments.connect` (create the account, store the id, return an Account
      Link URL), `connectStatus`, `disconnect` (D11).
- [ ] Return and refresh pages under gym Settings.
- [ ] Webhook route with `account.updated` and
      `account.application.deauthorized`; every other type recorded.
- [ ] Gym Settings beside bank details: **Connect Stripe**, status, the plain
      terms (Stripe's fees, the gym keeps the rest, payouts to the gym's bank).
- [ ] No student-facing change.

### A2. Plans exist in Stripe  ·  about 2 days
- [ ] `stripe_product_id`, `stripe_price_id`.
- [ ] Created in `accessPlan.create` and `setPrice` when the gym is connected;
      **Enable card payments** on an existing plan creates them for the
      current and future rows. A zero price gets none.
- [ ] `canPriceFromOnCard` and its validator message.
- [ ] A card badge on the plan card.

### A3. A student pays one month by card  ·  about 3 days  ·  first value
- [ ] `person.stripe_customer_id`, `membership_month.paid_via`,
      `stripe_invoice_id`, `stripe_checkout_session_id`.
- [ ] `confirmMonth` extracted; `markMonth` uses it; `appendMonthAudit` takes
      an optional actor.
- [ ] `payments.payMonth`: refuses a month already `confirmed`, a zero month,
      an unconnected gym, an unpriced plan; creates or reuses the customer;
      Checkout `mode: payment`, cards only, `client_reference_id =
      <assignmentId>:<month>`, amount from `priceForMonth`.
- [ ] `checkout.session.completed` (payment mode, `payment_status = paid`):
      `confirmMonth` with provider evidence. Holds untouched (D5).
- [ ] `charge.refunded` (D12).
- [ ] Web standing and Expo profile card: **Pay by card** beside the bank
      details when the gym is connected; "I paid" stays for a transfer. The
      success page is a web page that says Paid and links back to the app.
- [ ] Month board and claims show `paid_via`.

### A4. Automatic monthly payment  ·  about 4 days
- [ ] `access_assignment.stripe_subscription_id`, `stripe_sync_pending_at`,
      `stripe_sync_error`.
- [ ] `subscriptionAnchor` rule and test, including a daylight-saving 1st and
      a subscribe on the 31st.
- [ ] `payments.subscribe`: Checkout `mode: subscription`, anchor on the next
      1st, no proration, cards only, `metadata.assignment_id`. Refused while a
      subscription id is already set.
- [ ] `checkout.session.completed` (subscription mode): store the id.
- [ ] `invoice.paid`: retrieve, month from the line period, `confirmMonth`.
      `invoice.payment_failed`: notice, nothing on the month (D8).
      `customer.subscription.updated` / `deleted`: retrieve, mirror status,
      clear the id on delete and end the assignment after its last paid month.
- [ ] D7 mirroring from `cancel`, `suspend`, resume, with the pending mark,
      the error and **Retry**.
- [ ] `payments.portal`: plan switching and quantity off, cancellation on.
- [ ] Student standing: **Set up automatic payment**, the "this month is still
      due" line, then **Manage card**, and after a failure **Fix your card**.

### A5. Price and plan changes, the owner's view, recovery  ·  about 3 days
- [ ] `setPrice` and `scheduleChange` / `cancelScheduledChange` mirroring
      (D6, D7).
- [ ] `payments.resync`, `payments.resyncAll` (D10).
- [ ] Assignment row and month board: rail badge, subscription status, sync
      state, **Resync**, **Retry**. Disconnect view (D11).
- [ ] Setup list (FP8) gains "Connect Stripe" as optional, never a blocker.

### A6. A visitor pays for one class  ·  about 3 days
- [ ] `academy_profile.drop_in_price_*`, `drop_in_visit` payment columns.
- [ ] Branch Settings: drop-in price, shown only when the gym is connected.
- [ ] `/book/<code>`: after a booking, **Pay now** opens guest Checkout with
      `client_reference_id = <visitId>`; the status page shows Paid.
- [ ] `checkout.session.completed` writes `paid_at` on the visit.
- [ ] Reception, desk and roster show the paid mark. Cancelling a booking
      does not refund; the gym refunds in its dashboard.

### Definition of done, in the same change (delivery.md §4)
- [ ] `docs/spec.md`: new IDs for the student card rail, the visitor payment
      and the owner's connection. FP10 stays true: it is about what the gym
      pays matops.
- [ ] `docs/architecture.md`: the webhook as the fourth enumerated exception,
      beside the reception paragraph at line 9, and the list at line 611.
- [ ] ADR 141, indexed in `docs/map.md`, recording the later-work gate on
      reconciliation against ADR 135.
- [ ] `docs/roadmap.md`: the Parked "Card billing" row (line 1181) becomes
      rows A1 to A6.
- [ ] `CLAUDE.md`: drop the cron, `CRON_SECRET`, `runMaterializationSweep` and
      public REST paragraphs; add the webhook and the two env keys.
- [ ] One `CHANGELOG.md` line per slice.

### Tests (written, never run in-session; hand the commands to the user)
- `packages/domain/test`: the five pure rules, with daylight-saving and
  month-end cases.
- `packages/api/test` over PGlite with the fake client through `ctxFor`:
  duplicate event; two events for one payment; stale `payment_failed` after
  `paid`; wrong account; live/test mismatch; bad signature; confirm on a held
  month leaves the hold; concurrent manual mark and provider confirm; cancel
  with a Stripe failure leaves the pending mark and error; Retry clears it;
  Portal cancel ends the assignment after the paid month; refund resets the
  month and keeps the audit; disconnect with live subscriptions.
- `packages/db/test`: RLS on the two new tables.

Commands: `pnpm -F @matops/domain test`, `pnpm -F @matops/api test`,
`pnpm -F @matops/db test`, narrowed to the new files once they exist.

## 6. Before A1 starts

- [ ] Switch to `dev`. Commit the reception work sitting on `main` first, on
      `dev`, so the payments work does not ride on 99 uncommitted paths.
- [ ] matops has a Stripe platform account with Connect enabled, a platform
      profile and live keys. **The platform's legal entity must be in a country
      Stripe onboards.** Ukraine is not one. This is the first thing to confirm.
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` in Vercel Production, the
      test pair in Preview and `.env`, `.env.example` updated.
- [ ] A Connect webhook endpoint (events from connected accounts) for
      production and one for the sandbox. Local testing with
      `stripe listen --forward-connect-to`.
- [ ] One real gym on the manual rail has asked for card payment.
- [ ] Someone owns "why was I charged" support, knowing matops cannot see or
      refund the charge.

## 7. Out of scope for this wave

SEPA and every delayed payment method · one-page "current month plus
subscription" checkout · Subscription Schedules and price changes beyond next
month · keeping a subscription across a plan change · OAuth for an existing
Stripe account · proration, coupons, trials, family billing · an application
fee · refunds from inside matops · disputes handling · Stripe Tax and invoice
branding · weekly or yearly cycles · auto-suspend · scheduled reconciliation
(gated, D10) · payment links for people without accounts · a second provider ·
the native Payment Sheet · matops billing the gym.

## 8. How it fails, and what catches it

- **The owner never finishes Stripe onboarding.** Ask for the connection where
  the owner sets a plan price and state the terms plainly. Measured by
  `connectStatus`.
- **The two-tap subscribe loses students.** Measured by `subscribe` sessions
  created against `checkout.session.completed`. If it is bad, the trial-based
  one-page flow moves up the list.
- **A webhook is missed or stuck.** Stripe's three-day retry, `stripe_event`
  errors in Sentry, Resync and Check with Stripe (D10).
- **matops and Stripe disagree on a subscription.** The pending mark plus the
  stored error plus Retry (D7); nothing fails silently, a crash included.
- **A gym disconnects with live subscribers.** Stripe keeps charging them on
  the gym's account; the owner is shown every one and students are not moved
  to the manual rail behind the owner's back (D11).
- **A matops deploy breaks payments.** The client is one thin package, every
  handler is a pure function over `(event, tx, stripe)`, and the webhook is
  tested over PGlite with the fake.

## 9. Open questions for the owner of the repo

1. Which country is matops's own legal entity in? It decides whether a Stripe
   platform account is possible at all.
2. Is the two-tap subscribe (pay this month, then set up automatic payment
   from next month) acceptable for the pilot? It is the simplest supported
   flow; the one-page flow needs a trial-based design and more testing.
3. Is "cards only" acceptable for the first pilot gym, with SEPA as the first
   follow-up slice?
