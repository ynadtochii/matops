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

## S8 · Scan to check in (v3.0, ADR 70) — REAL PHONE ONLY

The iOS Simulator has no camera, so none of this can be checked there. Use a
physical phone: `cd apps/expo && npx expo run:ios --device`, or an EAS
`development` build. Print or open the poster first: web → **Settings** → the
venue check-in QR.

Happy path
- [ ] The tab bar shows **four** tabs: Schedule · My classes · **Scan** · Profile.
- [ ] First tap on **Scan** → iOS asks for camera access with "Scan your gym's QR
      poster to check in to a class." → allow → the OS scanner sheet opens.
- [ ] Point at the poster with a class running now → the sheet closes → the
      check-in screen shows **"You're checked in."**
- [ ] The web attendance roster (O5) for that class now lists you as present.
- [ ] Scan again → still present, still one booking (idempotent).

Edges, none of which may dead-end
- [ ] No class in the window → **"No class to check into right now."**
- [ ] Scan a gym you are not a member of → the front-desk message.
- [ ] Scan the **join** poster (`/join/<token>`) → "That's not a check-in code."
- [ ] Scan any other QR (a Wi-Fi code, a random link) → the same message, no crash.
- [ ] Cancel the scanner sheet → the Scan screen is there with a **Scan gym QR**
      button that reopens it.
- [ ] Deny camera access, reopen the tab → the "camera access is off" copy plus
      **Open settings**, which lands in the app's settings page.
- [ ] Leave the Scan tab mid-scan, come back → the sheet reopens, and a code
      scanned after leaving does not navigate a screen you already left.

Still-working fallbacks (unchanged by this wave)
- [ ] Scanning the poster with the **phone's camera app** still opens the public
      page, and **"Open the app to check in"** still deep-links into the app.
- [ ] A visitor with no app still gets the drop-in form on that page.

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

## Waves that have never been on a device

Everything below shipped static-gates-green only. Each item is here because no
simulator exists in the build environment, not because it is known broken.

**v1.8 mobile IA (ADR 45)**

- [ ] Booking is **one tap** from the schedule row; the over-capacity row asks
      "book anyway?" first.
- [ ] The **Check-in tab is gone**; a `matops://checkin/<academyId>` deep link
      still opens the walk-in screen.
- [ ] The **overdue header** (S11) appears on Schedule / Training when dues are
      past due, and clears once the owner confirms a claim.
- [ ] **Settings** (S12) opens from the gear in the Profile header.

**v2.0 / v2.1 mobile waves (ADR 54, 55)**

- [ ] Booking a class schedules a **local reminder** ~2h before it starts;
      cancelling the booking drops it. Needs a class more than 2h out.
- [ ] The notification **permission prompt** appears on the first booking, and a
      denied prompt does not crash the booking.
- [ ] Turning the **push toggle off** clears the scheduled reminders too.
- [ ] **Pull to refresh** works on Schedule, Training and Profile; returning to
      the app after hours shows fresh spots-left, not a stale count.
- [ ] Opening a class shows **who is in it** — names for an approved viewer,
      counts for a pending one, drop-ins always a count.

**v2.4 frontend review fixes (ADR 59)**

- [ ] **Sign out, then sign in as a different student on the same device:** the
      schedule, training tab and academy name are the **new** user's
      immediately. This is the cache-clear fix; the old bug showed the previous
      user's data for ~30 seconds.
- [ ] Same check after a **magic-link verify** (open a second student's link on a
      device already signed in as someone else).
- [ ] **Cancel a booking from the Training tab** with the backend stopped: a
      "Could not cancel" toast appears (it used to fail silently there).
- [ ] **Book two classes quickly, then cancel one:** the cancelled class sends no
      reminder, and the other one still does.
- [ ] The Training tab shows the **error state alone** when `booking.mine` fails,
      not the error and "Nothing booked yet" together.

---

*Report: build (iOS/Android + version), which items passed/failed, and any repro
steps for failures.*
