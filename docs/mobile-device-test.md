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

## S1 · Sign in (magic link) — device-only

- [ ] Enter email → "Check your email" state.
- [ ] Copy the `[auth] magic link for …` URL from the `pnpm dev:next` terminal,
      open it on the device.
- [ ] The link **bounces back into the app** (not Safari) and the auth gate routes
      onward. *(This is the `matops://` return — the main device-only risk.)*
- [ ] Signed-in with no academy → lands on **"Join a gym"** (onboarding).

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
- [ ] On the web roster, the pending student appears → **approve** → on the next
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

---

*Report: build (iOS/Android + version), which items passed/failed, and any repro
steps for failures.*
