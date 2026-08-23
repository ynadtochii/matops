# 82 — The membership booking gate

**Status:** accepted · **Date:** 2026-08-23 · **Area:** `packages/domain`, `packages/db`, `packages/api`, `apps/nextjs`, `apps/expo` · **Amends:** the "booking is never blocked" principle (spec §1) and S9/S11/O7 (ADR [40](40-payments-manual-transfer.md), [45](45-mobile-ease-of-use.md)). Migration `0025`.

## Context

Dues exist (ADR 40) but nothing connects them to the product's one lever:
booking. A student who never picks a plan, or stops paying, keeps the full app
forever. The owner's only tools are the overdue dot and a push reminder. For a
real gym the money loop needs one consequence, and it has to be one the student
can see coming and fix themselves.

At the same time, "booking is never blocked" (spec §1) is the make-or-break
student-friction principle, and some pilot gyms will not want enforcement at
all. So the gate must be opt-in, gradual, and self-clearing, never a surprise
lock.

## Decision

One derived clock, `bookingAccess` in `@matops/domain/payments`, consulted by
`booking.book` on the server and by both clients for the strip and the CTAs.
States: `ok` · `no_plan` · `grace` · `locked`, plus `daysUntilLock`. The words
come from `bookingAccessMessage`, one wording for web and phone.

- **Opt-in per academy.** `payment_settings.enforced_at` (timestamp, null =
  off, the default) plus `grace_days` (0–30, default 7), both on the O7 Bank
  tab. Enforcement off → every path behaves exactly as before.
- **One grace window for both gaps.** On a plan: booking stays open through the
  due day plus `grace_days`; then it locks. No plan: the same window, anchored
  on the **later of joining and `enforced_at`** — so a freshly approved student
  books right away, and flipping the switch on gives every plan-less member the
  full window with a visible countdown instead of an instant lock.
- **An open "I paid" claim unblocks immediately.** The student already acted;
  the owner's confirmation latency is not the student's problem. A rejected
  claim re-locks by derivation — nothing is stored.
- **Never gated:** pending members (their bookings are provisional and never
  counted), staff, `booking.cancel`, and the QR check-in — the person is
  standing in the gym; blocking the door creates a scene and corrupts
  attendance. Booking is the lever, attendance stays the truth.
- **Membership choice is part of onboarding, not the join form.** The one-step
  join (S2, ADR 57) is untouched. With exactly **one** active plan, approval
  auto-assigns it (`membership.approve`). With several, the student picks on S9
  (`payments.planOptions` / `choosePlan`), one confirm, one-shot; after that
  only the owner changes it (O7).
- **Calendar-month billing for new assignments.** `firstDueAt` = the 1st of the
  next month; the join month costs nothing in-app (the owner can set an earlier
  date from O7 to charge it). Rolling stays `rollNextDue`, which preserves the
  day-1 anchor, so no new roll logic and no rewrite of existing members'
  anchors.
- **The S11 strip escalates.** `no_plan` / `grace` → warning tone with the
  countdown; `locked` → error tone with the fix named. Web book CTAs disable
  while locked; the phone shows the same message on tap. The server guard in
  `booking.book` is the truth either way.

## Consequences

- The roster (`membership.members`) returns a per-student `access` state for
  the owner, shown as a "booking locked" tag; `payments.myDues` returns
  `access` + `canChoosePlan` for the student surfaces.
- `Membership` (db) now carries `memberId` + `joinedAt`, so the gate reads the
  caller's dues without an extra member lookup.
- The no-plan anchor uses `member.created_at`, not an approval timestamp (none
  is stored). A member left pending longer than the grace window in an
  already-enforced multi-plan academy lands approved-but-locked; the fix is one
  tap (choose a plan, join month free), so no `approved_at` column was added.
  Revisit if pilots surface it.
- Tests: the clock's boundaries in `packages/domain/test/payments.test.ts`; the
  gate end to end (off-switch regression, grace, lock, claim unblock/re-lock,
  pending/staff exemptions, choosePlan, auto-assign, roster tag, toggle
  round-trip) in `packages/api/test/booking-gate.test.ts`.
