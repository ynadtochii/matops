# 154 · Owner switch for membership payments

**Status:** accepted, built (tests written, not run; no migration) · **Date:** 2026-10-26 · **Area:** `packages/api` (`router/academy.ts`), `packages/validators`, `apps/nextjs` (Settings, Memberships, student detail, sidebar) · **Changes in part:** [142](142-first-release-approval-only-booking.md) (no control turns payment on; payment screens hidden while off)

## Context

ADR 142 kept the payment code but removed `entity.setMembershipEnforced` and the per-academy payment switch. Turning payment on needed a direct database change. The Stripe plan (`docs/stripe-one-time-payments.md`, slice 0) needs an owner to turn payment on before any card payment can reach a real gym.

ADR 142 also hid the owner setup screens while payment is off: Memberships, bank details and the Membership tab on a student. So an owner could only create plans after turning payment on, and every approved student without a plan would stop booking at that moment.

## Decision

1. **`academy.setMembershipEnforced({ enforced })`**, owner only (`ownerIdentityProcedure`), for the academy named in `x-matops-entity`. On sets `membership_enforced_at` and keeps the first time it was set. Off sets it to null. Turning it on records the `branch_activated` milestone, as before ADR 142.
2. **Settings has a Membership payments section** for the owner, with Turn on and Turn off. Turning on asks for confirmation and names the active students with no plan, from `accessPlan.uncovered`, who will stop being able to book. Turning off asks for confirmation; plans, months and payment records stay.
3. **Owners and managers can set up while payment is off.** The Memberships sidebar item and page, the bank details in Settings, and the Membership tab on a student show whether payment is on or off. The Memberships page says when payment is off.
4. **The student side still follows the flag.** The Membership page, the dues strip, "I paid", the booking gate and the Expo screens are unchanged.
5. **Import is unchanged.** The plan columns in Import students still show only while payment is on.

## Consequences

- Turning payment on is now an owner decision in the app, not a database change. ADR 40 rules (deadlines, grace days, holds, the booking gate) apply from that moment.
- An owner can prepare plans, prices, assignments and bank details first, and see on Memberships who has no plan, so turning on blocks nobody by surprise.
- Managers see the setup screens but cannot turn payment on or off.
- No migration and no Expo change.
