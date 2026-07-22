<!-- matops — live implementation plan + scope matrix. Rules for this file live in delivery.md. -->
# matops — Roadmap (live plan + scope matrix)

> **How to use.** Build **top to bottom**. Each slice is vertical (DB → API → client) and ends shippable.
> Flip cells as you go: **`—`** not needed · **`todo`** · **`wip`** · **`done`**. Every flip to `done` must pass the [Definition of Done](delivery.md#4-definition-of-done-the-anti-drift-gate).
> Surfaces: **DB · API · Web · Mob · Sh(ared) · Inf(ra)**. Spec IDs trace up to [spec.md](spec.md); tickets to [map.md](map.md).

**Status:** **Phases 2–3 complete + Expo student app shipped (mobile pass) + slice 1.7 (academy-code join).** All static gates are green — `lint` (13/13), `typecheck` (15/15), `test` (117 tests). Phase 3 (booking, attendance, QR check-in, public drop-in) is built and its migrations (`0011`–`0013`) are applied + verified on Neon. A tenant-seam hardening pass (ADR 33) then made the RLS seam fail-closed and fixed an enrolled-tier fail-open. Scheduling core is built: recurring class templates (O3), DST-aware materialization (lazy on save + a bounded daily Vercel Cron), one-off classes, edit/cancel with future-instance propagation, and the schedule reads (owner web `class.week`; student `class.mine`). The **Expo student app** shipped in the mobile pass (join → pending → schedule → detail → profile/switcher, Mob cells 1.3/1.4/1.6/2.4); mobile join is a 6-digit academy-code lookup (slice 1.7, ADR 32). **Phase 4 (notifications & polish) is now built** — a pure-transport `packages/notifications` (Expo Push + Resend), the three event sends (cancel/change/approved) wired into the mutations, the class-reminder sweep + `/api/cron/remind` route (its frequent cron schedule deferred to Phase 5); push tokens live outside the tenant seam (migration `0014`, ADR **34**); and (slice 4.3) a shared **states system** — skeleton / empty-as-invitation / error-with-retry on both clients — plus the thin S7 push toggle. **Not built yet:** Phase 5 (launch hardening incl. universal/App links + booking-count reconciliation + the reminder cron schedule), and the one flagged follow-up — rendering the venue check-in URL as a scannable QR image (needs a QR lib; the link itself is live in O6). All of Phase 3 (book/cancel, provisional tier, attendance, QR check-in, public drop-in) is in. **A v1.1 "make-it-usable" UX pass then restructured both clients** on the same feature set (planned as the `.scratch/usable-v1/` wayfinder map, all tickets resolved; ADRs 37 brand + 38 shells): a fresh **matops brand** (violet + basketweave mark, shared tokens), a **web app shell** (sidebar + mobile bottom-tabs, 5 routed screens, owner/instructor role split, new O1 dashboard, venue QR poster), **academy rename** (name = mutable label; code = immutable identifier), and a **mobile tab bar** (Schedule/Check-in/Profile) with the screens ported to explicit RN styles + brand. Static gates green (`next build` all routes); device visual check pending. See architecture.md §0.

> **Verified live on Neon.**
> - **Phase 1 exit test** — sign in (magic link) → **Start a gym** → active **owner** (RLS scope set) → create/rotate an invite link → a second user joins **pending, holding no academy role** → owner **approves** → role granted + active. "Never ownerless" blocks removing the sole owner; a student is `FORBIDDEN` from owner-only routes.
> - **Phase 2** — a Mon/Wed/Fri 18:00 Europe/Kyiv template **materialized 18 classes** over 6 weeks at 15:00 UTC (correct DST offset); re-run inserted **0** (idempotent); cursor advanced to now+42d. Template edits propagate: a content edit kept the rows + retitled; a timing edit regenerated Mon/Wed → Tue/Thu; one-off create + cancel worked.
> - Migrations `0000`–`0010` applied; RLS leak tests (probe + `class_template` + `class`) green.

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
| 1.8 | Social login — Google (web; mobile deferred) | — | done | done | — | done | wip |
| **2** | **Scheduling core** | | | | | | |
| 2.1 | Class templates CRUD (recurring) | done | done | done | — | done | — |
| 2.2 | Materialization (lazy + bounded cron) | done | done | — | — | — | done |
| 2.3 | Class instances (one-off + edit/cancel rules) | done | done | done | — | done | — |
| 2.4 | Schedule read (owner web + student mobile) | — | done | done | done | done | — |
| **3** | **Booking & attendance** | | | | | | |
| 3.1 | Book / cancel (atomic write, soft capacity) | done | done | — | done | done | — |
| 3.2 | Provisional booking for pending (display tag) | — | done | done | done | done | — |
| 3.3 | Attendance marking (staff) | done | done | done | — | done | — |
| 3.4 | QR self check-in (book + attend) | done | done | — | done | done | — |
| 3.5 | Public drop-in / lead form (consent, dedupe) | done | done | done | — | done | done |
| **4** | **Notifications & polish** | | | | | | |
| 4.1 | `notifications` package (Expo Push + Resend) | done | done | — | done | done | done |
| 4.2 | Events (cancel, reminder, approval, class change) | done | done | — | done | done | done¹ |
| 4.3 | Empty/error/soft-capacity states, design pass | — | — | done | done | done | — |

¹ Reminder sweep + `/api/cron/remind` route ship in 4.2; the **frequent cron schedule** in `vercel.json` (needs a sub-daily cron / Vercel Pro) is deferred to Phase 5 (ADR 34).
| **5** | **Launch hardening** | | | | | | |
| 5.1 | `booking_count` reconciliation cron | — | todo | — | — | — | todo |
| 5.2 | Observability + errors + rate-limit public routes | — | todo | todo | todo | — | todo |
| 5.3 | Production release (Vercel + Neon prod + EAS submit) | todo | — | todo | todo | — | todo |
| **v1.2** | **Personal & Insight** *(no new domain, no migration, no cron)* | | | | | | |
| A.0 | `stats.ts` pure engine + tests (ADR 39) | — | — | — | — | done | — |
| B.1 | My Training stats (student, `stats.me`) | — | done | — | done | — | — |
| B.2 | Training tab + next-class card (`booking.mine`) | — | done | — | done | — | — |
| B.3 | Edit profile (name / phone) | — | done | — | done | done | — |
| C.1 | Gym insights + "who's drifting" (owner web) | — | done | done | — | — | — |
| C.2 | Tabbed member detail (attendance history) | — | done | done | — | — | — |

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
- **1.8 Social login — Google** — the "social login" half of S1. One server switch (`socialProviders.google`, fed by optional `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`) enables **Continue with Google** on both clients + **account linking** (`trustedProviders: ["google"]`, one identity per email). No migration (reuses the `account` table); no change to tenancy — a Google user has no academy membership, so it lands on the same join gate. Missing creds → provider not registered (magic-link only). **Status:** **Web = done** (server-side verified). **Mob = deferred (2026-07-21)** — mobile ships **magic-link only**; the Google button was removed from the Expo sign-in. Source analysis showed the server side is fine (the deep link does carry `?cookie=`); the break is the iOS `ASWebAuthenticationSession` return, whose reliable fix is the native idToken flow (iOS OAuth client + native module + rebuild) — out of scope now, revisit with Phase-5 native work. **Inf = wip** — dev redirect URI registered; prod URI + the full diagnosis are in ADR 35 + `docs/mobile-google-login-handoff.md`. Spec: S1; ADR [35](issues/35-social-login-google.md), [36](issues/36-mobile-ui-explicit-styles.md) (mobile UI + `dev:ios` fix).

> **Shipped: mobile pass (Mob cells 1.3/1.4/1.6/2.4).** The Expo student app was built as one pass after Phase 2 (the pending student's home is the schedule S4 — Phase 2 — so a mobile-only pass would have landed on an empty home). Delivered slice by slice (M0–M5, see [CHANGELOG](../CHANGELOG.md)): (a) auth-gated student shell + the `post` demo retired (router + table dropped, migration `0009`), (b) magic-link sign-in with a `matops://` deep-link return, (c) `app/join/[token].tsx` (RN twin of the web join flow) + in-app paste + sign-in-first with the token preserved, (d) pending banner (S3), (e) schedule (S4) + read-only class detail (S5, new `class.get`), (f) profile + switcher (S7). **Deep links = custom scheme now** (`matops://join/<code>`); **universal links / AASA + Android assetlinks + EAS submit are deferred to a Phase 5 launch-infra task** (need Apple/Google/EAS accounts + a hosted domain) — ADR [31](issues/31-deep-link-approach.md). Verified by the static gates + code review; device-only checks (incl. the slice-1.7 code-join flow) live in the [mobile device-test checklist](mobile-device-test.md) (no simulator in the build env).

### Phase 2 — Scheduling core
**Exit test:** owner defines a recurring week; concrete classes appear; both clients read the schedule.

- **2.1 Class templates** — recurring weekly definition (days, local start minutes, duration, tz, capacity, discipline). Staff CRUD. Refs: ticket 08.
- **2.2 Materialization** — lazy on template write + **bounded daily Vercel Cron** (LIMIT + time budget, resumable, stale-first); idempotent via `generated_until` + `UNIQUE(template_id, starts_at)`; runs under trusted **service role** outside the tenant seam. Refs: ticket 16.
- **2.3 Class instances** — one-off create (templateId null) + edit/cancel. Edit rules: **notify booked students** on time/instructor change; capacity cut below bookings allowed (soft); **template edits hit future non-cancelled instances only**; delete = soft-delete, keep bookings. `status = scheduled|cancelled` (no "completed"). Refs: spec §4; tickets 19, 08.
- **2.4 Schedule read** — owner web (full) + student mobile (**own academy only**, can't see other academies). Refs: spec S-schedule. **As built (web-first):** owner web read = `class.week` (staff, shipped in 2.3); student read = `class.mine` on `enrolledProcedure` (pending may browse, RLS-scoped to own academy). Student-lens API ready (`isStudentLensMembership` + `academy.listMineStudent`). **Mob** (the Expo student schedule screen) stays `todo` — it lands in the deferred mobile pass, which is now unblocked.

### Phase 3 — Booking & attendance
**Exit test:** student books/cancels (≤3 taps) + checks in via QR; walk-in via public form; staff sees attendance.

- **3.1 Book / cancel** — **DONE.** New `class_participation` table (migration `0011` + RLS) + `booking` router (`book`/`cancel` on `enrolledProcedure`). Atomic conditional `UPDATE` increments `booking_count` (capacity guard **dropped** in v1); `UNIQUE(class_id, student_id)` stops double-book; re-book = ON CONFLICT flips cancelled→booked; cancel decrements floored. **Confirmed-only count:** an approved member's booking counts; a **pending** member's is `provisional` — recorded + tagged "pending approval", never counted. **Soft capacity:** never blocked; at/over shows red "22/20 · may be busy" + confirm (mobile S5). `class.get`/`class.mine` now return the caller's `myBooking`. Pure rules `bookingTier`/`canBook`/`capacityDisplay` in `@matops/domain`. Refs: tickets 13, 22.
- **3.2 Provisional booking** — **DONE.** The provisional *tier* + the student-side "pending approval" tag shipped with 3.1; 3.2 added the **owner-side** view: `class.week` returns a `pendingCount` (provisional-only subquery) and the web schedule shows "N/cap · +M pending". Refs: tickets 22, 23.
- **3.3 Attendance** — **DONE.** Migration `0012` adds the attendance axis to `class_participation` (`attendance_status` + `attended_at`/`marked_by`) and a `none` booking value for walk-ins. New `attendance` router (`staffProcedure`: `roster`/`mark`/`addWalkIn`/`members`) + the O5 web screen (pick a class in the 14-day backfill window → mark present/absent → add a walk-in). Walk-in = booking `none` + attendance `present`, never counted. Roster `visitCount` ("attended N×") now real. Pure rules `canMarkAttendance`/`attendanceCounts`. Refs: ticket 08, spec O5.
- **3.4 QR self check-in** — **DONE.** New `checkin` router (`enrolledProcedure`: `today`/`checkIn`). Check-in = **book + attend** in one (soft cap — present even if full; pending → provisional). `resolveCheckInClass` (pure, server-side) picks the current/next class; mobile S8 `checkin` screen confirms + checks in. **No camera in v1** (D3): uses the active academy; the physical QR routes no-app visitors to 3.5. Refs: ticket 24; spec S8/§4.
- **3.5 Public drop-in form** — **DONE.** New `drop_in` table (migration `0013` + owner-read RLS). The `dropIn` router's `submit` + `academyInfo` are the **first public (unauthenticated) procedures** — an enumerated tenant-seam exception (writes on the trusted base connection). Public web page `/checkin/[academyId]` (name, surname, phone, email optional, **required consent**), **dedupe by phone** (one lead + visit count), resolves today's class server-side (else general lead). Owner O4 leads section + O6 venue-link poster. Refs: ticket 25; spec §4. *(Follow-up: render the O6 link as a scannable QR image — needs a QR lib.)*

### Phase 4 — Notifications & polish
**Exit test:** every v1 event fires on the right channel; empty/error states are flawless.

- **4.1 notifications package** — **DONE.** Thin `packages/notifications` = pure transport (`sendPush` batched Expo Push + `sendEmail` Resend, serverless HTTPS, never throws, no DB dep). Message text = pure builders in `@matops/domain/notify.ts` (+13 tests); resolution lives in the API layer (ADR **34**). Push tokens stored **outside the tenant seam** — `push_token` (migration `0014`, keyed by `user.id`, no `academy_id`/RLS); `pushToken.register`/`unregister` on `protectedProcedure`; mobile registers on sign-in via `expo-notifications` (`utils/push.ts` + `push-sync.tsx`). Refs: tickets 17, 34.
- **4.2 Events** — **DONE (bar the reminder schedule).** The three `TODO(phase 4)` hooks are wired: class cancelled (**push + email**), class time/instructor change (**push + email**), membership approved (**push**) — via `packages/api/notify.ts`, awaited but error-swallowed so a send never fails the mutation. Class-reminder **sweep** (`claimDueReminderClasses`, atomic `reminder_sent_at` claim in `0014`) + `runReminderSweep` + the protected `/api/cron/remind` route ship now; the **frequent cron schedule** is a Phase 5 task (ADR 34). Mobile: tap-to-navigate handler. Refs: tickets 17, 34; spec §4.
- **4.3 States + design pass** — **DONE.** A shared **state system** on both clients — `SkeletonRows` / `EmptyState` / `ErrorState` (web `_components/states.tsx`; mobile `components/ui.tsx`): loading skeletons, empties written as **invitations** (title + what-to-do), and errors with a **retry** that never masquerade as "no data". Applied across every data screen (web home/schedule/roster/attendance/templates; mobile schedule/class/check-in) — fixed two real bugs where a fetch error fell through to onboarding (web) / "no classes" (mobile). Soft-capacity red + ≤3-tap booking verified (already built in S5). Thin S7 **Push notifications** toggle on mobile profile (registers/unregisters this device's token — no server pref). NativeWind/Tailwind tokens already shared (ADR 11). Refs: tickets 09, 11.

### Phase 5 — Launch hardening
**Exit test:** v1 running in production, both apps published.

- **5.1 Reconciliation** — periodic recompute of `booking_count` from participations (safety net for the denormalized count). Refs: ticket 13.
- **5.2 Observability & abuse** — error tracking, structured logs, rate-limit the **public** drop-in endpoint (QR-in-gym is the main anti-spam; add a soft limit). Refs: ticket 25.
- **5.x Reminder cron schedule** — add the frequent `crons` entry for `/api/cron/remind` to `vercel.json` (sweep + route already built in 4.2). Needs a sub-daily cron (Vercel Pro; Hobby caps crons at 1/day). Refs: ADR 34, ticket 17.
- **5.3 Release** — Vercel prod, Neon prod branch + migration run, EAS build + store submit, env promotion.

### v1.2 — Personal & Insight
**Exit test:** the student sees their own training (total/streak/next class); the owner sees gym activity + who's drifting; both read from attendance data already stored. Plan: `.scratch/v1.2/plan.md`; decision: ADR 39. **No migration, no cron.**

- **A.0 stats engine** — **DONE.** `packages/domain/src/stats.ts` (pure, 20 tests): `trainingStats`, `classifyDrift` (+ `DRIFT_THRESHOLDS`), `gymInsights`, `splitMyClasses`, `nextClass`. Sessions = `present` participations; per-academy; academy-zone Sunday-start weeks. Refs: ADR 39.
- **B.1 My Training stats** — **DONE.** `stats.me` on `enrolledProcedure` (present participations join `class` → `trainingStats`; academy zone resolved from templates, `academy-tz.ts`); mobile `MyTrainingCard` (total · month · streak · favorite · days since last). Refs: spec S7; ADR 39.
- **B.2 Training tab + next-class card** — **DONE.** `booking.mine` (caller's participations join `class`) split client-side by `splitMyClasses`/`nextClass` (`@matops/domain` added to expo); new `(tabs)/training.tsx` = next-class card + stats + Upcoming (cancel)/Past; tabs are now Schedule · Training · Check-in · Profile. Refs: spec S6.
- **B.3 Edit profile** — **DONE.** `UpdateProfileSchema` + `account.updateProfile` on `protectedProcedure` → `updateUserProfile`; email read-only; mobile profile Name/Phone editable, session refetched with `disableCookieCache` after save. Refs: spec S7.
- **C.1 Gym insights + drifting** — **DONE.** `stats.gym` (staff, 30-day window → `gymInsights` + new-members-this-month) + `stats.drifting` (owner, `max(startsAt)` per student → `classifyDrift`, ≥1-session members only, stalest first); dashboard Insights block + "who's drifting" widget linking to `/roster?member=`. Refs: spec O1; ADR 39.
- **C.2 Tabbed member detail** — **DONE.** `membership.memberHistory` (owner; member's present participations + `trainingStats`/`classifyDrift`); roster row expands to Overview · Attendance tabs (paginated), deep-linkable from C.1. Fulfils spec O4 "attendance history". Refs: spec O4.

---

## Parked — next iteration (do NOT build in v1)

Promote to a slice only on purpose (an ADR or a new roadmap row).

- **Capacity hygiene:** hard caps, booking priority, waitlists, no-show tracking, cancel cut-offs. (tickets 22, 13)
- **Home widget:** today's classes + one-tap book/cancel; needs native widget code — **fast-follow**, not launch. (ticket 27)
- **Live UI:** SSE + Postgres LISTEN/NOTIFY via a separate always-on worker. (tickets 04, 15, 17)
- **Deferred domains:** billing/payments, belts/rank, curriculum, announcements/DMs, cross-academy franchise views, i18n, super-admin. (map "out of scope")

Each is additive by design (new schema file + router + pure logic; the tenant seam is untouched) — architecture.md §8.
