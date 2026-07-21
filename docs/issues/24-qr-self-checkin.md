# 24 — QR self check-in (book + attend in one)

Type: grilling
Status: resolved
Blocked by: —

## Question
Reduce student friction and give the owner attendance without coach effort. How does in-venue check-in work?

## Answer (decided)
**One static per-gym QR** displayed inside the venue. Scanning it (app deep link, or web fallback) →
- Identifies the academy + the **current/next class** (inferred from time; ask only if two run at once).
- Marks the scanner **present** for that class.
- If they hadn't booked, it **books them first** then attends (a confirmed booking for active members if capacity allows; otherwise a **provisional** attend — see below).

**Capacity vs attendance:** check-in marks **present even if the class is full** — the person is physically there; capacity only governs *reservations*, not who walked in. Attendance is always recorded (walk-in style).

**Static QR is safe enough:** the QR lives inside the gym, so physical presence is the gate (matches the drop-in anti-spam stance, [25](25-dropin-lead-form.md)). Booking = book only; **QR = book + attend** (as specified).

New surface: a check-in endpoint + the venue QR (encodes academyId). Reuses the booking write ([13](13-booking-write-atomicity.md)/[22](22-provisional-booking-capacity.md)) + attendance write. Refines the attendance model in [08](08-mvp-domain-model.md)/[09](09-mvp-product-spec.md) (attendance was coach-only).

## ✅ As built (slice 3.4)
- **Endpoint:** `checkin` router — `today` (resolves the current/next class **server-side** via the pure `resolveCheckInClass`, so the Expo app needs no `@matops/domain` dep) + `checkIn` (book-if-needed + mark `present`, one RLS tx, present even if full, idempotent; pending → provisional).
- **No camera in v1 (decision D3):** the mobile "Check in" screen (S8) uses the caller's **active academy** rather than scanning — a single-gym student's academy is their gym. The physical gym QR points at the **public drop-in web form** (slice 3.5), which is the real use of a scannable code in v1. Camera scan is a later polish.
