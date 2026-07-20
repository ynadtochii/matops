# 25 — Drop-in / no-app public check-in form (lead capture)

Type: grilling
Status: resolved
Blocked by: —

## Question
Some people won't install the app (drop-ins, first-timers). Capture them for the owner without forcing an install.

## Answer (decided)
The **same venue QR** ([24](24-qr-self-checkin.md)) also serves a **public, unauthenticated web form** (no login) for people without the app:
- **Fields:** first name, second name, phone number, **email (optional)**.
- Submit → saved as a **drop-in lead + attendance** for that gym, tied to today's class/date.
- **Never eats capacity** (same as provisional — [22](22-provisional-booking-capacity.md)).
- **Owner** sees drop-ins in the roster/attendance view, marks them present, and **keeps the contact for follow-up** (lead nurture).
- **Anti-spam:** the QR is physically inside the gym → presence is the gate (simple, sufficient for v1).

**Scope note:** this is a controlled, per-gym check-in/lead form — it softens the original "no public unauthenticated page" non-goal, but it is NOT a public booking page. Accepted.

New: a `drop_in` / `lead` table (academyId, name, surname, phone, email?, classId/date, createdAt) + a public per-academy endpoint (an allowed public entry point, like invite-by-code). Refines [09](09-mvp-product-spec.md); the public endpoint is an enumerated exception to the tenant seam ([12](12-tenant-isolation-mechanism.md)).

## ⚠ Pressure-test refinement (session 12)
The drop-in form is for **first-time visitors only** (finding A1) — not a repeat check-in path. After capture, the owner **follows up with an app invite link (deep-linked to the gym)** to convert the lead into a member; repeat visitors are nudged to register. Add a **consent checkbox** ("OK for the gym to contact me") to the form (finding E3, GDPR).
