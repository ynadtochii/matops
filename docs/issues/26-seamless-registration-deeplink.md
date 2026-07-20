# 26 — Seamless registration + deferred deep link

Type: grilling
Status: resolved
Blocked by: —

## Question
Make first-run as frictionless as possible for students.

## Answer (decided)
- **Preselected academy:** the instructor/owner shares an invite link that carries the academyId; opening it preselects the gym (no picking from a list).
- **Auth:** social login **or** email + **magic link** (passwordless) — add magic link to Better Auth. No password wall on day one.
- **Minimal fields:** first name, second name, phone; **email optional** (add `phone` to the profile).
- **Instant value:** after minimal registration the student **sees the academy schedule immediately** and can **provisionally book** while pending ([22](22-provisional-booking-capacity.md)/[23](23-pending-capability-never-block.md)) — no blocking "awaiting approval" wall. Approval later → **push** ("You're in").
- **App not installed:** the invite link → app store; on first open the **deferred deep link** restores the preselected academy. **v1 easy path:** if that's not smooth, the link just falls back to the **public drop-in form** ([25](25-dropin-lead-form.md)) and sends the data — no install required.
- **Isolation:** a student sees a gym's schedule **only if registered there** (pending or active); never another academy's ([23](23-pending-capability-never-block.md)).

Refines the onboarding flow in [09](09-mvp-product-spec.md) + auth in [02](02-auth-stack.md).

## ⚠ Pressure-test refinement (session 12)
**Email is now REQUIRED** for members (finding B1) — it's the reliable channel for cancellations + gym announcements (email optional only on the public drop-in form). Also: **owner onboarding is made equally seamless** (finding A3) — same magic-link/minimal sign-in, plus quick schedule-building tools (duplicate template, copy day, "typical week" starter) so the owner reaches a working schedule fast.
