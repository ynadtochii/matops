# Mobile device-test checklist

The Expo static gates (`pnpm -F @matops/expo typecheck lint format`) + code review
cover the code. This checklist covers what **only a real build confirms** — the
things the build env can't (no simulator): touch flow, navigation, the magic-link
deep-link return, and live tRPC calls against a running backend.

Run it on a **dev build** (`pnpm -F @matops/expo mobile`, or `expo run:ios` /
`run:android`), **not Expo Go** — Expo Go owns its own URL scheme, so the
`matops://` magic-link return does not fire there.

## Setup

1. **Backend up:** `pnpm dev:next` (magic links print to this terminal; tRPC + DB
   live here).
2. **App up:** `pnpm -F @matops/expo mobile` (boots the simulator, builds the dev
   client the first run, launches into the Metro bundle).
3. **Get an academy code to test with:** sign in on the web, **Start a gym** → the
   dashboard shows the **Academy ID** (6 digits). Any existing academy's code
   works too.

Legend: `[ ]` = to verify on device · note the build (iOS / Android + version).

---

## S1 · Sign in (magic link) — device-VERIFIED (simulator, 2026-07-21)

The terminal logs **two** links per sign-in: the web `[auth] magic link …` (http)
and `[auth] mobile deep link …: matops://magic-link?token=…`. **Mobile must use the
deep link** — opening the http link in Safari sets the session cookie in the
browser, not the app, so the app can't sign in. `app/magic-link.tsx` verifies the
token from the app's own client (the cookie then lands in SecureStore).

- [x] Enter email → "Check your email" state.
- [x] Open the **`matops://magic-link?token=…`** deep link (e.g.
      `xcrun simctl openurl booted "matops://magic-link?token=…"`, tap **Open**).
- [x] The app verifies and the auth gate routes onward — **not** stuck on sign-in.
- [x] Signed-in with no academy → lands on **"Join a gym"** (onboarding).
- [ ] Real-device retest (email link tap, not simctl) once EAS is set up (Phase 5).

## S2 · Join by academy code (slice 1.7) — the v1 flow

Happy path
- [ ] Onboarding shows the **"Gym ID"** field + "Find gym", no link/paste UI.
- [ ] Type a valid **6-digit** code → "Find gym" → screen switches to
      **"Join {academy name}"** with the profile form.
- [ ] Fill first name, last name, phone → **"Join {name}"** → lands on the
      **schedule** with the **S3 pending banner**.
- [ ] The join button is **disabled** until all three fields are non-empty.

Validation + not-found
- [ ] A code shorter/longer than 6 digits, or with letters → inline
      **"Enter your gym's 6-digit ID."** and **no** network call is made.
- [ ] A well-formed but unknown code → **"No gym found with that ID — check the
      number with your gym."** (stays on the code screen).
- [ ] While the lookup runs, a spinner shows; the button is disabled.

Navigation / state
- [ ] **"Use a different ID"** on the confirm screen returns to code entry.
- [ ] Editing the code **after** a gym was found clears the found result (no stale
      "Join {old name}").
- [ ] **Sign out** from onboarding works (user isn't stranded gym-less).

Second academy + approval loop
- [ ] While signed in, join a **second** gym by its code → another pending
      membership → it appears in the **S7 switcher** (shown once 2+).
- [ ] On the web member list, the pending student appears → **approve** → on the next
      app load/refresh the **banner clears** (now active).
- [ ] Reject a student on the web, then re-enter the same code on the device →
      lands **pending again** (re-open, not blocked).

## Regression — deep-link route (kept, not the v1 path)

The `matops://join/<token>` route stays for the next iteration; a quick check it
still resolves:
- [ ] `xcrun simctl openurl booted "matops://join/<token>"` with a live invite
      token → opens the old join screen ("Join {academy}").

## Robustness / edges

- [ ] **Backend down / offline** during "Find gym" → **"Could not search right
      now — try again."** (no crash).
- [ ] Background the app mid-join, return → no duplicate membership, no crash.
- [ ] After a successful join, re-opening the app skips onboarding and lands on
      the schedule (active-academy gate).

## Push notifications (Phase 4 — device-only; needs a dev build + an EAS project id)

Simulators cannot receive push, and `getExpoPushTokenAsync` needs an EAS project
id (lands with the Phase 5 launch infra), so all of this is device-only.

- [ ] On first sign-in, iOS/Android shows the **notification permission** prompt;
      granting it registers a token (a `push_token` row appears for the user).
- [ ] **Class cancelled** (owner cancels a class you booked) → a push arrives even
      with the app closed; tapping it opens that **class detail**.
- [ ] **Class time/instructor change** on a booked class → push arrives.
- [ ] **Membership approved** (owner approves you) → "You're in!" push; tapping it
      opens the **schedule**.
- [ ] **Reminder:** trigger `GET /api/cron/remind` (with `Authorization: Bearer
      $CRON_SECRET`) for a booked class starting within the lead window → one push;
      a second call sends **0** (idempotent via `reminder_sent_at`).
- [ ] **Profile → Push notifications toggle:** turning it **off** stops further
      pushes to this device (token removed); turning it **on** re-registers.
- [ ] **Sign out** removes the device token (no pushes after signing out).
- [ ] Foreground push shows the in-app banner; permission **denied** → app still
      works, no crash, no token.

---

*Report: build (iOS/Android + version), which items passed/failed, and any repro
steps for failures.*
