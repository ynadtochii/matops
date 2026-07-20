# 22 — Provisional booking & the two-tier capacity model

Type: grilling
Status: resolved
Blocked by: —

## Question
Low-friction goal: unapproved students and drop-ins can book, but capacity must be protected for real members. How does capacity work?

## Answer (decided)
**Two booking tiers:**
- **Confirmed** — only an **active (approved) member**. Increments `class.booking_count`, holds a real spot.
- **Provisional** — a **pending member** or **drop-in**. Recorded on the participation row but **does NOT increment `booking_count`** → never consumes capacity. Displayed "Booked · pending approval".
- "N spots left" = `capacity − confirmed`. Provisional never blocks and is never blocked.

**On approval:** attempt to convert the member's provisional bookings → confirmed via the atomic capacity claim ([13](13-booking-write-atomicity.md)). If room → confirmed. If full (registered students have priority, decision **B**) → stays provisional and the student is notified ("class filled — you're on standby / please rebook"). *Note: this is light waitlist-like behavior — previously a v1 non-goal; consciously accepted in minimal form (no queue ordering, just "convert-if-room-else-notify").*

**Schema impact:** `class_participation` gains a tier marker (e.g. `booking_tier: 'confirmed' | 'provisional'`), set from the booker's membership status at book time; `booking_count` only ever counts `confirmed`. Refines [08](08-mvp-domain-model.md) + [13](13-booking-write-atomicity.md).

## ⚠ Pressure-test refinement (session 12) — SUPERSEDED for v1
The two-tier **capacity enforcement** here is deferred (no hard cap in v1 — see [13](13-booking-write-atomicity.md)). What remains in v1: a pending member's booking is shown **tagged "pending approval"** (display only), and the class count separates approved vs pending for the owner. There is **no spot-holding, no conversion-on-approval, no priority** — those return with hard caps/waitlists in the next iteration. On approval, a pending booking simply becomes a normal booking.
