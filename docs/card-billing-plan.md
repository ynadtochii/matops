# Card billing — parked plan (not the next wave)

**Status: PARKED. Do not start.** This is a researched, ready-to-build plan kept
on the shelf. It is written up now so the thinking is not lost, not because it is
next.

Promoting it means un-parking the "Card billing" row in
[roadmap.md](roadmap.md#parked--next-iteration-do-not-build-in-v1), which per the
roadmap rule happens **only on purpose**: a new ADR (72) plus new roadmap rows.

| | |
|---|---|
| **Scope** | Auto-charge memberships on a card, plus one-time payments for visitors |
| **Builds on** | ADR 40 (manual-transfer dues). Appends to it, does not replace it |
| **Market assumed** | EU and US only. Stripe does not onboard Ukrainian businesses |
| **Merchant assumed** | The gym's own Stripe account. matops never holds student money |
| **Size** | 6 slices, roughly 3 focused weeks |
| **Researched** | 2026-08-22 |

---

## Why it is parked

The plan is sound. The risk is what it turns matops into.

1. **It moves real money.** Today a matops bug loses a booking. After this, a
   matops bug takes the wrong amount off a student's card, or fails to take the
   right one and the gym silently loses a month of revenue. The blast radius of
   every future change to the payments domain goes up permanently.
2. **Demand is not proven.** ADR 40 wrote the gate itself: auto-subscription
   becomes a candidate *"only after the manual flow proves demand"*. As of today
   no real gym has run a full month on the manual rail.
3. **It punctures the one invariant the codebase is built on.** A Stripe webhook
   has no session, so it must resolve its own academy on the base connection
   before pinning the tenant transaction. That is a new hole in the RLS seam
   (see D5 below). It is manageable, but it is a hole.
4. **It costs the launch.** Three weeks here is three weeks not spent on Phase 5
   hardening (universal links, booking-count reconciliation, rate limiting) or
   the outstanding mobile device test, both of which are on the launch critical
   path and this is not.
5. **It creates permanent support load.** Every "why was I charged" lands on
   whoever answers the matops inbox, even though the gym is the merchant of
   record and matops cannot see or refund the charge.

### Gates to clear before this is promoted

- [ ] At least one real academy has run a full billing month on the manual rail
      (ADR 40) and asked for card charging.
- [ ] Phase 5 launch hardening is done, or explicitly deprioritised against this.
- [ ] `docs/mobile-device-test.md` is closed out, since slice P.6 ships a mobile
      surface and there is still no simulator run behind any wave since v1.8.
- [ ] The webhook seam exception (D5) is reviewed and accepted as an
      architecture change, not discovered during implementation.
- [ ] A decision on who answers billing support, and where that inbox lives.

---

## Tasks

Six slices. Each ships alone and leaves the product working. Nothing here is
started.

### P.4 — Connect the gym's Stripe  ·  2-3 d
- [ ] Add `stripe_account_id` and `stripe_charges_enabled` to `payment_settings`
      (migration `0023`).
- [ ] Settings → Payments gets a **Connect Stripe** action, owner-only, opening
      Stripe-hosted onboarding for a Standard account.
- [ ] Handle the return and refresh URLs; store the account id.
- [ ] Webhook handles `account.updated` and mirrors `charges_enabled`.
- [ ] Zero student-facing change ships in this slice.

### P.5 — Plans get a card price  ·  1-2 d
- [ ] Add `membership_plan.stripe_price_id`, nullable. Null means manual-only.
- [ ] Owner marks a plan chargeable by card; matops creates the Product and
      Price on the connected account.
- [ ] Stripe Prices are immutable: a price edit creates a new Price and re-points
      the plan. Existing subscriptions keep the old Price until moved.

### P.6 — Student starts a card membership  ·  4-5 d  ·  **the slice that delivers the value**
- [ ] Add `rail` (`manual|card`, default `manual`), `stripe_customer_id`,
      `stripe_subscription_id` and `card_status` to `member_dues`.
- [ ] Add `stripe_invoice_id` to `payment_claim`.
- [ ] Add the `stripe_event` table for webhook idempotency.
- [ ] **Pay by card** on the student dues screen, mobile (S9) and web, opening a
      Checkout Session in `subscription` mode on the connected account.
- [ ] Webhook route at `/api/stripe/webhook`: plain Next.js route, not tRPC, raw
      body, signature verified, idempotent by `event.id`.
- [ ] `invoice.paid` mirrors `subscription.current_period_end` into
      `member_dues.next_due_at`.
- [ ] `invoice.payment_failed` and `customer.subscription.deleted` mirror into
      `card_status`.
- [ ] Pure rule + test first: the reminder sweep **skips** card-rail members,
      because Stripe emails them.
- [ ] Pure rule + test first: map Stripe subscription status onto the existing
      `PaymentStatus`.

### P.7 — Manage and fix the card  ·  1-2 d
- [ ] Customer Portal session on the connected account, linked from the student
      profile and from the existing overdue banner as **Fix card**.
- [ ] Turn **off** plan switching in the Portal configuration. A student changing
      their own plan inside Stripe would desync `member_dues.plan_id`.
- [ ] Owner sees `card_status` on the member row.
- [ ] **Resync from Stripe** button on the member row: re-reads the subscription
      and rewrites the mirror. This is the whole answer to a missed webhook. No
      reconciliation cron, because there is no scheduler.

### P.8 — Visitor pays for one class  ·  3 d
- [ ] New tenant-scoped table `drop_in_payment` (academy_id, drop_in_id
      nullable, email, amount_minor, currency, stripe_payment_intent_id,
      paid_at), standard `academy_id` RLS policy, `drop_in` pattern.
- [ ] Drop-in price on the academy.
- [ ] **Pay for a class** on the check-in and join pages: Checkout Session in
      `payment` mode, guest, no account, no saved card.
- [ ] `checkout.session.completed` writes the `drop_in_payment` row.

### P.9 — One money list  ·  2 d
- [ ] Owner Payments screen unions manual claims, card invoices and drop-in
      payments into one chronological ledger with a rail badge.
- [ ] This is what stops two rails from confusing the owner. Ship it in the wave,
      do not defer it.

### Definition of done (delivery.md §4, in the same change as the code)
- [ ] `docs/spec.md`: new IDs for the card rail (student) and the Stripe
      connection (owner).
- [ ] `docs/architecture.md`: the webhook seam exception, added to the
      **enumerated** list beside `membership.ts`, `dropin.ts` and ADR 66.
- [ ] **ADR 72** `docs/issues/72-card-billing-stripe-connect.md`, indexed in
      `docs/map.md`. ADR 40 is appended to, never rewritten.
- [ ] `docs/roadmap.md`: the Parked "Card billing" row moves to slices P.4-P.9.
- [ ] One line per slice in `CHANGELOG.md`.
- [ ] Router tests in `packages/api/test` over PGlite with a **faked Stripe
      client injected through `ctx`**, keeping the Stripe SDK out of the pure and
      DB layers.

---

## The design, for whenever this is picked up

### The shape of it

matops already knows who owes money. `paymentStatus(nextDueAt, today)` in
`packages/domain/src/payments.ts` turns one date into `paid`, `due_soon` or
`overdue`, and that one pure function drives the owner's roster dots, the
student's dues line and the reminder sweep.

Card billing does not replace that. It adds a second way to move `next_due_at`
forward and leaves the engine alone.

```
manual rail (today)   student transfers, taps "I paid", owner confirms
                      rollNextDue(currentDue, cycle)
                                                          ─┐
card rail (new)       Stripe charges the card, webhook       ├─→  paymentStatus(nextDueAt, today)
                      next_due_at = current_period_end     ─┘     roster dots · dues line ·
                                                                  overdue banner · reminders
                                                                  ZERO changes
```

### D1 — Stripe Connect, Standard accounts, direct charges

Each academy connects its **own** Stripe account through Stripe-hosted
onboarding. matops stores the account id and creates every charge with the
`Stripe-Account: acct_…` header.

- The gym is the merchant of record. Stripe fees, refunds, chargebacks and
  payouts are the gym's, handled in the gym's own dashboard.
- The gym keeps whatever rates it negotiated. Gymdesk sells this exact model.
- matops carries no money-transmitter duty, no negative-balance liability, no
  payout schedule, no refund engine.
- The student's bank statement shows the gym's name, not matops.

Not Express or Custom: those make the **platform** liable for disputes and
negative balances, which is the opposite of the chosen model.

Cost of this choice: Stripe Customers and saved cards live on the connected
account, so a student who trains at two gyms enters their card twice. That
already matches matops, where dues are academy-local (ADR 40).

### D2 — Stripe owns the recurring clock, matops keeps a mirror

matops ships **no scheduler** (ADR 46, both cron routes dormant). Charging cards
ourselves would mean building a reliable daily job, retry logic, dunning email
and 3D Secure recovery, all in money-critical code.

Stripe Billing already has every one of those, plus invoice records and a hosted
Customer Portal. So the subscription lives in Stripe and matops keeps a mirror:

```
invoice.paid  →  member_dues.next_due_at = subscription.current_period_end
```

Webhooks are push, so this needs no scheduler. `rollNextDue` stays, used by the
manual rail only.

### D3 — The rail is a property of the member, not of the academy

`member_dues.rail = 'manual' | 'card'`.

One gym runs both at once: long-standing students stay on bank transfer, new
students go on a card, visitors pay one-time. No migration, no cutover, no
academy-wide switch to get wrong. An owner who never connects Stripe sees
nothing change. This is what makes the wave additive the same way ADR 40 was.

### D4 — Hosted Stripe surfaces only. No card fields, no Stripe SDK in the app

| Job | Surface |
|---|---|
| Start a card membership | Checkout Session, `mode: subscription`, on the connected account |
| Change or cancel a card | Customer Portal session on the connected account |
| Visitor pays for one class | Checkout Session, `mode: payment`, guest, no login |

All three open in the browser. `expo-web-browser` is **already** an Expo
dependency, so mobile adds **no native module** and needs **no dev-client
rebuild**. `expo-camera` stays the only new native module outstanding.

What this skips: PCI scope beyond SAQ-A, every 3D Secure and SCA code path,
`client_secret` handling, card form UI, Apple Pay and Google Pay plumbing
(Checkout gives them free). This is the difference between a three-week build
and a two-month one.

Accepted cost: a browser hop out of the app. Measure the drop-off. The native
Stripe Payment Sheet is a later slice if the number is bad.

### D5 — A failed charge notifies, it does not lock anyone out

Stripe Smart Retries run for two to three weeks. During that window matops
mirrors `invoice.payment_failed`, the member reads `overdue` through the existing
derived status, and the student sees the existing overdue banner with a new
**Fix card** button pointing at the Portal.

No auto-suspend. Suspension already exists as a deliberate owner action
(`suspended-notice.tsx`). Locking a paying student out of the mats over a soft
decline is the fastest way to lose an academy. The owner keeps the trigger.

### D6 — The webhook pins its own academy, and that is a named seam exception

Every write in matops runs inside the per-request RLS transaction, which needs an
academy id from the signed-in user. A Stripe webhook has no user. So the handler
resolves the academy from the payload:

```
event.account (acct_…)  →  payment_settings.stripe_account_id  →  academy_id
                        →  open the tenant tx pinned to that academy
```

That lookup runs on the base connection with no academy pinned. It is a **new,
named seam exception** and must be enumerated in `architecture.md` beside the
existing ones (`membership.ts`, `dropin.ts`, ADR 66) rather than added quietly.
Everything after the lookup runs on the normal scoped `ctx.db`.

The endpoint is a plain Next.js route at `/api/stripe/webhook`, **not** tRPC:
signature verification needs the raw request body. It verifies the signature,
rejects an unknown `event.account`, and skips any `event.id` already recorded in
`stripe_event`.

Events consumed: `account.updated` · `checkout.session.completed` ·
`customer.subscription.updated` · `customer.subscription.deleted` ·
`invoice.paid` · `invoice.payment_failed`.

---

## Schema delta (migration `0023`)

Additive only. The tenant seam is untouched, matching architecture §8.

| Table | Change |
|---|---|
| `payment_settings` | + `stripe_account_id`, `stripe_charges_enabled` (mirrored from `account.updated`) |
| `membership_plan` | + `stripe_price_id`, nullable. Null means manual-only |
| `member_dues` | + `rail` (`manual\|card`, default `manual`), `stripe_customer_id`, `stripe_subscription_id`, `card_status` |
| `payment_claim` | + `stripe_invoice_id`. A card charge writes a `confirmed` claim so the owner's money list stays one list |
| `drop_in_payment` *(new)* | academy_id, drop_in_id nullable, email, amount_minor, currency, stripe_payment_intent_id, paid_at. Tenant-scoped |
| `stripe_event` *(new)* | id text primary key, received_at. Webhook idempotency. Platform-level, not tenant-scoped |

Why `drop_in_payment` is a separate table and not a loosened `payment_claim`: a
visitor has no member row and no plan, while `payment_claim.member_id` and
`plan_id` are both `NOT NULL` and its partial unique index keys on `member_id`.
One narrow table beats loosening two constraints under a money-carrying index.

---

## Explicitly out of scope for this wave

Proration and mid-cycle plan change · coupons and promo codes · trials · family
or multi-member billing · **SEPA Direct Debit and ACH** · Stripe Tax and VAT ·
multi-currency per academy · the matops platform fee (add the field, set it to
zero) · refunds inside matops (the gym's Stripe dashboard does it) · invoice PDF
branding · weekly and annual cycles (`payment_cycle` is monthly-only today) ·
auto-suspend on failure · shared cards across academies · native Payment Sheet.

**SEPA Direct Debit is the first fast-follow.** European gyms bill on SEPA more
than on cards, and in Checkout it is close to a payment-method config change on
the same subscription code path. It is out only to keep the first wave honest.

---

## App Store

A gym membership and a drop-in are real-world services consumed outside the app.
Apple's guidelines require them to use payment methods **other than** in-app
purchase, so external card payment here is mandatory, not merely tolerated.
Since May 2025 the US storefront also allows external purchase links with no
entitlement.

The risk is reviewer confusion, not policy. Mitigation: the copy says "mat time
at your gym", the review note repeats it, the screenshot shows a physical class.

---

## How it would be measured

**Primary metric:** share of active members on the card rail with a successful
charge in the last 35 days.

**Input metrics:** connect completion (owners who start Stripe onboarding and
finish) · checkout completion (sessions created vs `checkout.session.completed`)
· involuntary churn (invoices still unpaid after Smart Retries give up).

**Counter-metric:** total money collected per academy per month, across both
rails. If card charges rise while the total falls, card billing is pushing
students out rather than converting them.

| Funnel step | Target |
|---|---|
| Owner connects Stripe | > 70% of paying academies |
| Plan gets a card price | > 90% of connected academies |
| Student sees "Pay by card" | 100% of card-priced plans |
| Student completes Checkout | > 60% (under 40% means the browser hop is the problem) |
| Student renews at month 2 | > 90% |

Any step under 50% gets investigated before the next slice starts.

---

## Other ways this fails

Beyond the parking reasons above:

- **The owner never connects Stripe.** Onboarding is KYC: bank account, ID,
  business documents. This is the real drop-off, and no amount of code fixes it.
  Ask for the connection at the moment the owner sets a plan price, not buried in
  Settings, and state the terms plainly: Stripe's cut, the gym keeps the rest,
  money lands in the gym's bank in about two days.
- **The browser hop kills student conversion.** Caught by the checkout completion
  metric. The native Payment Sheet is the fix, on evidence, as a later slice.
- **A webhook is missed and the mirror drifts.** Covered by `stripe_event`
  idempotency plus the manual Resync button in P.7.
- **A gym disconnects from matops.** Direct-charge subscriptions keep running on
  the gym's Stripe, and any `application_fee_percent` keeps being collected.
  Clear it on disconnect. The fee is zero in this plan, so this is a note for
  whenever it turns on.

---

## Sources

- [Stripe Connect subscriptions](https://docs.stripe.com/connect/subscriptions)
- [Stripe Connect webhooks](https://docs.stripe.com/connect/webhooks)
- [Stripe direct charges](https://docs.stripe.com/connect/direct-charges)
- [Stripe Setup Intents](https://docs.stripe.com/payments/setup-intents)
- [Gymdesk integrations](https://gymdesk.com/features/integrations) (the same
  bring-your-own-processor model)
- [Apple guideline 3.1.1, physical goods and services](https://ptkd.com/journal/guideline-3-1-1-in-app-purchase-digital-goods-rejection-fix)

Readable version of this plan:
<https://claude.ai/code/artifact/77a778ca-2d56-49df-9b18-4bb033206253>
