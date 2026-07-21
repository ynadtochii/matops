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

## ✅ As built (slice 3.5)
- **Table `drop_in`** (migration `0013`): `academy_id`, name, phone, `email?`, `class_id?` (null = general lead), `consent`, `visit_count`, first/last-visit timestamps. Dedupe = `UNIQUE(academy_id, phone)`; a repeat phone bumps `visit_count` (spec §4), never a new row.
- **Public endpoint:** `dropIn.submit` + `dropIn.academyInfo` are the project's **first `publicProcedure`s** (unauthenticated). With no session they can't use `withTenant`; they call `@matops/db` helpers that write on the **trusted base connection** (bypasses RLS, like the cron), each pinned to a validated `academy_id`. Owner reads (`dropIn.list`) go through RLS-scoped `ctx.db`. This is the enumerated tenant-seam exception ([12]).
- **Consent required** (`z.literal(true)` + pure `canSubmitDropIn`). The current class is resolved server-side (attached if exactly one is on, else a general lead).
- **Web:** public `/checkin/[academyId]` form; owner O4 Drop-in leads section; O6 venue check-in link (printable). *Follow-up:* render that link as a scannable QR image (needs a QR lib).
