# 09 — MVP product spec (owner web + student mobile)

Type: prototype
Status: resolved
Blocked by: —

## Question

What exactly does v1 do, **screen by screen**, for each client — the first-iteration product MVP the user asked for?

Independent of the tech decisions (scope is already fixed to "standard"), pin down the product surface:
- **Student mobile (Expo):** onboarding/join-an-academy (invite flow), sign in, view schedule, book/cancel a class against capacity, see "my upcoming classes", profile. What's the core loop and the minimum screens?
- **Owner web (Next.js):** create/edit classes + recurring templates, view the week's schedule with booking counts, roster + approve pending members, take attendance on a class. What's the Sunday-night owner loop, trimmed to standard scope?
- **Cross-cutting:** roles (owner/instructor/student), the approval gate, capacity rules, empty/error states worth calling out.
- **UX bar (crowded niche):** the product wins on *simple, flawless UX*, not feature count. Every screen should justify its existence against a core loop; call out the friction points where competitors are clunky (booking in <3 taps, instant schedule read, no dead-ends). Design system decided in [11](11-design-system.md).

This ticket produces one of the two destination deliverables. Use `/prototype` for any "how should it look/behave" fidelity questions; link rough artifacts as assets rather than pasting them.

Output: `spec.md` — a screen-by-screen MVP product spec for both clients, with the two core loops and the v1 feature list (and an explicit "not in v1" list mirroring the map's Out of scope).

## Answer

Delivered: **[spec.md](../spec.md)** — the v1 MVP product spec.

- **Student mobile (7 screens):** sign-in → join-via-invite → awaiting-approval (auto-advances) → **Schedule (core screen)** → class detail book/cancel → my classes → profile (with academy switcher). Core loop is ≤3 taps: open → Schedule → Book.
- **Owner/instructor web (6 screens):** dashboard → schedule (week + booking counts + one-off classes) → recurring templates → roster + **approve members** + invite links → attendance (booked + walk-ins) → settings (tz/invites). Instructors get a subset (no approval/settings).
- **Cross-cutting:** approval gate, transactional capacity with graceful "just filled" failure, class-cancellation shown as state (no comms domain in v1), tz per academy, first-class empty/error states (the crowded-niche UX bar), offline out.
- **Not in v1** mirrors the map's Out-of-scope; expansion seams live in the architecture doc.
- **DoD:** owner schedules → invites → student joins/approved/books in ≤3 taps → instructor takes attendance. Both loops end to end.
