# ADR 45 — Mobile ease-of-use pass (v1.8): IA + core-flow friction

**Status:** accepted · **Date:** 2026-07-23 · **Supersedes:** none (extends ADR
[38](38-app-navigation-shells.md) mobile shells, ADR [40](40-manual-transfer-payments.md)
payments, ADR [44](44-mobile-dark-first-design-system.md) mobile design system)

## Context

An expert UI/UX review of the v1.7 Expo student app found the layout distinctive
but not as **easy** as it can be. Three daily frictions
(`docs/mobile-ease-of-use-plan.md`):

1. **Two tabs did the same job.** `Schedule` (all classes) and `Training` (my
   classes) both opened with a "Next class" card — the student made a needless
   choice on every open.
2. **A rare action sat in the front row.** `Check in` was a permanent tab that is
   empty most of the time, while **booking** — the core repeated action — was 3
   taps deep (S4 → tap → S5 → Book).
3. **The one urgent money state was hidden.** An **overdue** payment lived at the
   bottom of Profile; the student had to go looking for a problem.

This is a **re-shaping of how the student reaches existing features** — no new
domain, no migration, **no back-end/RLS change**. It reuses the `booking`,
`checkin`, `payments`, and `academy` routers as-is.

## Decision

A presentation + navigation pass on the Expo app (S1–S12). Seven slices:

- **Inline booking (S4/S5).** A shared `useBookClass` hook + `BookButton`
  (`components/book-control.tsx`) de-duplicate the book rule that lived twice
  (schedule hero card + class detail). Each bookable schedule row now books in
  **one tap** (plus the soft-capacity confirm); the detail (S5) is no longer
  required to book and keeps its role for full info + cancel.
- **End the Schedule/Training overlap (S4/S6).** Rename the `Training` tab →
  **My classes** (display strings only; the route file stays `training.tsx` so
  deep links don't move). Remove the featured "Next class" card from Schedule —
  it now lives only on My classes. "All classes" vs "mine" is self-explaining.
- **Overdue warning header (new S11).** A thin, non-dismissible strip
  (`components/overdue-banner.tsx`) on the tab screens, shown **only** when
  `payments.myDues` reports `status === "overdue"` (derived from `next_due_at`,
  ADR 40 — never stored). Reuses the dashed error callout style; taps to Profile
  → dues; self-clears one refetch after the owner confirms payment.
- **Remove in-app check-in; QR-only walk-in (S8 redefined).** The `Check in` tab
  and its in-app "confirm your class" list are **removed** — booking is the
  pre-commit and the owner marks attendance after class (O5). The **only**
  surviving check-in path is the gym QR **walk-in** for a student who did not
  book. **QR mechanism:** the poster keeps encoding the public **https
  `/checkin/<academyId>`** page (so a first-time, no-app visitor still gets the
  drop-in form); that page gains an **"Open the app to check in"** control that
  deep-links **`matops://checkin/<academyId>`** into a new pushed mobile route
  (`app/checkin/[academyId].tsx`), which sets the active academy, resolves the
  live class, and **books + marks attended** (`checkin.today` + `checkin.checkIn`,
  unchanged). We did **not** encode a bare `matops://` deep link in the QR: it
  would dead-end no-app visitors and custom-scheme camera opening is unreliable,
  and universal/App links stay deferred (ADR [31](31-deep-link-approach.md)). Every edge case
  shows a clear message and is never a dead end (owner O5 is the safety net).
- **Split Settings from Profile (S7 + new S12).** Appearance, push toggle, and
  sign out move to a pushed `app/settings.tsx`, reached via a **⚙ gear** in the
  Profile header (**option A** — keeps 3 clean tabs; the standard mobile pattern).
  Profile is now scrollable and holds only identity + membership.
- **Booking feedback (S4/S5).** A minimal `ToastProvider` (`components/toast.tsx`,
  Animated + a timer, no dep) mounted in the root layout; booking / cancelling
  now toasts ("Booked — Tue · 18:00"). The S5 primary action moves to a **sticky
  bottom bar** (thumb zone).
- **Dark-theme warmth (mobile-only).** `theme.tsx` warms the dark `card` /
  `popover` surfaces (`#0a0a0a → #0f0d0c`) into the stone family via a **local
  override**, not by editing the shared `@matops/ui/tokens` (which would change
  the web). Pure-black background + mono data legibility untouched. Tuned without
  a device (no simulator in the build env) — **flagged for a real-device pass**.

**Tabs go 4 → 3:** Schedule (S4) · My classes (S6) · Profile (S7, ⚙ → Settings S12).

## Consequences

- **No back-end, RLS, or migration work.** All static gates green
  (`@matops/expo` typecheck + lint; repo-wide typecheck 17/17, lint 15/15, tests
  50 pass). Styling stays explicit RN + tokens (ADR 36 — no NativeWind on native).
- **One-tap booking raises volume** → the over-capacity confirm fires more often;
  the "looks full — book anyway?" copy and the confirmed/provisional count stay.
- **Deferred verification.** The QR deep-link round-trip, the overdue strip, the
  toast, and the dark-warmth tweak want a **real-device pass** (no simulator in
  this env) — same constraint as prior mobile ADRs.
- v1 non-goals untouched (no waitlists, no card processor, **no in-app QR
  scanner** — native camera + deep link only).
