# 40 · Manual-transfer payments — owner-confirmed dues, no card processor

*(v1.3 "Frictionless & Pay" foundation, plan `.scratch/frictionless-pay/plan.md`. **Promotes** payments/billing out of the Parked "deferred domains" list — [roadmap.md](../roadmap.md#parked--next-iteration-do-not-build-in-v1), map "out of scope". Builds on the Phase-3 booking/attendance schema and the tenant seam — [08](08-data-model.md), [33](33-tenant-seam-enforcement.md). Reference only, not borrowed: MAT's Stripe/subscription integration.)*

## Context

Owners need to see **who paid and who missed the deadline**; students need a simple way to **pay and prove it**. The confirmed payment model for the target market is **manual bank transfer** — the student sends money to the gym's bank details ("requisites") in their own bank app, and the owner reconciles by hand. There is no card on file and no payment processor in v1.3.

Spec §5 and the map list "memberships / payments / billing" as out of scope. This is the first payments work, so it needs an explicit decision to un-park it (roadmap rule: *"promote to a slice only on purpose — an ADR or a new roadmap row"*). The open questions were: what a payment *is* without a processor, where the money-status truth lives, how the owner matches a bank line to a person, and what stays out.

## Decision

### A payment is a two-sided confirm loop, not an integration
A payment is a **claim the student raises and the owner confirms** — never an automatic charge. Flow: the student transfers money in their bank app → taps **"I paid"** in the app (optional proof screenshot) → this creates a `payment_claim` (status `pending`) → the owner **confirms** (or rejects) it on the web → confirming rolls the member's `next_due_at` forward by the plan cycle. No card, no webhooks, no failed-charge handling, no refunds engine. This is the whole payments surface for v1.3.

### The reference-code convention makes reconciliation possible
The requisites card shows a **fixed reference code** (the student's name or a short id) that the student must put in the bank-transfer note. This is the single load-bearing detail of the manual flow: it is what lets the owner match an incoming bank line to a person in seconds. Without it, manual reconciliation does not scale.

### Payment status is derived, not stored as truth
The stored facts are the member's `next_due_at` plus the confirmed claims. The status shown on the roster — `paid | due_soon | overdue` — is **computed** by a pure function `paymentStatus(nextDueAt, today)`, never a denormalized column that can go stale. Same idea as `class.status` deriving "past" from `starts_at` ([19](19-class-completed-transition.md)).

### One shared pure engine — `packages/domain/src/payments.ts`
All the math is pure (no I/O, no clock read) and tested in isolation:

- `paymentStatus(nextDueAt, today)` → `paid | due_soon | overdue` — the owner roster dots (P.2) and the student dues line (P.3).
- `rollNextDue(currentDue, cycle)` → the next due date when a claim is confirmed (monthly cycle in v1.3).
- `canClaim(member)` + a claim **dedupe key** (one open claim per member per period) — guards the claim mutation (P.3).

### Per-academy, on the RLS seam
Both new tables carry `academy_id` and an RLS policy `USING (academy_id = current_setting('app.academy_id'))`, matching the `drop_in` pattern ([25](25-dropin-lead-form.md)). All reads/writes run on the scoped `ctx.db`. Dues are academy-local: a member who trains at two gyms has independent dues per academy, same as `visitCount` and the v1.2 stats ([39](39-attendance-derived-stats.md)).

### Schema (migration `0015`, slice P.1)
- `membership_plan` (id, academy_id, name, price, currency, cycle) — the price list an owner defines.
- `payment_claim` (id, academy_id, member_id, plan_id, amount, period, status `pending|confirmed|rejected`, proof_url nullable, claimed_at, confirmed_by, confirmed_at) — one row per "I paid".
- `member.next_due_at` — the derived-status input, rolled forward on confirm.
- Owner **bank details / requisites** stored on the academy (surfaced for editing in O6 Settings, read by the student's requisites card).

### Reminders ride the existing daily cron
Dues reminders (3 days before, on the due day) reuse the Phase-4 notify engine — a new pure `buildDuesReminderMessage` in `notify.ts` + an extension of `runReminderSweep`, sent via the existing `sendPush`/`sendEmail` ([34](34-notifications-layering.md)). Daily cadence is enough for dues, so this ships on the **existing daily** `/api/cron/remind`; the frequent-cron work stays the separate Phase-5 concern.

### What stays out (still parked)
**Auto-subscription / recurring card charge, any payment processor (Stripe or local), invoicing/accounting, multi-currency tax.** Auto-subscription becomes a candidate only after the manual flow proves demand — then a new wave + its own ADR, never a quiet addition. v1.3 is manual transfer only.

## Consequences

- Owners get "who paid / who's overdue" at a glance and stop chasing money by hand, with **zero** processor integration, credentials, or PCI surface.
- One tested engine, three surfaces (owner roster dots, student dues line, reminders) — a change to the status bands or the cycle is one edit + one test file.
- The manual loop depends on students entering the reference code; the requisites card makes that the obvious step, but a sloppy transfer note still forces a manual match — an accepted trade for skipping a processor.
- New domain is additive: two schema files + one router + one pure module, tenant seam untouched (architecture §8). Auto-subscription can layer on later without reworking the manual path.
- Verified by the `payments.ts` domain unit tests first (delivery.md §5); live/device verification rides with slices P.2/P.3.
- Deferred: auto-subscription, processors, invoicing, tax, multi-currency, per-plan proration.

## Implementation note — as built (P.1, migration 0015)

*(Append-only refinement; the decisions above stand. Records where the storage
landed once built.)*

The "member `next_due_at`" from the schema sketch is stored as a **dedicated,
RLS-scoped `member_dues` row**, not a column on Better Auth's `member` table —
the alternative the plan allowed ("`member.next_due_at` *or* a small per-member
dues row"). Reason: the `member` table carries no RLS and is only ever read on
the trusted base connection with an explicit academy pin (`membership.ts`,
docs/issues/12). Keeping dues in `member_dues` puts the whole payments domain on
the tenant seam and off the auth schema, so a future `auth:generate` never
touches it.

Migration `0015` therefore adds **four** tenant-scoped tables (each with the
standard `academy_id` isolation policy, `drop_in` pattern):

- `membership_plan` — the owner's price list (`price_minor` integer in the
  currency's minor unit, `currency`, `cycle`; soft-deletable to keep claim
  history valid).
- `member_dues` — one row per (academy, member): the assigned `plan_id` +
  `next_due_at` (the single input to the derived `paymentStatus`). No row = dues
  not set up yet.
- `payment_claim` — one "I paid" per row; `amount_minor`/`currency` snapshot the
  plan price at claim time; a **partial unique index** (`WHERE status =
  'pending'`) enforces the `claimDedupeKey` rule (one open claim per member per
  `"YYYY-MM"` period) in the database.
- `payment_settings` — one row per academy for the owner's free-text bank details
  (the requisites card, S9/O6); the per-student reference code is derived at read
  time, not stored.

Roster dues reads that must join the `member` table (P.2) run on the base
connection with an explicit academy pin, same enumerated seam exception as
`membership.ts`/`dropin.ts`. RLS on all four tables is verified live on Neon +
by a PGlite leak test (`payments-rls.test.ts`).
