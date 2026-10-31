# Stripe payments: steps A, B and C

**Status: step A built (ADR 156), step B1 built (ADR 157), step C built on a side branch (ADR 155). Created 2026-10-13, rewritten 2026-10-26, B1 added 2026-10-28.** Gyms take membership payments on their own Stripe accounts. Each step only adds to the one before it, so a gym on an earlier step keeps working and nobody has to move. **No step ships to production until its acceptance list passes locally.** The [full Stripe design](stripe-gym-payments-design.md), modelled on MAAT, is the reference for later work.

## 1. Rules

- **The gym owns its Stripe account,** receives the money and pays Stripe's fees. Refunds, receipts, disputes and payouts stay in the gym's Stripe Dashboard.
- **MatOps holds no money** and stores no gym API key.
- **No business rule changes.** The monthly dues model of ADR 40 stays: plans, prices, deadlines, grace days, holds, `bookingGate`. Every automatic confirmation goes through the same month write as "Mark paid".
- **Drop-ins** at `/drop-in/<token>` stay free.

## 2. Why steps

Step C (Connect OAuth) needs a live MatOps Stripe platform account. Stripe does not support a business in Ukraine, the operator's country ([Stripe global availability](https://stripe.com/global)), so C waits for a business in a supported country. Steps A and B need only the gym's own Stripe account.

|                       | A: payment link                   | B: + the gym's webhook                                    | C: + Connect OAuth                               |
| --------------------- | --------------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| MatOps Stripe account | None                              | None                                                      | A live platform account                          |
| Owner setup           | A Payment Link on each plan price | Also a webhook in Stripe and its signing secret in MatOps | Connect with Stripe                              |
| Student pays on       | The gym's Payment Link            | The same link                                             | A Checkout page MatOps creates                   |
| Month confirmed       | By hand, as today                 | Automatically                                             | Automatically                                    |
| Status                | Built (ADR 156)                   | B1 built (ADR 157), B2 and B3 later                       | Built on branch `stripe-connect-oauth` (ADR 155) |

## 3. Slice 0: owner payment switch

Built (ADR 154). The owner turns membership payments on in Settings. Owners and managers can set up plans, prices, links and bank details while it is off.

## 4. Step A: payment link (built)

- In their Stripe Dashboard, the owner creates a **Payment Link** for a plan's price, then pastes it in MatOps: **Memberships, Plans, Payment link** for this month's price, or **Change price** for a future price.
- Only `https://buy.stripe.com/...` links are accepted.
- The link belongs to one price row (`access_plan_price.payment_link_url`). A future price brings its own link; the current month keeps its link.
- The student sees **Pay by card** next to the bank details on the web and in the app. The link carries `client_reference_id=<assignmentId>_<YYYY-MM>` and the student's email.
- The student pays on the gym's Stripe page, then taps **I paid**. Staff confirm with **Mark paid** after checking their Stripe Dashboard.

**Acceptance (local):**

1. Turn membership payments on (slice 0). Create a plan with a price and assign it to a student.
2. In Stripe test mode, create a Payment Link for that price. Paste it with **Payment link**. The plan shows "Card payment link set".
3. As the student, the notice shows **Pay by card**. It opens the gym's Stripe page with the email filled in. Pay with a test card.
4. In the gym's Stripe Dashboard, the payment shows the client reference `<assignmentId>_<YYYY-MM>`.
5. Tap **I paid**. As the owner, the month waits in the claims list. Confirm it.
6. A link from another site (`https://evil.test/pay`) is refused.
7. **Change price** for next month with a new link. The student still sees this month's link.
8. **Remove link.** Pay by card disappears; bank transfer still works.

## 5. Step B: the gym's webhook

### B1: one-off card payments (built, ADR 157)

- **Owner setup, once.** Settings, Card payments, **Set up** shows a webhook URL unique to the gym, `/api/stripe/hooks/<token>`. In their Stripe Dashboard (Developers, Webhooks) the owner adds that URL for the event `checkout.session.completed`, then pastes the endpoint's signing secret (`whsec_...`) back into MatOps. Settings then shows **On** and the time of the last message from Stripe.
- **Server key.** `PAYMENT_HOOK_KEY` (32 random bytes, base64; `openssl rand -base64 32`) encrypts each gym's signing secret. It lives only in the server settings, never in the database. Without it the card is hidden and the route returns 503. To rotate, move the old value to `PAYMENT_HOOK_KEY_PREVIOUS`.
- **Guided setup.** Four numbered steps with buttons to Stripe and copy buttons. If Stripe sends a message signed with another secret, or a test-mode message on the live site, Settings says so and how to fix it.
- **Limits.** 64 KB per message; 300 requests a minute per IP per server process; 600 a minute per gym.
- **Finding the gym.** `stripe_hook` has no RLS, like `drop_in_link`. The route resolves the token on the base connection; everything after runs in `withScope`.
- **Trust.** MatOps has no API key for the gym, so it does not fetch the session. It trusts the payload only after the signature check with that gym's secret. In production, test-mode events are ignored.
- **Matching and writing.** A paid `checkout.session.completed` with a valid reference and the exact price confirms the month through the same write as Mark paid, with an audit row naming Stripe. Anything else is recorded in `card_payment` as `paid_twice` or `needs_review` with a reason, and shows under Memberships, Payments, **Card payments to check**. A repeated event changes nothing. Holds and rejected months stay with the owner.

**Acceptance (local, Stripe test mode, on the gym's own Stripe account):**

1. Set `PAYMENT_HOOK_KEY` in `.env`, restart `pnpm dev:next`.
2. Settings, Card payments, **Set up**. Run `stripe listen --forward-to localhost:3004/api/stripe/hooks/<token> --events checkout.session.completed` and paste the `whsec_...` it prints. Settings shows **On**.
3. As the student, **Pay by card** with a test card. The month becomes confirmed with no "I paid", and Settings shows the time of the last message.
4. Pay again for the same month. It shows under **Card payments to check** as **Paid twice**. **Hide** removes it.
5. Pay through a link with a different amount. The month is not confirmed; the review list says why.
6. Stop the dev server during a payment, restart, and let Stripe resend. The month is confirmed once.
7. **Turn off.** The URL returns 404 and confirmation is manual again.

### B2 and B3 (later)

- **B2, subscriptions.** A recurring Payment Link creates a subscription. The first completed session stores the subscription id against the assignment; each later `invoice.paid` confirms the month its period starts in.
- **B3, delayed methods** (SEPA, Multibanco). `async_payment_succeeded` and `async_payment_failed`, with the month `reported` while the money settles.

## 6. Step C: Connect OAuth (side branch)

- Built on branch `stripe-connect-oauth` (ADR 155): Connect OAuth, `payment_provider_account`, the platform webhook, `packages/stripe`.
- It needs a live MatOps Stripe platform account in a supported country, and the three server values `STRIPE_SECRET_KEY`, `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_WEBHOOK_SECRET`.
- Before merging, renumber its migration: it is `0013` on the side branch, and `0013` on the main line is the payment link.
- **Moving from B to C.** The owner connects the same Stripe account, then deletes the B webhook. Links, subscriptions and history stay. Confirmation is safe to repeat, so a short overlap of both webhooks does no harm.

## 7. Open questions

1. **Portuguese invoices.** Stripe sends receipts. Portuguese businesses may need invoices from tax-authority-certified software. Confirm with an accountant before a Portuguese gym takes card payments.
2. **Step C business.** Which country and business form can open a verified MatOps platform account.
