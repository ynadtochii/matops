# MatOps Payments Bridge Proposal

**Status:** Proposal. Not approved for implementation.

## Objective

Build an optional payment automation add-on for MatOps as a separate Go service.

The service connects MatOps to payment providers such as Stripe. Providers collect and hold the money. The service coordinates payment requests and reports payment results to MatOps.

MatOps must remain fully usable without this add-on. Its current manual payment flow remains part of the base product.

## Product modes

### Manual payments

The base MatOps product keeps the current flow:

1. MatOps shows the gym's payment instructions.
2. The student pays outside MatOps.
3. The student reports the payment.
4. Staff confirms or rejects the report.
5. MatOps records the result for the membership month.

### Automatic payments

The paid add-on provides this flow:

1. The gym connects a supported payment provider.
2. MatOps creates a payment request through the bridge.
3. The provider collects the payment.
4. The bridge receives the provider result.
5. The bridge sends a normalized payment event to MatOps.
6. MatOps records the result and applies its existing membership rules.

## Product boundary

### MatOps owns

- Organizations, branches, people, and staff permissions
- Membership plans and assignments
- Membership prices and payment periods
- Booking and attendance rules
- Payment access rules
- Manual payment reports and staff confirmation
- The decision to create a payment request
- The effect of a confirmed, failed, or refunded payment

### The payment bridge owns

- Provider account connections
- Payment requests sent to providers
- Provider customer references
- Checkout session creation
- Normalized payment states
- Payment attempts
- Verified provider events
- Delivery of payment events to MatOps
- Retries, replay, and operational history
- Refund requests sent to providers

### The provider owns

- Card and bank details
- Business verification
- Payment authorization
- Money collection
- Money storage and payouts
- Provider fees
- Refund execution
- Disputes and chargebacks

## Main rule

The payment bridge reports money facts. MatOps decides what those facts mean for a membership.

The bridge must not calculate plan prices, assign memberships, grant booking access, or suspend students.

## Service architecture

```text
Student or staff
       |
       v
     MatOps
       |
       | Create payment request
       v
Go payment bridge
       |
       | Provider API
       v
Payment provider
       |
       | Signed webhook
       v
Go payment bridge
       |
       | Normalized payment event
       v
     MatOps
       |
       v
Existing payment and membership rules
```

The bridge must have its own database. It must not read or write the MatOps database.

## First provider

Start with Stripe.

Use provider-hosted surfaces for:

- Gym account onboarding
- Customer payment details
- Checkout
- Payment method updates

MatOps and the bridge must never receive raw card details.

Start with one provider implementation. Create a shared provider interface only when a second provider is added.

## Initial payment flow

The first version supports one payment request for one membership month.

1. MatOps calculates the final amount and currency.
2. MatOps sends the payment request to the bridge.
3. The bridge creates a hosted checkout session.
4. MatOps sends the student to the checkout URL.
5. The provider collects the payment.
6. The provider sends a signed event to the bridge.
7. The bridge verifies and stores the event.
8. The bridge updates its payment state.
9. The bridge sends a signed event to MatOps.
10. MatOps records the payment against the correct membership month.

## Payment request data

Each request should contain:

```text
source_system
source_organization_id
source_payment_id
customer_reference
amount_minor
currency
description
payment_period
idempotency_key
```

Money must use the smallest currency unit. For example, EUR 49.99 is stored as `4999`.

The idempotency key prevents a repeated MatOps request from creating another payment.

## Payment states

The bridge exposes provider-independent states:

```text
pending
requires_action
processing
paid
failed
cancelled
partially_refunded
refunded
disputed
```

Provider-specific states remain inside the bridge.

Every state change records:

- Previous state
- New state
- Cause
- Provider event reference
- Time
- Processing result

## Initial API

```text
POST /merchants
POST /merchants/{id}/onboarding-link

POST /customers
POST /payment-requests
POST /payment-requests/{id}/checkout
POST /payment-requests/{id}/cancel

POST /payments/{id}/refund

POST /webhooks/stripe

GET /payment-requests/{id}
GET /payments/{id}
GET /operations
```

## Events sent to MatOps

```text
merchant.ready
merchant.restricted

payment.pending
payment.requires_action
payment.processing
payment.paid
payment.failed
payment.cancelled
payment.partially_refunded
payment.refunded
payment.disputed
```

Every event must have a stable event ID. MatOps must process the same event more than once without repeating its effect.

## Failure behavior

If the bridge is unavailable:

- MatOps remains usable.
- Existing memberships remain unchanged.
- Manual payment reporting remains available.
- MatOps shows automatic payments as temporarily unavailable.
- Safe background operations retry later.
- Staff can continue resolving manual payments.

If MatOps is unavailable:

- The bridge stores provider events.
- Delivery to MatOps retries later.
- Failed deliveries remain visible to operators.
- An operator can replay a failed delivery safely.

## Delivery phases

### Phase 1: Go service foundation

- Go module and package structure
- HTTP server
- Health endpoint
- Configuration loading
- PostgreSQL connection
- Structured logs
- Graceful shutdown

### Phase 2: Payment request model

- Create and read payment requests
- Validate amounts and currencies
- Store MatOps references
- Enforce idempotency
- Cancel unpaid requests
- Record state history

### Phase 3: Stripe connection

- Connect a gym's Stripe account
- Create hosted onboarding links
- Track account readiness
- Create hosted checkout sessions
- Store Stripe references

### Phase 4: Reliable provider events

- Verify webhook signatures
- Store the original event before processing
- Reject unknown accounts
- Ignore duplicate events safely
- Process stored events asynchronously
- Retry internal failures
- Show and replay exhausted work

### Phase 5: MatOps integration

- Add signed service-to-service requests
- Create payment requests from MatOps
- Return checkout URLs
- Deliver normalized payment events to MatOps
- Record paid membership months through existing MatOps rules
- Keep the manual flow available
- Place automatic payments behind add-on access

### Phase 6: Payment operations

- Failed payment queue
- Payment timeline
- Provider event timeline
- Full and partial refunds
- Failed refund state
- Provider account warnings
- Search by member or payment reference

### Phase 7: Recurring collection

Start with one MatOps payment request per membership month. This keeps membership pricing and timing inside MatOps.

Review provider-managed subscriptions only after the monthly payment flow handles real payments reliably.

### Phase 8: Second provider

Add another provider only after Stripe works in production.

Use the second implementation to define the smallest useful shared provider interface.

## Add-on controls in MatOps

Only authorized gym owners can:

- Activate the add-on
- Connect or disconnect a provider
- See provider account requirements
- Request refunds
- Disable automatic payments

Disabling the add-on must not remove payment history. It must return new payments to the manual flow.

## Go learning goals

The project introduces Go concepts through production work:

- Modules and packages
- Structs and methods
- Custom types and constants
- Interfaces at external boundaries
- Explicit error handling
- Context cancellation and deadlines
- HTTP servers and clients
- Database transactions
- Goroutines and worker pools
- Channels
- Graceful shutdown
- Webhook signature verification
- Idempotent processing
- Retry handling
- Database locking
- Structured logging

Each implemented concept should create a short knowledge entry that links to the real code and compares the approach with TypeScript and Node.js.

## Knowledge base structure

```text
knowledge/
├── concepts/
├── payments/
├── comparisons/
├── decisions/
└── progress.md
```

Each concept entry should include:

- Why the project needed it
- Where the code uses it
- A short mental model
- A TypeScript or Node.js comparison
- One common mistake
- Questions for review

## First release acceptance checks

- An owner can connect a Stripe test account.
- MatOps can create one monthly payment request.
- A student can open hosted checkout.
- MatOps and the bridge never receive card details.
- A verified provider event updates the bridge payment state.
- A paid event records the correct MatOps membership month.
- Repeated requests do not create repeated payments.
- Repeated provider events do not repeat their effect.
- Failed event processing is visible and retryable.
- Failed delivery to MatOps is visible and retryable.
- Disabling the add-on restores the manual flow for new payments.
- Existing manual and automatic payment history remains readable.
- MatOps remains usable while the bridge is unavailable.
- Logs do not contain payment credentials or webhook secrets.

## Non-goals

The first release will not include:

- A standalone SaaS product
- Direct payment processing
- Holding customer funds
- Custom card forms
- Several payment providers
- Provider-managed subscriptions
- Automatic tax calculation
- Accounting features
- Usage billing
- Split payments
- Marketplace payouts
- Foreign exchange
- Automatic membership access decisions
- Automatic student suspension
- Fraud detection

## Promotion conditions

Implementation should start only when:

- MatOps needs automatic payment collection for a real gym.
- The manual payment flow has been used and its limits are understood.
- The first provider and supported countries are chosen.
- Payment support ownership is assigned.
- Refund responsibility is clear.
- The payment bridge deployment and monitoring approach is agreed.

## Next action

Keep this proposal parked until automatic payments become a planned MatOps add-on. When promoted, turn it into an implementation plan with repository locations, API contracts, migrations, security review, and acceptance coverage.
