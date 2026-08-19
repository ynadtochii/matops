# Recurring payments and NFC check-in research

*Checked 16 August 2026 against provider and platform documentation. Pricing is
Portugal/EU public pricing and must be rechecked before launch.*

## Recommendation

Use **Stripe Connect direct charges + Stripe Billing + hosted Checkout** for the
first multi-academy release. Each academy should be the merchant of record and
receive its students' funds in its own connected account; matops stores provider
identifiers and a webhook-derived local status, but never card details. This is
Stripe's documented SaaS model: direct charges live on the connected account,
which bears refunds and chargebacks, while the platform may take an application
fee. [Stripe direct charges](https://docs.stripe.com/connect/direct-charges)
[Stripe SaaS platforms](https://docs.stripe.com/connect/saas-platforms-and-marketplaces)

For NFC, start with **passive NDEF URL tags at the venue**. A tag contains the
same HTTPS check-in URL as the existing QR poster. Add iOS Universal Links and
Android App Links so that URL opens the existing Expo check-in route when the
app is installed and retains the web fallback otherwise. No NFC library is
needed for this version. Apple background tag reading still presents a
notification that the user taps; it is not an invisible automatic launch.
[Apple background tag reading](https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading)
[Expo linking overview](https://docs.expo.dev/linking/overview/)

The check-in response should use **locally cached payment state updated by
signed webhooks**. Never call a payment provider synchronously at the gym door.
Show a neutral success signal to the student and a private red/amber status on
the staff's "Tonight" screen. Do not make an audible public "overdue" alert or
automatically block attendance in the first release.

## Current matops fit

The app already has most of the product domain needed:

- monthly membership plans, member dues, paid/due-soon/overdue derivation,
  manual payment claims, owner payment UI, and reminder seams;
- a public per-academy QR URL, an Expo deep-link check-in screen, an idempotent
  book-and-attend mutation, attendance timestamps, and an owner attendance UI;
- Expo Router and custom-scheme deep links, with Universal/App Links explicitly
  deferred to launch infrastructure.

The new work is therefore provider lifecycle and reliability, not a new billing
or attendance product from zero.

## Payment-provider options

| Provider | Fit | Platform implications |
|---|---|---|
| **Stripe Connect + Billing** | Best default for card-first MVP; cards, SEPA, hosted Checkout, subscriptions, hosted customer portal and mature Connect flows | Use direct charges so the academy is merchant of record. Initial card setup is SCA/3DS-aware; later off-session charges can still require recovery. Billing and processing have separate fees. |
| **Mollie Connect + Subscriptions** | Strong Portugal/EU alternative; cards and SEPA; recurring orchestration has no separate product fee in public pricing | OAuth/KYB merchant accounts and application fees. Validate Connect approval and required payment methods before choosing it over Stripe. |
| **GoCardless partner integration** | Best if the product chooses SEPA Direct Debit instead of cards | No card acceptance. Each academy connects through OAuth; mandate and delayed/reversible debit states must be represented locally. |
| **Adyen for Platforms** | Capable enterprise option | More platform, balance, split, and subscription-orchestration work than this pilot warrants. |

Current public Portugal pricing examples: Stripe lists standard EEA cards at
1.5% + EUR 0.25, SEPA at EUR 0.35, and Billing pay-as-you-go at 0.7% of Billing
volume. Mollie lists Portuguese domestic consumer cards at 1.20% + EUR 0.25,
other EEA consumer cards at 1.80% + EUR 0.25, and SEPA at EUR 0.35.
[Stripe Portugal pricing](https://stripe.com/en-pt/pricing)
[Stripe local-method pricing](https://stripe.com/en-pt/pricing/local-payment-methods)
[Mollie Portugal pricing](https://www.mollie.com/pt/pricing)

Hosted Checkout is preferable to a custom card form. It supports subscriptions
and keeps payment entry on a provider-owned surface. The customer portal can
also handle payment-method updates, invoices and cancellation instead of matops
rebuilding those workflows.
[Stripe Checkout](https://docs.stripe.com/payments/checkout)
[Stripe customer portal](https://docs.stripe.com/customer-management)

For European cards, the first setup must establish permission for future
off-session payments. Later merchant-initiated charges can still fail or require
the student to authenticate again, so `invoice.payment_failed` and
`invoice.payment_action_required` are product states, not rare errors.
[Stripe SetupIntents](https://docs.stripe.com/payments/setup-intents)
[Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)

SEPA is attractive for gym dues but is not instant. Stripe documents a
multi-business-day processing period, mandates, advance notice, and consumer
refund rights. A pending debit must appear as `processing`, not `overdue`.
[Stripe SEPA Direct Debit](https://docs.stripe.com/payments/sepa-debit?locale=en-GB)

Suggested local state:

- `setup_required`
- `active`
- `processing`
- `grace_period`
- `past_due`
- `cancelled`

Store the provider account/customer/subscription/invoice identifiers and an
append-only processed-webhook ledger for idempotency. Provider events update the
local projection; clients and check-in read only that projection.

## NFC solution levels

### 1. Passive venue tag — recommended MVP

Write the existing `https://.../checkin/<academyId>` URL to an NDEF tag and make
it read-only. With Universal/App Links, an installed app opens the Expo route;
without the app, the existing public page remains the fallback. iOS supports
background reading of an NDEF URI but requires the user to tap the notification.
Android verified App Links route HTTPS URLs directly to the app.
[Apple background tag reading](https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading)
[Android App Links](https://developer.android.com/training/app-links/about)

This has the same trust level as the current static QR: the URL can be copied and
shared. NFC improves convenience, not proof of physical presence. A rotating
credential requires an active reader/display and is a different product.

### 2. Browser NFC

Do not make Web NFC the cross-platform foundation. Chrome documents Web NFC as
Android Chrome-only, NDEF-only, HTTPS-only, foreground-only, and permissioned
from a user gesture. It does not support peer-to-peer or host card emulation.
[Chrome Web NFC](https://developer.chrome.com/docs/capabilities/nfc)

### 3. Student phone as an NFC credential

Do not build this for the MVP. Android supports host card emulation for native
apps, but this requires a reader protocol, native services, credential issuance,
security design, and hardware operations. It does not create a symmetric iOS
implementation. [Android HCE](https://developer.android.com/develop/connectivity/nfc/hce)

If a staff-visible hardware signal is mandatory, first compare it with a simpler
owner tablet/kiosk that scans a member QR pass. The latter is cross-platform and
lets the staff device display the member and payment exception without entering
the restricted phone-as-card path.

## Product and competitive implications

Recurring payments plus attendance are not by themselves unique. Gymdesk
markets recurring billing, check-ins, attendance and payment history together;
PushPress already documents check-in alerts for members without an active plan.
[Gymdesk martial arts software](https://gymdesk.com/software/martial-arts)
[PushPress check-ins](https://help.pushpress.com/en/articles/508409-core-members-check-ins)

The sharper matops wedge is for owner-operated grappling gyms with no front
desk: **tap the wall, attendance is done, and only payment exceptions reach the
owner**. The experience must be faster and calmer than a shared kiosk, and the
owner should leave class with a complete "who trained tonight" list.

Measure:

- share of active students with automatic payment set up;
- collection rate by due date + 3 and + 7 days;
- failed payments recovered without owner contact;
- share of attendees self-checked in;
- median time from tap to confirmation;
- minutes required to close attendance after the last class;
- false overdue signals (target: zero).

## Effort guidance

For one experienced full-time engineer in this codebase:

- scalable Stripe Connect recurring payments: **25-40 developer-days**;
- passive NFC check-in plus Universal/App Links and on-phone result: **5-8 days**;
- staff "Tonight" feed with payment exception status and polling signal:
  **5-8 days**;
- dedicated phone-as-card NFC and reader hardware: **30-60+ days**, excluding
  hardware certification/procurement and store/provider approvals.

The recommended production slice is therefore **35-56 developer-days** (about
7-11 weeks for one engineer), with payment-provider onboarding and mobile-store
review elapsed time potentially running in parallel.
