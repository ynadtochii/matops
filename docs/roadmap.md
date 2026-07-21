<!-- matops — live implementation plan + scope matrix. Rules for this file live in delivery.md. -->
# matops — Roadmap (live plan + scope matrix)

> **How to use.** Build **top to bottom**. Each slice is vertical (DB → API → client) and ends shippable.
> Flip cells as you go: **`—`** not needed · **`todo`** · **`wip`** · **`done`**. Every flip to `done` must pass the [Definition of Done](delivery.md#4-definition-of-done-the-anti-drift-gate).
> Surfaces: **DB · API · Web · Mob · Sh(ared) · Inf(ra)**. Spec IDs trace up to [spec.md](spec.md); tickets to [map.md](map.md).

**Status:** **Phase 2 complete, web-first** (slices 2.1–2.4; Phase 1 done before it). All static gates are green — `lint` (13/13), `typecheck` (15/15), `test` (54 tests). Scheduling core is built: recurring class templates (O3), DST-aware materialization (lazy on save + a bounded daily Vercel Cron), one-off classes, edit/cancel with future-instance propagation, and the schedule reads (owner web `class.week`; student `class.mine`, API-ready). **Deferred to a mobile pass:** all Expo student UI — the join screen + deep links (1.3/1.4/1.6) **and** the student schedule screen (2.4 Mob) — the student-lens API is now in place, so the pass is unblocked.

> **Verified live on Neon.**
> - **Phase 1 exit test** — sign in (magic link) → **Start a gym** → active **owner** (RLS scope set) → create/rotate an invite link → a second user joins **pending, holding no academy role** → owner **approves** → role granted + active. "Never ownerless" blocks removing the sole owner; a student is `FORBIDDEN` from owner-only routes.
> - **Phase 2** — a Mon/Wed/Fri 18:00 Europe/Kyiv template **materialized 18 classes** over 6 weeks at 15:00 UTC (correct DST offset); re-run inserted **0** (idempotent); cursor advanced to now+42d. Template edits propagate: a content edit kept the rows + retitled; a timing edit regenerated Mon/Wed → Tue/Thu; one-off create + cancel worked.
> - Migrations `0000`–`0008` applied; RLS leak tests (probe + `class_template` + `class`) green.

---

## Phase order (why this sequence)

Each phase needs the one before it. Inside a phase, slices are ordered by dependency too.

```
0 Foundations   → the skeleton everything sits on (no product value, but load-bearing)
1 Identity      → the join loop: get people INTO an academy with the right access
2 Scheduling    → owners define the week; classes exist to book
3 Booking       → the student loop: book, cancel, check in, walk in
4 Notify+Polish → the app talks back; flawless states
5 Hardening     → safety nets + ship to production
```

Solo-builder note: 0.5 (auth) and 0.6 (CI) can run beside 0.2–0.4. Everything else is sequential.

---

## Live scope matrix

One row per slice. This is the single answer to *"what's left, on which surface?"*

| # | Slice | DB | API | Web | Mob | Sh | Inf |
|---|---|---|---|---|---|---|---|
| **0** | **Foundations** | | | | | | |
| 0.1 | Monorepo scaffold (create-t3-turbo) | — | done | done | done | done | done |
| 0.2 | DB package: Drizzle + Neon + migrate + seed | done | — | — | — | — | done |
| 0.3 | Tenant seam: RLS role + per-req tx + `scopedDb` + leak test | done | done | — | — | — | done |
| 0.4 | tRPC base + procedure tiers | — | done | — | — | done | — |
| 0.5 | Better Auth (core + org + magic-link) | done | done | done | done | done | — |
| 0.6 | CI/CD + env + preview builds | — | — | — | — | — | done |
| **1** | **Identity & tenancy** | | | | | | |
| 1.1 | Owner onboarding (create academy, magic link) | done | done | done | — | done | — |
| 1.2 | Invite links (per-role, create/rotate) | done | done | done | — | done | — |
| 1.3 | Student self-join → pending (min fields, email req.) | done | done | — | done | done | — |
| 1.4 | Uniform approval gate + `enrolledProcedure` | — | done | done | done | done | — |
| 1.5 | Roster (approve/remove/suspend, promote co-owner) | done | done | done | — | — | — |
| 1.6 | Multi-academy switcher | — | done | done | done | — | — |
| 1.7 | Numeric academy code join (mobile v1) | done | done | done | done | done | — |
| **2** | **Scheduling core** | | | | | | |
| 2.1 | Class templates CRUD (recurring) | done | done | done | — | done | — |
| 2.2 | Materialization (lazy + bounded cron) | done | done | — | — | — | done |
| 2.3 | Class instances (one-off + edit/cancel rules) | done | done | done | — | done | — |
| 2.4 | Schedule read (owner web + student mobile) | — | done | done | done | done | — |
| **3** | **Booking & attendance** | | | | | | |
| 3.1 | Book / cancel (atomic write, soft capacity) | todo | todo | todo | todo | todo | — |
| 3.2 | Provisional booking for pending (display tag) | — | todo | todo | todo | — | — |
| 3.3 | Attendance marking (staff) | todo | todo | todo | — | — | — |
| 3.4 | QR self check-in (book + attend) | todo | todo | todo | todo | todo | todo |
| 3.5 | Public drop-in / lead form (consent, dedupe) | todo | todo | todo | — | todo | todo |
| **4** | **Notifications & polish** | | | | | | |
| 4.1 | `notifications` package (Expo Push + Resend) | — | todo | — | todo | todo | todo |
| 4.2 | Events (cancel, reminder, approval, class change) | todo | todo | — | todo | todo | todo |
| 4.3 | Empty/error/soft-capacity states, design pass | — | — | todo | todo | todo | — |
| **5** | **Launch hardening** | | | | | | |
| 5.1 | `booking_count` reconciliation cron | — | todo | — | — | — | todo |
| 5.2 | Observability + errors + rate-limit public routes | — | todo | todo | todo | — | todo |
| 5.3 | Production release (Vercel + Neon prod + EAS submit) | todo | — | todo | todo | — | todo |

---

## Slice detail

Only the non-obvious tasks + spec/ticket refs are listed. Fill tasks into checkboxes as you start each slice.

### Phase 0 — Foundations
**Exit test:** web *and* mobile each make one authenticated, tenant-scoped tRPC call end to end.

- **0.1 Monorepo scaffold** — `create-t3-turbo` layout: `apps/{nextjs,expo}` + `packages/{api,db,auth,validators,domain,ui}` + `tooling/*`. Turborepo + pnpm. Refs: tickets 07, 01.
- **0.2 DB package** — Drizzle, `pg` driver on Neon **`-pooler`** endpoint, drizzle-kit migrations, dev seed script, one `_health` table. Refs: tickets 03, 21.
- **0.3 Tenant seam** — non-BYPASSRLS role; RLS policy `USING (academy_id = current_setting('app.academy_id'))` (**text**, no `::uuid`); per-request transaction sets `set_config('app.academy_id', id, true)`; `scopedDb` helper; **leak test** as permanent regression net. Refs: tickets 12, 05, 21.
- **0.4 tRPC base + tiers** — `publicProcedure` · `enrolledProcedure` (pending) · `memberProcedure` · `staffProcedure` · `ownerProcedure`. One `ping` reads under RLS. Refs: tickets 01, 20, 23.
- **0.5 Better Auth** — core (user/session/account) + Organization plugin (org=academy, member, invitation) + **magic-link** plugin; Drizzle adapter; Expo secure-store sessions; `phone` additionalField on member/user. Refs: tickets 02, 14, 26.
- **0.6 CI/CD** — typecheck + lint + `migrate --check` in CI; Vercel preview; EAS dev build; env/secrets convention. Refs: tickets 06, 15; roadmap "not yet specified" (CI/testing).

### Phase 1 — Identity & tenancy
**Exit test:** a student joins from a link, lands view-only; owner approves; role is granted; both see it.

- **1.1 Owner onboarding** — magic-link sign-in → create academy → immediately **active owner**. Seamless (session-12 decision). Spec: owner onboarding, O4.
- **1.2 Invite links** — per-role, owner-managed, create/rotate. The link carries the intended role but grants nothing until approval. Spec: O6; ticket 20.
- **1.3 Student self-join** — preselected academy · social or email+magic-link · minimal fields (name, surname, phone, **email required**) → `member status=pending`, **no role**. Spec: S1, S2; ticket 26.
- **1.4 Uniform approval gate** — pending = view-only for **students and coaches** (browse + provisional book + check-in, no attendee names, no tools). Owner approval → grant role + `status=active`. `enrolledProcedure` guards pending capability. Spec: S3; tickets 20, 23, 14.
- **1.5 Roster** — approve / remove / suspend; **promote a member to co-owner** (never ownerless); pending rows show **visit-count nudge**; removal keeps history + revokes access. Spec: §4 edge rules.
- **1.6 Multi-academy switcher** — `activeOrganizationId` drives RLS scope; switcher shown only if 2+; join 2nd via another link. Spec: ticket 18.
- **1.7 Numeric academy code join (mobile v1)** — every academy gets a plain 6-digit `public_code` (migration `0010`, assigned by the auth hook). Owner shares the number; the student types it in the Expo app → `academy.findByCode` → `membership.joinByCode` → pending **student** (role fixed). Replaces the deep link on mobile v1; invite links + the `join/[token]` route stay for the web + next iteration. Spec: S2, O4; ticket [32](issues/32-academy-code-join.md).

> **Shipped: mobile pass (Mob cells 1.3/1.4/1.6/2.4).** The Expo student app was built as one pass after Phase 2 (the pending student's home is the schedule S4 — Phase 2 — so a mobile-only pass would have landed on an empty home). Delivered slice by slice (M0–M5, see [CHANGELOG](../CHANGELOG.md)): (a) auth-gated student shell + the `post` demo retired (router + table dropped, migration `0009`), (b) magic-link sign-in with a `matops://` deep-link return, (c) `app/join/[token].tsx` (RN twin of the web join flow) + in-app paste + sign-in-first with the token preserved, (d) pending banner (S3), (e) schedule (S4) + read-only class detail (S5, new `class.get`), (f) profile + switcher (S7). **Deep links = custom scheme now** (`matops://join/<code>`); **universal links / AASA + Android assetlinks + EAS submit are deferred to a Phase 5 launch-infra task** (need Apple/Google/EAS accounts + a hosted domain) — ADR [31](issues/31-deep-link-approach.md). Verified by the static gates + code review; a device-test checklist was handed off (no simulator in the build env).

### Phase 2 — Scheduling core
**Exit test:** owner defines a recurring week; concrete classes appear; both clients read the schedule.

- **2.1 Class templates** — recurring weekly definition (days, local start minutes, duration, tz, capacity, discipline). Staff CRUD. Refs: ticket 08.
- **2.2 Materialization** — lazy on template write + **bounded daily Vercel Cron** (LIMIT + time budget, resumable, stale-first); idempotent via `generated_until` + `UNIQUE(template_id, starts_at)`; runs under trusted **service role** outside the tenant seam. Refs: ticket 16.
- **2.3 Class instances** — one-off create (templateId null) + edit/cancel. Edit rules: **notify booked students** on time/instructor change; capacity cut below bookings allowed (soft); **template edits hit future non-cancelled instances only**; delete = soft-delete, keep bookings. `status = scheduled|cancelled` (no "completed"). Refs: spec §4; tickets 19, 08.
- **2.4 Schedule read** — owner web (full) + student mobile (**own academy only**, can't see other academies). Refs: spec S-schedule. **As built (web-first):** owner web read = `class.week` (staff, shipped in 2.3); student read = `class.mine` on `enrolledProcedure` (pending may browse, RLS-scoped to own academy). Student-lens API ready (`isStudentLensMembership` + `academy.listMineStudent`). **Mob** (the Expo student schedule screen) stays `todo` — it lands in the deferred mobile pass, which is now unblocked.

### Phase 3 — Booking & attendance
**Exit test:** student books/cancels (≤3 taps) + checks in via QR; walk-in via public form; staff sees attendance.

- **3.1 Book / cancel** — atomic conditional `UPDATE` increments `booking_count` (capacity guard **dropped** in v1); `UNIQUE(class_id, student_id)` stops double-book; re-book = ON CONFLICT flips cancelled→booked; cancel decrements floored. **Soft capacity:** never blocked; at/over shows red "22/20 · may be busy" + confirm. Refs: tickets 13, 22.
- **3.2 Provisional booking** — pending member's booking tagged "pending approval", **display only**, no spot held. Refs: tickets 22, 23.
- **3.3 Attendance** — staff marks present/absent per class (unified `class_participation`; walk-in = booking `none` + attendance `present`). Refs: ticket 08, spec O-attendance.
- **3.4 QR self check-in** — **one static per-gym QR** → today's class → book-if-needed **+ mark present**, recorded **even if full**. Booking = book only; QR = book + attend. QR with no class → "No class right now" + general lead. Refs: ticket 24; spec §4.
- **3.5 Public drop-in form** — same venue QR, no app → public web form (name, surname, phone, email optional) → `drop_in` **lead + attendance**, no capacity, **consent checkbox**, **dedupe by phone** (one person + visit count), owner follows up. Refs: ticket 25; spec §4.

### Phase 4 — Notifications & polish
**Exit test:** every v1 event fires on the right channel; empty/error states are flawless.

- **4.1 notifications package** — thin `packages/notifications`: Expo Push + Resend email, serverless HTTPS only. Refs: ticket 17.
- **4.2 Events** — class cancelled (**push + email**), class reminder (cron), membership approved (push), class time/instructor change (push). Store push tokens. Refs: ticket 17; spec §4.
- **4.3 States + design pass** — empty/loading/error for every screen; soft-capacity warning UI; ≤3-tap booking verified; NativeWind tokens shared with web. Refs: tickets 09, 11.

### Phase 5 — Launch hardening
**Exit test:** v1 running in production, both apps published.

- **5.1 Reconciliation** — periodic recompute of `booking_count` from participations (safety net for the denormalized count). Refs: ticket 13.
- **5.2 Observability & abuse** — error tracking, structured logs, rate-limit the **public** drop-in endpoint (QR-in-gym is the main anti-spam; add a soft limit). Refs: ticket 25.
- **5.3 Release** — Vercel prod, Neon prod branch + migration run, EAS build + store submit, env promotion.

---

## Parked — next iteration (do NOT build in v1)

Promote to a slice only on purpose (an ADR or a new roadmap row).

- **Capacity hygiene:** hard caps, booking priority, waitlists, no-show tracking, cancel cut-offs. (tickets 22, 13)
- **Home widget:** today's classes + one-tap book/cancel; needs native widget code — **fast-follow**, not launch. (ticket 27)
- **Live UI:** SSE + Postgres LISTEN/NOTIFY via a separate always-on worker. (tickets 04, 15, 17)
- **Deferred domains:** billing/payments, belts/rank, curriculum, announcements/DMs, cross-academy franchise views, i18n, super-admin. (map "out of scope")

Each is additive by design (new schema file + router + pure logic; the tenant seam is untouched) — architecture.md §8.
