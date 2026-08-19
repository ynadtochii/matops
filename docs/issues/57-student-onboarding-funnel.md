# 57 — The student's first client is the web, not the app store

**Status:** accepted · **Date:** 2026-08-19 · **Area:** join flow (S2), student web (S4, S5), settings (O6) · **Amends:** [42](42-owner-mobile-web-pwa.md)

## Context

A gym owner asked for a web page where a student registers and then gets a link
to download the app. Registration on web already exists, twice: `/join/<token>`
(`join-flow.tsx`) and the 6-digit code path (`join-by-code.tsx`). Both sign the
student in, take a name and phone, and create a pending membership. So the ask
was really about the step after it, and looking at that step turned up two
problems.

**There is no download link.** The iOS build is blocked on a paid Apple developer
account the project does not have, and the Android build has never been
submitted. A "Download the app" button today is a promise the product cannot
keep for most students.

**The install is the most expensive step in the funnel, and the request would
have added it rather than removed it.** Counting the hand-off as designed: open
link, type email, leave for the mail app, tap the magic link, return, fill in
name and phone, join, open the store, install, open the app, type the email
again, mail app again, tap a second magic link, return. Two magic links, one
install, six app switches. A gym owner standing next to a new student watches
that fail once and goes back to a WhatsApp group.

**And web registration currently ends nowhere.** A student who joins on web lands
on `/`, where `dashboard-screen.tsx` gives them "You're almost in." forever,
because every nav item is gated on `isStaff` or `isOwner`. That dead end is the
whole reason a download hand-off looked necessary.

## Decision

**The student's phone browser is a first-class client for the first session. Give
a joined student the schedule and booking on web. The native app becomes an
optional upgrade, never a required step.**

Three changes, in order:

- **The join link is also a QR code** (E.1). A student joins face to face at the
  gym, and the cheapest transfer between two people in one room is a camera
  scan. The owner holds up a phone; nobody spells an email out loud.
- **The mail round trip moves to the end of the join form** (E.2). Email, name
  and phone are asked together, then the magic link is sent, so the one
  unavoidable app switch returns the student to a finished join instead of to
  another form.
- **A student on web gets the week schedule with book and cancel** (E.3), reusing
  `class.mine` and the `booking` router the mobile app already calls. Dues,
  stats and check-in stay app-only until somebody asks for them.

### What this does not change

The approval gate stays. It is not friction on the first booking: `bookingTier`
already returns `provisional` for a pending member, so a student books before an
owner approves them.

The two-client split stays. This is not "students get the full web app". It is
the first session, on the device the invite link opened on.

## Why this amends ADR 42

ADR 42 evaluated "students want web too" and rejected it as Kano *Indifferent* —
no natural laptop moment for a student. That reasoning holds and is not
overturned here. This is a different claim: the phone browser is where the
invite link lands, and it is the only client with no install wall. ADR 42's own
logic (ship to both platforms instantly, no store review, no Apple account)
applies to a student's first session more strongly than it did to the owner.

## Consequences

- No migration, no new domain rule, no new tRPC procedure for E.1 and E.3; the
  student routers are already shared by both clients.
- The web shell's role split grows a third branch. `isStaff` / `isOwner` no
  longer cover every case, so a student route must be added to the nav config
  rather than left to fall through to the staff dashboard.
- A download banner becomes honest later: show it on Android only, and only
  after a student has booked once.
- Rejected along the way: a marketing landing page, deferred deep links (Branch
  and similar), and universal links built purely for onboarding.

## Addendum (E.4) — the install card advertises installing, not a download

The student screen was asked for a note saying "download the app for the best
experience". It does not have one, and the reason is the same fact this ADR
opens with: **there is no listing to link to.** iOS is blocked on an Apple
developer account; Android has never been submitted. A "Download the app"
button today either 404s or opens a store search, and a student who taps it once
and gets nothing stops trusting the rest of the screen.

What does exist is the PWA. The manifest has had `scope: "/"` since W.1, so the
student week at `/` was already installable and nothing on the page said so. The
card offers that instead: an **Install** button where the browser fires
`beforeinstallprompt`, and the **Share → Add to Home Screen** wording on iOS,
where no such prompt exists and the step has to be described in words. It hides
itself once `display-mode: standalone` matches, so an installed student never
sees it again, and it is never shown to a suspended member.

The claim "best experience" is therefore true as written: an installed PWA
**is** the best matops a student can have today. When a store listing exists,
this card is the one place that has to change.
