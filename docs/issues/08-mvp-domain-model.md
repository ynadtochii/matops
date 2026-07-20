# 08 — MVP domain model & schema

Type: grilling
Status: resolved
Blocked by: 03, 05

## Question

What is the **minimal Postgres schema** for the standard MVP scope, and what invariants are baked in from the first table?

Model (domain-modeling) the tables and their relationships for: academies (tenant root), users + membership-in-academy + role (owner/instructor/student), class templates (recurring definitions), classes (concrete instances), bookings, attendance. Re-derive the good schema instincts from the old app (integer money is N/A here, but: orthogonal state axes, soft-delete where referenced, discriminated unions over optional-field pairs, academyId-leading indexes).

Open modelling calls to settle:
- **Recurring classes:** materialize templates into concrete `classes` rows (old app's approach, via a job) vs compute-on-read vs hybrid — the old app flagged this as an unresolved fork (D1). Decide it here for MVP.
- **Booking + attendance:** two tables vs one `classParticipation` (old app's D2 fork). Decide.
- **Membership-in-academy** as a first-class join (user ↔ academy ↔ role + status) so a user *could* later belong to multiple academies without a refactor — supports the "expandable" constraint.
- **Class identity:** the classType + optional customName legacy shape, or a cleaner discriminated union now.

Depends on the DB access tool ([03](03-postgres-access-layer.md)) and the tenancy model ([05](05-multitenancy-model.md)) for how academyId/scoping is expressed.

Output: an ERD / table list with columns, keys, indexes, the D1/D2 resolutions, and the baked-in invariants.

## Answer

Full Drizzle draft: [assets/schema-draft.ts](../assets/schema-draft.ts). Design record below.

### Identity split — reuse Better Auth, don't rebuild it
Per [02](02-auth-stack.md), identity/tenancy tables come from **Better Auth + its Organization plugin**, in the *same* Postgres (Drizzle adapter). We do **not** hand-roll them:

| Concept | Source table | Notes |
|---|---|---|
| User identity | Better Auth `user` / `session` / `account` | `userId` = `user.id` (text) |
| **Academy** (tenant root) | Organization plugin `organization` | `academyId === organization.id`; add `timeZone` via `additionalFields` |
| **Membership + role** | `member` (role: owner/instructor/student) | approval gate via `status: 'pending' \| 'active'` + `approvedAt` additionalFields |
| **Invite-link join** | `invitation` | resolves to academy + role |

Our schema owns only the **scheduling domain** (3 tables). FKs to Better Auth rows are by text id, deliberately *not* hard cross-schema FKs, so auth and domain stay loosely coupled (integrity via the tenant seam + app).

**Membership-in-academy is first-class** (it's the `member` join) → a user can belong to/operate several academies later with no refactor (serves the multi-academy-native constraint from [05](05-multitenancy-model.md)).

**Approval gate (in scope):** self-join via invite link → `member.status = 'pending'` → owner approves → `'active'`. (Its original plan-cap purpose is gone since billing is out, but "roster + approval" is in the standard scope, so we keep the gate.)

### D1 — recurring classes: **RESOLVED → materialize-ahead**
Templates are materialized into concrete `class` rows by a **scheduled job over a rolling horizon** (e.g. 6 weeks), idempotent gap-fill keyed by `UNIQUE(templateId, startsAt)`, cursor = `template.generatedUntil`.
- **Why over compute-on-read/hybrid:** real rows give clean FKs for bookings/attendance, trivial per-instance overrides (cancel/modify a single class, change one class's capacity), and it's the most conventional/agent-known shape. Compute-on-read needs an exceptions table for overrides anyway and awkward virtual-occurrence FKs.
- **Cost / new dependency:** needs a scheduler → **Vercel Cron** hitting a protected materialization endpoint daily (portable: any cron can call it). Flows into the [architecture doc](10-architecture-design-doc.md) + hosting.
- **Timezones:** template stores local `startsAtMinutes` + IANA `timeZone`; the job computes each occurrence's UTC instant DST-aware (Luxon/`date-fns-tz`/Temporal) → stored as `class.startsAt` (timestamptz).
- **Bonus:** `templateId` is nullable → **one-off classes** (special seminars) cost nothing extra.

### D2 — booking + attendance: **RESOLVED → one unified `classParticipation` table**
One row per `(class, student)`, with **two orthogonal state axes** (the ADR-005 lesson): `bookingStatus` (booked/cancelled/none) and `attendanceStatus` (unmarked/present/absent).
- **Walk-in** = `bookingStatus:'none'` + `attendanceStatus:'present'` (derived, not a stored flag → no drift).
- Rebook = flip a cancelled row back to booked (the unique key means one row ever).
- **Why unify:** fewer tables, no two-tables-describing-one-pair drift, and — critically — `UNIQUE(classId, studentId)` **is the double-book guard** that makes capacity correct under the transactional approach from [04](04-realtime-strategy.md).

### Baked-in invariants (re-derived from the old app)
1. **Structural tenancy** — every table carries `academyId` + an academyId-leading index; the seam ([05](05-multitenancy-model.md)) injects it, never per-handler discipline.
2. **Orthogonal state axes** — business `status` vs `deletedAt` (soft-delete) on templates/classes; booking vs attendance on participation. No optional-field-pair status hacks.
3. **Soft-delete where referenced** — `class_template` / `class` carry `deletedAt` (participation rows point at them); reads exclude soft-deleted.
4. **Uniqueness as integrity** — `UNIQUE(templateId, startsAt)` = idempotent materialization; `UNIQUE(classId, studentId)` = no double-booking.
5. **Capacity is transactional** — booking mutation: lock the `class` row, check `bookingCount < capacity`, upsert participation, increment `bookingCount` — all in one tx (the ticket-04 guard). `bookingCount` denormalized for cheap "spots left".
6. **UTC instants** — all timestamps `timestamptz`; local time lives only on the template.
7. **Normalized** — no denormalized names in MVP (tRPC joins are cheap at this scale); revisit only if measured.

### Tables at a glance
`class_template` (recurring def) · `class` (materialized instance, templateId nullable) · `class_participation` (unified booking+attendance). Plus Better Auth's `organization`/`member`/`invitation`/`user` for identity. See the asset for columns/indexes.

## ⚠ Post-review note (session 8)
Two refinements from the critical review: the booking write mechanism (interactive tx vs atomic conditional UPDATE) → [13 — Booking write atomicity](13-booking-write-atomicity.md); the undefined `completed` status transition → [19](19-class-completed-transition.md). The Better Auth pending-member assumption is being validated in [14](14-better-auth-approval-feasibility.md).
