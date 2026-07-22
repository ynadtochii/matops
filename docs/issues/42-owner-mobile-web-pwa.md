# 42 · Owner mobile = web PWA, not a unified native app

*(Direction-setting decision — no slice shipped yet; it fixes **how** the "owner on the go" need gets built when it is scheduled. Product analysis in `.scratch/owner-mobile/` (product-owner session, 2026-07-22). Builds on the two-client split — [cross-platform UI](32-cross-platform-ui.md), [app navigation shells](38-app-navigation-shells.md) — and the deferred native path — [deep-link approach](31-deep-link-approach.md), [home widget](27-home-widget.md). Reference only: MAT had no owner mobile at all.)*

## Context

Today matops has two clients split by role: **owner/instructor → Next.js web**, **student → Expo native app**. The owner's core jobs, though, happen **on the mat, not at a desk** — mark attendance at class time, cancel tonight's class from the car, send a join link to someone who just walked in, approve a pending member. For all of these the owner must walk to a laptop, or — more often — not do them at all. Attendance in particular is the input to the whole v1.2 insights engine ([39](39-attendance-derived-stats.md)); if it is not captured at the mat, "who's drifting" runs on thin data.

So the owner needs a phone experience. Two ways to give it were on the table:

- **A — one native app, both roles.** Add owner screens + role-gating to the existing Expo app; students and owners share one binary.
- **B — owner uses the web as a PWA.** Students stay native; the web app (already responsive, already has a mobile bottom-tab shell — [38](38-app-navigation-shells.md)) becomes installable and phone-friendly for owners.

A parallel "students want web too" request was evaluated in the same session and **rejected** (Kano *Indifferent* — no natural laptop moment for a student; near-zero value; keep the shared router so it stays cheap to revisit later). This ADR is only about the owner-mobile half.

## Decision

**Serve the owner-mobile need as a responsive/installable PWA of the existing web app. Do not build a unified both-roles native app.**

### The load-bearing fact: owner-web can never be deleted
The owner's heavy jobs — payments/plans/bank details ([40](40-manual-transfer-payments.md)), the O1 command-center dashboard, roster management, bulk edits — are **desk-shaped** and already live on web. Nobody configures membership plans one-handed on the mat. So the web app stays no matter what. That reframes the choice:

- **Option A does not consolidate — it adds.** Owners still open the laptop for desk work, so A leaves you maintaining a *fatter native app* **plus** the web app. More surface, not less.
- **Option B makes one client do double duty** — desk work *and* on-the-mat work — with **no new codebase**.

### "One app for both roles" is the wrong shape anyway
A student app is a consumer product (casual, in-pocket, book-a-class); an owner tool is admin software (grids, roster, money). Merging them means every student ships owner code and vice versa, two design languages inside one binary, role-gated navigation, and confused store positioning. Even if matops goes native for owners later, the right shape is a **separate** owner app — never a merged one.

### The blockers make A the worse bet *today*
Native is currently blocked on an Apple developer account, and the **existing** Expo app still can't be fully device-tested in this env (no simulator) — see [31](31-deep-link-approach.md) and the standing handoff pattern in [38](38-app-navigation-shells.md). Option A would double a native surface we can't test and can't ship to iOS. Option B ships in-browser to **both** platforms instantly, no store review, no account.

### MVP scope when the slice is built — the four on-the-mat jobs only
Design for **one-handed, standing-on-the-mat, five-second** interactions on screens that already exist:
- Take attendance (mark present/absent, add walk-ins, mark-all — [F.2]) with thumb-reachable targets.
- Cancel / edit a class.
- Share invite link + venue QR (native share sheet works from a PWA).
- Approve a pending join.
- Plus a web-app **manifest + add-to-home-screen** so it feels like an app.

**Cut from the mobile MVP:** the O1 dashboard reflow (analytics is a desk job), payments/plans/settings editing (desk-first), and **native push** — the daily email/existing reminder path ([34](34-notifications-layering.md)) covers dues + class notices for now. The value is the *interaction design at phone size*, not a port of the desktop layout.

### What stays out (and the reversal trigger)
A **native owner app stays parked.** It becomes a candidate — as a **separate** app, not a merge into the student app — only when **both** are true: (1) real signal that owners are missing a native-only capability on the mat (reliable push, offline attendance, a home-screen widget — [27](27-home-widget.md)) that the PWA can't fake well enough, **and** (2) the Apple-account / device-test blockers are cleared. Until then, do not build it, and do not merge roles into one binary. **Student web** also stays parked (revisit only on real demand).

## Consequences

- The owner gets on-the-mat capability in **days**, on iOS **and** Android, with **zero** new codebases, no store review, and no Apple-account dependency — the web app simply earns its keep on the phone.
- Attendance capture moves to where it actually happens, which strengthens the data feeding the v1.2 insights engine — a second-order win beyond convenience.
- Trade-off accepted: no native push/offline/widget for owners in the PWA (email covers reminders); PWA push on iOS is limited. This is the deferred-native tail, revisited only on the trigger above.
- Maintenance stays at two clients on their natural axis — **student = native (casual), owner = web (admin + now mobile)** — instead of three surfaces or one overloaded binary.
- No migration, no domain change: this is a client-shell + PWA-manifest concern; the tRPC router and tenant seam are untouched.

## Status

**Built in v1.5 (2026-07-22).** The owner-PWA slice shipped: a Next App-Router manifest route (`/manifest.webmanifest`, standalone + brand theme + basketweave icons), iOS home-screen metadata + `apple-touch-icon`, `viewport-fit=cover` with `env(safe-area-inset-*)` padding on the mobile shell, a native **Share** button (Web Share API + clipboard fallback) on the invite-link + venue-QR screens, and full-width ≥44px thumb targets on O5 attendance. **No migration, no router change** — a client-shell + manifest concern; the tenant seam is untouched. **Cut as designed:** service worker / offline, native push, the O1 dashboard reflow, and mobile settings/payments editing — the deferred-native tail, revisited only on the reversal trigger above. Spec ID **O8**; roadmap **v1.5** (W.1–W.2); as-built in `architecture.md` §0. Device install / visual check pending (no simulator in the build env — the standing handoff pattern from ADR 38).
