<!-- matops — live implementation plan + scope matrix. Rules for this file live in delivery.md. -->

# matops — Roadmap (live plan + scope matrix)

> **How to use.** Build **top to bottom**. Each slice is vertical (DB → API → client) and ends shippable.
> Flip cells as you go: **`—`** not needed · **`todo`** · **`wip`** · **`done`**. Every flip to `done` must pass the [Definition of Done](delivery.md#4-definition-of-done-the-anti-drift-gate).
> Surfaces: **DB · API · Web · Mob · Sh(ared) · Inf(ra)**. Spec IDs trace up to [spec.md](spec.md); tickets to [map.md](map.md).

**Status:** **Phases 0-4 complete, plus every product wave through v3.2, and the v3.3 web refactor.** Static gates green: `lint` 15/15 · `typecheck` 17/17 · `pnpm test` **456 green** (domain 275 · db 82 · api 72 · validators 24 · notifications 3). **`next build` was last run for v3.9** — v2.5 to v3.1 are lint + typecheck only, and the per-wave verify lines below say so. Tests live in three homes now — `packages/db/test` (PGlite RLS), `packages/domain/test` (pure rules) and, since ADR [60](issues/60-backend-review-fixes.md), `packages/api/test` (real routers + real middleware + real SQL over PGlite).

What is built: the identity join loop (Phase 1), the scheduling core (Phase 2), booking & attendance (Phase 3), notifications (Phase 4 — engine, plus a **daily dues sweep** since ADR [75](issues/75-daily-cron-on-github-actions.md)), the Expo student app, and the waves below — v1.1 UX, v1.2 stats, v1.3 payments, v1.4 rank & notes, v1.5 PWA, v1.7 mobile design, v1.8 mobile IA, v1.9 referrals, v2.0/v2.1 mobile waves, v2.2 student web funnel, v2.3/v2.4 review fixes, v2.5 coach workload, v2.6 the Settings split, v2.7 invite roles + the coach queue, v2.8 the web Profile, v2.9 academy time zone / address / delete, v2.10 referrals owner-only, v3.0 in-app QR scan, v3.1 the pinned map link, v3.2 the student web at parity, v3.3 the web shell seams (refactor, ADR [74](issues/74-web-shell-seams.md)), v3.4 the member CSV export, v3.5 the daily cron on GitHub Actions (ADR [75](issues/75-daily-cron-on-github-actions.md)), v3.6 the pilot blockers (ADR [76](issues/76-pilot-blockers.md)), v3.7 the notification center (ADR [77](issues/77-notification-center.md)), v3.9 the loading states (ADR [80](issues/80-loading-states.md)).

**Not built yet:** **Phase 5** launch hardening (universal/App links — the app still uses a custom scheme; booking-count reconciliation; a **shared-store** rate limiter — v3.6 shipped an in-process one, ADR [76](issues/76-pilot-blockers.md), which leaks across a Fluid-compute scale-out), **any scheduler beyond the daily dues tick** (v3.5 put `/api/cron/remind` on a **daily** GitHub Actions run at 09:00 Lisbon; `/api/cron/materialize` stays dormant and the **class** reminder sweep stays switched off, both on purpose — ADR 75), and **v1.3 R.2** the native home-screen widget (scaffolded, guide in [home-widget-implementation.md](home-widget-implementation.md)).

**Open operational items:** **`AUTH_SECRET` needs rotating** on the next deploy (the old auth error hook logged it — ADR 60); the mobile **Google browser→app session hand-off** still does not land ([mobile-google-login-handoff.md](mobile-google-login-handoff.md)); and every mobile wave since v1.8 is **static-gates-green only** — no simulator in this environment, so the checks in [mobile-device-test.md](mobile-device-test.md) are outstanding.

**Before a beta with an external customer:** the web-only readiness gaps (no deployment, no transactional email, no error boundary, no rate limiting, no privacy page) are collected in [beta-readiness.md](beta-readiness.md).

> **Verified live on Neon.**
>
> - **Phase 1 exit test** — sign in (magic link) → **Start a gym** → active **owner** (RLS scope set) → create/rotate an invite link → a second user joins **pending, holding no academy role** → owner **approves** → role granted + active. "Never ownerless" blocks removing the sole owner; a student is `FORBIDDEN` from owner-only routes.
> - **Phase 2** — a Mon/Wed/Fri 18:00 Europe/Kyiv template **materialized 18 classes** over 6 weeks at 15:00 UTC (correct DST offset); re-run inserted **0** (idempotent); cursor advanced to now+42d. Template edits propagate: a content edit kept the rows + retitled; a timing edit regenerated Mon/Wed → Tue/Thu; one-off create + cancel worked.
> - Migrations `0000`–`0018` applied (19 rows in `drizzle.__drizzle_migrations`, checked 2026-08-19 — through the v1.9 referral schema); RLS leak tests (probe + `class_template` + `class` + `drop_in` + payments + rank/notes + **referrals**) green. `0017` verified live: `member_rank`/`rank_promotion`/`member_note` all have RLS enabled + their `*_isolation` policy + the standard `matops_app` grant. **`0019` (member index) and `0020` (identity-table grants) are not applied yet.**

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

One row per slice. This is the single answer to _"what's left, on which surface?"_

| #     | Slice                                                                  | DB   | API  | Web  | Mob  | Sh   | Inf   |
| ----- | ---------------------------------------------------------------------- | ---- | ---- | ---- | ---- | ---- | ----- |
| **0** | **Foundations**                                                        |      |      |      |      |      |       |
| 0.1   | Monorepo scaffold (create-t3-turbo)                                    | —    | done | done | done | done | done  |
| 0.2   | DB package: Drizzle + Neon + migrate + seed                            | done | —    | —    | —    | —    | done  |
| 0.3   | Tenant seam: RLS role + per-req tx + `scopedDb` + leak test            | done | done | —    | —    | —    | done  |
| 0.4   | tRPC base + procedure tiers                                            | —    | done | —    | —    | done | —     |
| 0.5   | Better Auth (core + org + magic-link)                                  | done | done | done | done | done | —     |
| 0.6   | CI/CD + env + preview builds                                           | —    | —    | —    | —    | —    | done  |
| **1** | **Identity & tenancy**                                                 |      |      |      |      |      |       |
| 1.1   | Owner onboarding (create academy, magic link)                          | done | done | done | —    | done | —     |
| 1.2   | Invite links (per-role, create/rotate)                                 | done | done | done | —    | done | —     |
| 1.3   | Student self-join → pending (min fields, email req.)                   | done | done | —    | done | done | —     |
| 1.4   | Uniform approval gate + `enrolledProcedure`                            | —    | done | done | done | done | —     |
| 1.5   | Members (approve/remove/suspend, promote co-owner)                     | done | done | done | —    | —    | —     |
| 1.6   | Multi-academy switcher                                                 | —    | done | done | done | —    | —     |
| 1.7   | Numeric academy code join (mobile v1)                                  | done | done | done | done | done | —     |
| 1.8   | Social login — Google (web; mobile deferred)                           | —    | done | done | —    | done | wip   |
| **2** | **Scheduling core**                                                    |      |      |      |      |      |       |
| 2.1   | Class templates CRUD (recurring)                                       | done | done | done | —    | done | —     |
| 2.2   | Materialization (lazy on save + heal on read; **no cron** — ADR 46/75) | done | done | —    | —    | —    | —     |
| 2.3   | Class instances (one-off + edit/cancel rules)                          | done | done | done | —    | done | —     |
| 2.4   | Schedule read (owner web + student mobile)                             | —    | done | done | done | done | —     |
| **3** | **Booking & attendance**                                               |      |      |      |      |      |       |
| 3.1   | Book / cancel (atomic write, soft capacity)                            | done | done | —    | done | done | —     |
| 3.2   | Provisional booking for pending (display tag)                          | —    | done | done | done | done | —     |
| 3.3   | Attendance marking (staff)                                             | done | done | done | —    | done | —     |
| 3.4   | QR self check-in (book + attend)                                       | done | done | —    | done | done | —     |
| 3.5   | Public drop-in / lead form (consent, dedupe)                           | done | done | done | —    | done | done  |
| **4** | **Notifications & polish**                                             |      |      |      |      |      |       |
| 4.1   | `notifications` package (Expo Push + Resend)                           | done | done | —    | done | done | done  |
| 4.2   | Events (cancel, reminder, approval, class change)                      | done | done | —    | done | done | done¹ |
| 4.3   | Empty/error/soft-capacity states, design pass                          | —    | —    | done | done | done | —     |

¹ Reminder sweep + `/api/cron/remind` route ship in 4.2. **No `vercel.json` cron** (ADR 46), but since v3.5 a **daily GitHub Actions** tick drives the route (ADR 75): **dues** reminders fire, the **class** sweep is switched off (`leadMinutes: 0`) because the phone schedules those locally (ADR 54).
| **5** | **Launch hardening** | | | | | | |
| 5.1 | `booking_count` reconciliation cron | — | todo | — | — | — | todo |
| 5.2 | Observability + errors + rate-limit public routes | — | wip² | wip² | wip² | — | wip² |
| 5.3 | Production release (Vercel + Neon prod + EAS submit) | todo | — | todo | todo | — | todo |

² Sentry covers the **errors** half on the **web** only (ADR [72](issues/72-sentry-error-tracking.md)): all three Next runtimes plus source-map upload. **Rate limiting is untouched**, and the Expo app reports nothing.
| **v1.2** | **Personal & Insight** _(no new domain, no migration, no cron)_ | | | | | | |
| A.0 | `stats.ts` pure engine + tests (ADR 39) | — | — | — | — | done | — |
| B.1 | My Training stats (student, `stats.me`) | — | done | — | done | — | — |
| B.2 | Training tab + next-class card (`booking.mine`) | — | done | — | done | — | — |
| B.3 | Edit profile (name / phone) | — | done | — | done | done | — |
| C.1 | Gym insights + "who's drifting" (owner web) | — | done | done | — | — | — |
| C.2 | Tabbed member detail (attendance history) | — | done | done | — | — | — |
| **v1.3** | **Frictionless & Pay** _(payments = manual bank transfer; ADR 40)_ | | | | | | |
| F.1 | Today / next-class one-tap home card | — | — | — | done | — | — |
| F.2 | Mark-all-present (bulk attendance) | — | done | done | — | done | — |
| F.3 | Scannable venue QR — reconcile docs (already built) | — | — | done | — | — | — |
| P.1 | Dues + payment-claim schema & domain (ADR 40) | done | — | — | — | done | — |
| P.2 | Owner: paid / overdue status on member list (O7) | — | done | done | — | — | — |
| P.3 | Student pay: requisites + "I paid" + confirm (S9, O7) | — | done | done | done | done | — |
| R.1 | Payment reminders (**scheduled daily** since v3.5 — ADR 75) | done | done | — | — | done | done |
| R.2 | Home-screen widget (S10, native) | — | — | — | todo | — | — |
| **v1.4** | **Rank & Notes** _(un-parks belts/rank; ADR 41)_ | | | | | | |
| G.1 | Rank + notes schema & `rank.ts` engine (ADR 41) | done | — | — | — | done | — |
| G.2 | Owner: set + promote rank per discipline, history (O4) | — | done | done | — | done | — |
| G.3 | Student: view ranks + promotion timeline (S7) | — | done | — | done | — | — |
| G.4 | Staff-private notes on a member (O4) | — | done | done | — | — | — |
| **v1.8** | **Mobile ease-of-use** _(IA + core-flow friction; no domain / migration / back-end; ADR 45)_ | | | | | | |
| M.1 | Inline booking on schedule row (shared `useBookClass`) | — | — | — | done | — | — |
| M.2 | De-dupe class tabs (Training → My classes) | — | — | — | done | — | — |
| M.3 | Overdue warning header (S11) | — | — | — | done | — | — |
| M.4 | QR walk-in = book+attend; remove Check-in tab (S8) | — | — | done | done | — | — |
| M.5 | Split Settings from Profile (S12) | — | — | — | done | — | — |
| M.6 | Booking toast + sticky S5 CTA | — | — | — | done | — | — |
| M.7 | Dark-theme warmth (mobile-only override) | — | — | — | done² | — | — |
| **v3.0** | **In-app QR scan** _(Scan tab + OS scanner; no migration, no router change; ADR 70)_ | | | | | | |
| X.1 | Scan tab (tabs 3 → 4, S8) | — | — | — | done | — | — |
| X.2 | OS scanner via `expo-camera` `launchScanner` | — | — | — | done² | — | — |
| X.3 | `parseCheckInLink` pure parser + tests | — | — | — | — | done | — |
| **v2.0** | **Mobile Wave A** _(student app: kept promises + freshness; ADR 54)_ | | | | | | |
| N.1 | Local class reminders on book/cancel (S12) | — | — | — | done³ | — | — |
| N.2 | Foreground refetch + pull to refresh on the tab screens | — | — | — | done³ | — | — |
| N.3 | Rolling week window on the schedule (S4) | — | — | — | done | — | — |
| N.4 | Instructor name on the schedule row (S4) | — | done | — | done | — | — |
| N.5 | Who's in the class, privacy-gated (S5) | — | done | — | done | done | — |
| **v1.9** | **Internal Referrals** _(staff attribution + reporting; ADR 52)_ | | | | | | |
| J.1 | Referral schema, RLS, audit + pure rules | done | — | — | — | done | — |
| J.2 | Staff dashboard/assign + owner correct/history router | — | done | — | — | done | — |
| J.3 | Responsive O9 referrals ledger + role-aware navigation | — | — | done | — | — | — |
| J.4 | Referral-rich demo seed + marker-safe cleanup | done | — | — | — | — | — |
| J.5 | Referrer-first O9 rewrite, one write dialog (ADR 56) | — | — | done | — | — | — |
| **v2.2** | **Student onboarding funnel** _(join at the gym, land somewhere real; ADR 57)_ | | | | | | |
| E.1 | Join-link QR + shared printable poster (O6) | — | — | done | — | — | — |
| E.2 | One-step join form, email hop last (S2) | — | done | done | — | — | — |
| E.3 | Student web: schedule + book / cancel (S4, S5) | — | — | done | — | — | — |
| E.4 | Student install-to-home-screen card (O8, S4) | — | — | done | — | — | — |
| **v2.3** | **Backend review fixes** _(API test seam + review findings; ADR 60)_ | | | | | | |
| Q.1 | `packages/api` test seam, one `ctx.baseDb` handle | — | done | — | — | done | — |
| Q.2 | Critical fixes: secret in logs, hard-delete, email fan-out | — | done | — | — | — | done |
| Q.3 | Defect sweep + migrations `0019` / `0020` | done | done | — | — | — | — |
| Q.4 | Dead-payload deletion, one `requireMember`, domain unions | — | done | done | — | done | — |
| **v2.4** | **Frontend review fixes** _(no new feature; ADR 59)_ | | | | | | |
| V.1 | Join link prefills, never joins (S2, ADR 59) | — | done | done | — | — | — |
| V.2 | Dues form matches the plan by id, not by name (O7) | — | done | done | — | — | — |
| V.3 | Keyed class roster + one class invalidation per close (O5) | — | — | done | — | — | — |
| V.4 | Frontend copies of domain rules replaced by imports | — | — | done | done | done | — |
| V.5 | Mobile cache cleared on sign-out / verify; shared cancel | — | — | — | done | — | — |
| V.6 | Addressable member tabs, grid now-line, a11y on Tabs / Stat | — | — | done | — | — | — |
| **v2.5** | **Coach workload & coverage** _(O10; attribution first, then the numbers; ADR 62)_ | | | | | | |
| K.0 | `coach.ts` pure engine + `local-date.ts` extraction + tests | — | — | — | — | done | — |
| K.1 | Coach picker on template + one-off forms, `requireInstructor` | — | done | done | — | done | — |
| K.2 | `class.setInstructor` cover night + no-notify-for-past guard | — | done | done | — | done | — |
| K.3 | `stats.coaches` / `stats.coach` + router tests | — | done | — | — | done | — |
| K.4 | O10 Coaches screen + staff nav item | — | — | done | — | — | — |
| K.5 | O1 unmarked-classes nudge | — | — | — | — | — | — |
| **v2.6** | **Settings splits by job** _(web IA only; ADR 63)_ | | | | | | |
| L.1 | Staff + instructor link → Coaches; student link → Members; poster → leads tab; bank details → Payments tab | — | — | done | — | — | — |
| **v2.7** | **The instructor link grants the instructor role** _(O4 / O6 / O10; ADR 64)_ | | | | | | |
| M.1 | Newest link wins on a pending row; active row untouched; honest join toast | done | done | done | — | — | — |
| M.2 | `isPendingCoach` splits the Members queue, the Coaches queue and the two O1 counts | — | — | done | — | done | — |
| M.3 | `membership.demote` → `setRole` (both directions, never `owner`) + member-detail role picker | — | done | done | — | — | — |
| **v2.8** | **A web Profile** _(O11; sidebar-footer route, ADR 67)_ | | | | | | |
| T.1 | `/profile` screen: name + phone edit, academy standing, appearance, sign out | — | — | done | — | — | — |
| T.2 | Sidebar footer + mobile top-bar avatar link; `academy.current` gains `joinedAt` | done | done | done | — | — | — |
| **v2.9** | **Academy time zone, address, and delete** _(O6 / O3 / S2 / S7; ADR 68)_ | | | | | | |
| N.0 | `academy-settings.ts` pure rules (zone validity, drift, map URL, delete phrase) + tests | — | — | — | — | done | — |
| N.1 | Migration `0021` (`time_zone` / `address` / `deleted_at` on `organization`) + settings helpers | done | — | — | — | — | done |
| N.2 | `academy.settings` / `updateSettings`; `academyTimeZone` reads the setting first | — | done | done | — | — | — |
| N.3 | Template form inherits the academy zone, offers a one-click move | — | — | done | — | — | — |
| N.4 | Address on mobile Profile + both join confirm steps | — | done | done | done | — | — |
| N.5 | `academy.remove` soft delete + typed phrase; seven soft-delete filters + router tests | done | done | done | — | done | — |
| N.6 | `ownerIdentityProcedure` tier (no tenant tx) + `exec` on the three singleton readers | — | done | — | — | — | — |
| **v3.3** | **Web shell seams** _(refactor; ADR 74)_ | | | | | | |
| Q.1 | `useAcademy()` context: 13 screens stop refetching and re-branching `academy.current` | — | — | done | — | — | — |
| Q.2 | `use-booking.ts`: one book/cancel pair, one invalidation set, for all three screens | — | — | done | — | — | — |
| Q.3 | `routes.ts` access table: the sidebar and the shell read the same rule; `NoAccessState` | — | — | done | — | done | — |
| Q.4 | `~/lib/format.ts`: 24 scattered `Intl.DateTimeFormat` become 12 named ones | — | — | done | — | — | — |
| Q.5 | `dayKey` / `groupByDay` / `PAYMENT_STATUS_LABEL` move to `@matops/domain` + tests | — | — | done | done | done | — |
| **v3.7** | **The notification center** _(S13 / O12 / §4; ADR 77 — migrations `0023`, `0024`)_ | | | | | | |
| T.1 | Migration `0023`: `notification`, RLS policy, `insertNotifications` | done | — | — | — | done | — |
| T.2 | `deliver()` writes the inbox row first; `notification` router (`list` / `unreadCount` / `markAllRead`) | done | done | — | — | — | — |
| T.3 | `/notifications` screen: feed by day, unread dots, mark-read on open, nav badge | — | — | done | — | — | — |
| T.4 | `announce` + `audienceCounts` (owner); compose box with the audience picker | — | done | done | — | done | — |
| T.5 | _(dropped in v3.8: no gym message is emailed, so there is no email preference)_ | — | — | — | — | — | — |
| T.6 | The feed on the phone: a header bell with a red dot, `notifications` pushed over the tabs | — | — | done | — | — | — |
| T.7 | One `AppHeader` on the phone, matching the web mobile bar; the web's bell + settings glyphs replace the emoji | — | — | done | — | — | — |
| **v3.9** | **Loading states** _(§3 states line; ADR 80 — both clients, no migration, no procedure)_ | | | | | | |
| L.1 | `mat-loader.tsx`: the basketweave mark weaving itself, with a 180ms anti-flash delay | — | — | done | — | — | — |
| L.2 | `skeletons.tsx`: one vocabulary cut from the real shapes, replacing `SkeletonRows` at 32 call sites | — | — | done | — | — | — |
| L.3 | Twelve route `loading.tsx` files, each rendering the same skeleton its screen renders | — | — | done | — | — | — |
| L.4 | The boot and the academy gate draw the loader, not a skeleton of a layout that may not arrive | — | — | done | — | — | — |
| L.5 | The phone's `Loading` gate becomes the mat loader, drawn with positioned Views + the native driver | — | — | — | done | — | — |
| L.6 | `components/skeletons.tsx`: the same shapes for the week, my classes, the feed, class detail, dues, rank, check-in | — | — | — | done | — | — |
| L.7 | `InlineLoading` retired — its last caller duplicated the button's own spinner | — | — | — | done | — | — |
| **v3.4** | **Member CSV export** _(O4; browser-side, no migration, no router change)_ | | | | | | |
| U.1 | `membersCsv` / `membersCsvFilename` in `@matops/domain` (+ tests, formula-injection guard) | — | — | — | — | done | — |
| U.2 | Members tab **Export CSV** over the filtered roster | — | — | done | — | — | — |
| **v3.6** | **Pilot blockers** _(O1 / O4 / §4; ADR 76 — no migration, no new dependency)_ | | | | | | |
| B.1 | Sentry sampling capped for the free plan: no traces, no logs, replay on error only | — | — | — | — | — | done |
| B.2 | The class horizon: `healHorizon` (ADR 76) → daily sweep (ADR 78) → the owner's **Rebuild schedule** button, 6 months (ADR 79) | — | done | — | — | — | — |
| B.3 | `rate-limit.ts` + `rateLimited()` on the three public procedures; Better Auth `rateLimit` block | — | done | — | — | — | done |
| B.4 | Public `/privacy` page (placeholders visible) + links from the drop-in and join forms | — | — | done | — | — | — |
| B.5 | `FeedbackLink` (sidebar footer + Profile) and the first-run checklist on an empty dashboard | — | — | done | — | — | — |
| B.6 | Approve / decline / roster / history move to `staffProcedure`; `dues: null` for a non-owner | — | done | done | — | — | — |
| B.7 | `/members` becomes a staff route; four owner-only blocks grow their own `isOwner` gate | — | — | done | — | — | — |
| **v3.5** | **A daily cron, off the host** _(ADR 75; no migration, no domain change)_ | | | | | | |
| C.1 | `.github/workflows/cron.yml` — daily 09:00 Lisbon, dues sweep, `CRON_SECRET` bearer | — | — | — | — | — | done |
| C.2 | `/api/cron/remind` sends **dues only** (`leadMinutes: 0` empties the class claim) | — | done | — | — | — | — |
| **v3.1** | **A pinned map link for the academy** _(O6 / S7; ADR 71)_ | | | | | | |
| P.1 | Migration `0022` (`map_url` on `organization`) + `MapUrlSchema` host allowlist | done | — | — | — | done | done |
| P.2 | `academyMapUrl(address, mapUrl)` prefers the pin; `academy.current` returns `mapUrl` | — | done | — | — | done | — |
| P.3 | Settings card: map-link input + live **Check the pin ↗** preview, gated on an address | — | — | done | — | — | — |
| P.4 | Mobile Profile opens the pin, or the phone's own map app on the address | — | — | — | done | — | — |
| **v2.10** | **Referrals go owner-only** _(O9 / O1; ADR 69)_ | | | | | | |
| R.1 | `referral.dashboard` / `assign` move to `ownerProcedure`; nav item hidden for instructors | — | done | done | — | — | — |
| R.2 | Instructor-only branches deleted from the screen (locked chips, owner-only hints, `isOwner`) | — | — | done | — | — | — |
| R.3 | `stats.gym` returns owner-only `newMembers` (null for an instructor) instead of two always-on fields | — | done | done | — | — | — |
| R.4 | Tier tests: referrals refused to an instructor, `newMembers` null on their insights | — | done | — | — | — | — |

² Static gates green; the QR deep-link round-trip, overdue strip, toast, dark-warmth tweak, and the v3.0 in-app scan want a **real-device pass** (no simulator in the build env, and a camera never works in one) — flagged in ADR 45 and ADR 70.

³ Static gates green. The reminder actually firing, the notification permission prompt, and the pull gesture want a **device pass** — flagged in ADR 54.

---

## Slice detail

Only the non-obvious tasks + spec/ticket refs are listed. Fill tasks into checkboxes as you start each slice.

### Phase 0 — Foundations

**Exit test:** web _and_ mobile each make one authenticated, tenant-scoped tRPC call end to end.

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
- **1.5 Members** — approve / remove / suspend; **promote a member to co-owner** (never ownerless); pending rows show **visit-count nudge**; removal keeps history + revokes access. Spec: §4 edge rules.
- **1.6 Multi-academy switcher** — `activeOrganizationId` drives RLS scope; switcher shown only if 2+; join 2nd via another link. Spec: ticket 18.
- **1.7 Numeric academy code join (mobile v1)** — every academy gets a plain 6-digit `public_code` (migration `0010`, assigned by the auth hook). Owner shares the number; the student types it in the Expo app → `academy.findByCode` → `membership.joinByCode` → pending **student** (role fixed). Replaces the deep link on mobile v1; invite links + the `join/[token]` route stay for the web + next iteration. Spec: S2, O4; ticket [32](issues/32-academy-code-join.md).
- **1.8 Social login — Google** — the "social login" half of S1. One server switch (`socialProviders.google`, fed by optional `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`) enables **Continue with Google** on both clients + **account linking** (`trustedProviders: ["google"]`, one identity per email). No migration (reuses the `account` table); no change to tenancy — a Google user has no academy membership, so it lands on the same join gate. Missing creds → provider not registered (magic-link only). **Status:** **Web = done** (server-side verified). **Mob = deferred (2026-07-21)** — mobile ships **magic-link only**; the Google button was removed from the Expo sign-in. Source analysis showed the server side is fine (the deep link does carry `?cookie=`); the break is the iOS `ASWebAuthenticationSession` return, whose reliable fix is the native idToken flow (iOS OAuth client + native module + rebuild) — out of scope now, revisit with Phase-5 native work. **Inf = wip** — dev redirect URI registered; prod URI + the full diagnosis are in ADR 35 + `docs/mobile-google-login-handoff.md`. Spec: S1; ADR [35](issues/35-social-login-google.md), [36](issues/36-mobile-ui-explicit-styles.md) (mobile UI + `dev:ios` fix).

> **Shipped: mobile pass (Mob cells 1.3/1.4/1.6/2.4).** The Expo student app was built as one pass after Phase 2 (the pending student's home is the schedule S4 — Phase 2 — so a mobile-only pass would have landed on an empty home). Delivered slice by slice (M0–M5, see [CHANGELOG](../CHANGELOG.md)): (a) auth-gated student shell + the `post` demo retired (router + table dropped, migration `0009`), (b) magic-link sign-in with a `matops://` deep-link return, (c) `app/join/[token].tsx` (RN twin of the web join flow) + in-app paste + sign-in-first with the token preserved, (d) pending banner (S3), (e) schedule (S4) + read-only class detail (S5, new `class.get`), (f) profile + switcher (S7). **Deep links = custom scheme now** (`matops://join/<code>`); **universal links / AASA + Android assetlinks + EAS submit are deferred to a Phase 5 launch-infra task** (need Apple/Google/EAS accounts + a hosted domain) — ADR [31](issues/31-deep-link-approach.md). Verified by the static gates + code review; device-only checks (incl. the slice-1.7 code-join flow) live in the [mobile device-test checklist](mobile-device-test.md) (no simulator in the build env).

### Phase 2 — Scheduling core

**Exit test:** owner defines a recurring week; concrete classes appear; both clients read the schedule.

- **2.1 Class templates** — recurring weekly definition (days, local start minutes, duration, tz, capacity, discipline). Staff CRUD. Refs: ticket 08.
- **2.2 Materialization** — lazy on template write (fills the **6-week horizon** on each save); idempotent via `generated_until` + `UNIQUE(template_id, starts_at)`. Horizon is **180 days** (ADR 79). Nothing fills it automatically: a template save fills six months, and the owner's **Rebuild schedule** button (`rebuildSchedule` + the pure `staleClassIds`) throws the forward schedule away and regenerates it from the active templates. The cross-academy sweep (`runMaterializationSweep`, LIMIT + time budget, service role outside the seam, injectable `exec`) stays a tested, callable, **unscheduled** seam. The schedule read does not materialize. Refs: ticket 16, ADR 46, 75, 78, 79.
- **2.3 Class instances** — one-off create (templateId null) + edit/cancel. Edit rules: **notify booked students** on time/instructor change; capacity cut below bookings allowed (soft); **template edits hit future non-cancelled instances only**; delete = soft-delete, keep bookings. `status = scheduled|cancelled` (no "completed"). Refs: spec §4; tickets 19, 08.
- **2.4 Schedule read** — owner web (full) + student mobile (**own academy only**, can't see other academies). Refs: spec S-schedule. **As built (web-first):** owner web read = `class.week` (staff, shipped in 2.3); student read = `class.mine` on `enrolledProcedure` (pending may browse, RLS-scoped to own academy). Student-lens API ready (`isStudentLensMembership` + `academy.listMineStudent`). **Mob** (the Expo student schedule screen) stays `todo` — it lands in the deferred mobile pass, which is now unblocked.

### Phase 3 — Booking & attendance

**Exit test:** student books/cancels (≤3 taps) + checks in via QR; walk-in via public form; staff sees attendance.

- **3.1 Book / cancel** — **DONE.** New `class_participation` table (migration `0011` + RLS) + `booking` router (`book`/`cancel` on `enrolledProcedure`). Atomic conditional `UPDATE` increments `booking_count` (capacity guard **dropped** in v1); `UNIQUE(class_id, student_id)` stops double-book; re-book = ON CONFLICT flips cancelled→booked; cancel decrements floored. **Confirmed-only count:** an approved member's booking counts; a **pending** member's is `provisional` — recorded + tagged "pending approval", never counted. **Soft capacity:** never blocked; at/over shows red "22/20 · may be busy" + confirm (mobile S5). `class.get`/`class.mine` now return the caller's `myBooking`. Pure rules `bookingTier`/`canBook`/`capacityDisplay` in `@matops/domain`. Refs: tickets 13, 22.
- **3.2 Provisional booking** — **DONE.** The provisional _tier_ + the student-side "pending approval" tag shipped with 3.1; 3.2 added the **owner-side** view: `class.week` returns a `pendingCount` (provisional-only subquery) and the web schedule shows "N/cap · +M pending". Refs: tickets 22, 23.
- **3.3 Attendance** — **DONE.** Migration `0012` adds the attendance axis to `class_participation` (`attendance_status` + `attended_at`/`marked_by`) and a `none` booking value for walk-ins. New `attendance` router (`staffProcedure`: `list`/`mark`/`addWalkIn`/`members`) + the O5 web screen (pick a class in the 14-day backfill window → mark present/absent → add a walk-in). Walk-in = booking `none` + attendance `present`, never counted. Members `visitCount` ("attended N×") now real. Pure rules `canMarkAttendance`/`attendanceCounts`. Refs: ticket 08, spec O5.
- **3.4 QR self check-in** — **DONE.** New `checkin` router (`enrolledProcedure`: `today`/`checkIn`). Check-in = **book + attend** in one (soft cap — present even if full; pending → provisional). `resolveCheckInClass` (pure, server-side) picks the current/next class; mobile S8 `checkin` screen confirms + checks in. **No camera in v1** (D3): uses the active academy; the physical QR routes no-app visitors to 3.5. Refs: ticket 24; spec S8/§4.
- **3.5 Public drop-in form** — **DONE.** New `drop_in` table (migration `0013` + owner-read RLS). The `dropIn` router's `submit` + `academyInfo` are the **first public (unauthenticated) procedures** — an enumerated tenant-seam exception (writes on the trusted base connection). Public web page `/checkin/[academyId]` (name, surname, phone, email optional, **required consent**), **dedupe by phone** (one lead + visit count), resolves today's class server-side (else general lead). Owner O4 leads section + O6 venue-link poster. Refs: ticket 25; spec §4. _(Follow-up resolved (v1.3 F.3): the O6 poster renders a scannable QR image via `qrcode.react` — `venue-checkin.tsx`.)_

### Phase 4 — Notifications & polish

**Exit test:** every v1 event fires on the right channel; empty/error states are flawless.

- **4.1 notifications package** — **DONE.** Thin `packages/notifications` = pure transport (`sendPush` batched Expo Push + `sendEmail` Resend, serverless HTTPS, never throws, no DB dep). Message text = pure builders in `@matops/domain/notify.ts` (+13 tests); resolution lives in the API layer (ADR **34**). Push tokens stored **outside the tenant seam** — `push_token` (migration `0014`, keyed by `user.id`, no `academy_id`/RLS); `pushToken.register`/`unregister` on `protectedProcedure`; mobile registers on sign-in via `expo-notifications` (`utils/push.ts` + `push-sync.tsx`). Refs: tickets 17, 34.
- **4.2 Events** — **DONE (bar the reminder schedule).** The three `TODO(phase 4)` hooks are wired: class cancelled (**push**), class time/instructor change (**push**), membership approved (**push**) — via `packages/api/src/notify.ts`, awaited but error-swallowed so a send never fails the mutation. Class-reminder **sweep** (`claimDueReminderClasses`, atomic `reminder_sent_at` claim in `0014`) + `runReminderSweep` + the protected `/api/cron/remind` route ship now. The route is scheduled daily since v3.5 (ADR 75) but for **dues only** — the class half is switched off, since the phone schedules those on the device (ADR 54) and a daily tick would reach only the classes inside the 2h window. Mobile: tap-to-navigate handler. Refs: tickets 17, 34; spec §4.
- **4.3 States + design pass** — **DONE.** A shared **state system** on both clients — `SkeletonRows` / `EmptyState` / `ErrorState` (web `_components/states.tsx`; mobile `components/ui.tsx`): loading skeletons, empties written as **invitations** (title + what-to-do), and errors with a **retry** that never masquerade as "no data". Applied across every data screen (web home/schedule/members/attendance/templates; mobile schedule/class/check-in) — fixed two real bugs where a fetch error fell through to onboarding (web) / "no classes" (mobile). Soft-capacity red + ≤3-tap booking verified (already built in S5). Thin S7 **Push notifications** toggle on mobile profile (registers/unregisters this device's token — no server pref). NativeWind/Tailwind tokens already shared (ADR 11). Refs: tickets 09, 11.

### Phase 5 — Launch hardening

**Exit test:** v1 running in production, both apps published.

- **5.1 Reconciliation** — periodic recompute of `booking_count` from participations (safety net for the denormalized count). Refs: ticket 13.
- **5.2 Observability & abuse** — error tracking, structured logs, rate-limit the **public** drop-in endpoint (QR-in-gym is the main anti-spam; add a soft limit). Refs: ticket 25.
- **5.x Reminder scheduling — DONE for dues, off-host (ADR 75).** ADR 46 removed the two Vercel Cron jobs (proprietary + Hobby is non-commercial/1-per-day). v3.5 puts both routes on a **daily GitHub Actions** tick with the same `CRON_SECRET` bearer token, which locks us to no host. **Daily is a Neon limit, not a preference:** Neon Free sleeps after 5 min idle on ~100 compute-hours/month, so each ping buys ≥5 min of compute and a 15-min cadence would keep the DB awake until it hard-suspends. **Class** reminders stay off (ADR 54 schedules them on the device; the benefit is fewer no-shows, which v1 does not track). Anything sub-hourly needs a paid Neon plan first. Refs: ADR 75, 46, 34, ticket 17.
- **5.3 Release** — Vercel prod, Neon prod branch + migration run, EAS build + store submit, env promotion.

### v1.2 — Personal & Insight

**Exit test:** the student sees their own training (total/streak/next class); the owner sees gym activity + who's drifting; both read from attendance data already stored. Decision: ADR 39. **No migration, no cron.**

- **A.0 stats engine** — **DONE.** `packages/domain/src/stats.ts` (pure, 20 tests): `trainingStats`, `classifyDrift` (+ `DRIFT_THRESHOLDS`), `gymInsights`, `splitMyClasses`, `nextClass`. Sessions = `present` participations; per-academy; academy-zone Sunday-start weeks. Refs: ADR 39.
- **B.1 My Training stats** — **DONE.** `stats.me` on `enrolledProcedure` (present participations join `class` → `trainingStats`; academy zone resolved from templates, `academy-tz.ts`); mobile `MyTrainingCard` (total · month · streak · favorite · days since last). Refs: spec S7; ADR 39.
- **B.2 Training tab + next-class card** — **DONE.** `booking.mine` (caller's participations join `class`) split client-side by `splitMyClasses`/`nextClass` (`@matops/domain` added to expo); new `(tabs)/training.tsx` = next-class card + stats + Upcoming (cancel)/Past; tabs are now Schedule · Training · Check-in · Profile. Refs: spec S6.
- **B.3 Edit profile** — **DONE.** `UpdateProfileSchema` + `account.updateProfile` on `protectedProcedure` → `updateUserProfile`; email read-only; mobile profile Name/Phone editable, session refetched with `disableCookieCache` after save. Refs: spec S7.
- **C.1 Gym insights + drifting** — **DONE.** `stats.gym` (staff, 30-day window → `gymInsights` + new-members-this-month) + `stats.drifting` (owner, `max(startsAt)` per student → `classifyDrift`, ≥1-session members only, stalest first); dashboard Insights block + "who's drifting" widget linking to `/members?member=`. Refs: spec O1; ADR 39.
- **C.2 Tabbed member detail** — **DONE.** `membership.memberHistory` (owner; member's present participations + `trainingStats`/`classifyDrift`); member list row expands to Overview · Attendance tabs (paginated), deep-linkable from C.1. Fulfils spec O4 "attendance history". Refs: spec O4.

### v1.3 — Frictionless & Pay

**Exit test:** the common booking is one tap (home card); the owner clears a class's attendance in one tap; the owner sees who paid / who's overdue and confirms an "I paid" claim; dues reminders fire. Payments = **manual bank transfer only** (no processor). Decision: **ADR 40**. **Build order: F.3 → F.1/F.2 → P.1 → P.2 → P.3 → R.1 → R.2** (P.1 gates all payments; R.2 is a fast-follow, off the critical path). Only **P.1** has a migration (**0015**).

- **F.1 Today / next-class card** — **DONE.** A brand-tinted card at the top of the mobile schedule (S4) features the class the student would book next (soonest upcoming unbooked, else the soonest upcoming — derived from the `class.mine` data already fetched) with a single **Book** button + the existing soft-capacity confirm; shows a "You're booked" state when done, and nothing when there's no upcoming class. Reuse only — `booking.book` + the schedule read; no new backend. Mobile device check pending. Spec: S4 (amended).
- **F.2 Mark-all-present** — **DONE.** Domain-first: pure `bulkMarkTargets` in `attendance.ts` (booked+unmarked → present; leaves explicit absents + walk-ins) + 3 tests → `attendance.markAll` (staff, one bounded `UPDATE` in the RLS tx, respects the ≤14-day backfill via `canMarkAttendance`, returns the count) → web O5 **"Mark all present"** button (per-row Present toggle is the existing undo). Verified live on Neon (rolled-back tx). Mobile stays `—` (attendance is web/staff). Spec: O5 (amended).
- **F.3 Scannable venue QR — DOC RECONCILIATION (no code).** Already built — `apps/nextjs/src/app/_components/venue-checkin.tsx` renders a printable QR poster via `qrcode.react` (`QRCodeSVG`); the roadmap/CLAUDE.md just never flipped. Task: flip this note + the Phase-3.5 follow-up + the status banner to reflect it, remove the "needs a QR lib" line, one CHANGELOG line. **Do not rebuild.**
- **P.1 Dues + payment-claim schema & domain** — **DONE (foundation).** Migration `0015` adds four tenant-scoped tables (RLS `drop_in` pattern, **verified live on Neon** + a PGlite leak test): `membership_plan`, `member_dues` (a dedicated RLS dues row instead of a column on the RLS-less `member` table — ADR 40 implementation note), `payment_claim` (partial unique index = one open claim per member per `"YYYY-MM"` period), `payment_settings` (owner bank details). Pure `packages/domain/src/payments.ts` — `paymentStatus`/`rollNextDue` (UTC month math)/`paymentPeriod`/`claimDedupeKey`/`canClaim` + 13 tests. Validators added (`CreateMembershipPlanSchema`, `SetMemberDuesSchema`, `CreatePaymentClaimSchema`, `ClaimIdSchema`, …). Un-parked payments — ADR 40 written; spec §5/S9/O7 updated. Spec: O7, S9.
- **P.2 Owner: paid / overdue status** — **DONE.** `membership.members` (owner) now returns a per-member `dues` object — the RLS-scoped `member_dues`⋈`membership_plan` join + a last-confirmed-`payment_claim` aggregate, both on `ctx.db`, merged by `member.id`; status computed at read time via `paymentStatus` (never stored). Web O4: a payment-status **dot** (green/amber/red) per member, an **Overdue** filter chip, and plan / next-due / last-payment rows in the member-detail Overview. Verified live on Neon (rolled-back tx). Deps: P.1. Spec: O7.
- **P.3 Student pay: requisites + "I paid" + confirm** — **DONE.** New **`payments` router** (all RLS-scoped `ctx.db`): owner `plans`/`createPlan`/`deletePlan`, `setMemberDues` (upsert plan + next-due), `getRequisites`/`updateRequisites` (bank details), `claims`/`confirm`/`reject` (confirm rolls `next_due_at` one cycle in the one RLS tx); student `myDues` (dues + requisites + derived reference code + `canPay`) + `claim` (one open claim per period via `canClaim` + the DB partial unique index; optional `proofUrl`). Reference code = pure `paymentReference` (derived, not stored). Web: new owner **Payments** screen (O7 — claims to confirm · member dues · plans) + nav item + waiting-claims badge; **bank-details** field on Settings (O6). Mobile S9: **Membership dues** card on Profile (status + amount + next-due, requisites with **copy** buttons via `expo-clipboard`, **"I paid"**). `expo-clipboard` is loaded **lazily + guarded** so a dev client built before it was added degrades to selectable text instead of dropping the whole Profile tab; a dev-client rebuild enables one-tap copy. Verified live on Neon (rolled-back tx: claim under RLS, double-submit blocked, confirm rolls the due date); **mobile device check pending**. Deps: P.1, P.2. Spec: S9, O7.
- **R.1 Payment reminders** — **DONE.** Pure `buildDuesReminderMessage` (push + email, due-soon vs. overdue) + tests; `dues_reminder_period` column on `member_dues` (migration `0016`) = **one reminder per billing period** (auto-resets when a confirm rolls `next_due_at`); base-connection `claimDueDuesReminders` (atomic `UPDATE … RETURNING`, concurrency-safe) wired into `runReminderSweep`. Scheduled **daily** since v3.5 (ADR 75) from `.github/workflows/cron.yml`, not from the host, so dues reminders now fire on their own — the first message in the product that reaches a student with no person acting. Verified live on Neon (rolled-back tx: claims due-soon+overdue not paid, idempotent, re-eligible on a new period). Deps: P.1. Spec: O7; ADR 34/40.
- **R.2 Home-screen widget** — native widget (iOS WidgetKit / Android) mirroring the F.1 card; deep-link "Book" into the app; a read-only snapshot in a shared store (App Group / SharedPreferences) — no auth/API in the widget. **Fast-follow, last, off the critical path.** **Scaffolded, native build deferred:** the shared selection `nextBookableClass` is built + tested in `@matops/domain` (reused by F.1); ticket 27 promoted; full native handoff written. The remaining WidgetKit/AppWidget/App-Group work is device-only (no simulator/Xcode in env). Guide: [`docs/home-widget-implementation.md`](home-widget-implementation.md). Deps: F.1. Spec: S10.

### v1.4 — Rank & Notes

**Exit test:** a coach sets a member's belt (+ stripes) per discipline from the member list member detail, changing it records a promotion, and the student sees their rank + timeline read-only on Profile; a coach jots a staff-private note the student never sees. Rank is the coach's **judgment** — no automation, no progress prediction. Decision: **ADR 41**. Only **G.1** has a migration (**0017**). **Build order: G.1 → G.2 → G.3 → G.4.**

- **G.1 Rank + notes schema & domain** — **DONE (foundation).** Migration `0017` adds three tenant-scoped tables (RLS payments/`drop_in` pattern, PGlite leak test `rank-rls.test.ts`; **applied + verified live on Neon** — RLS + `*_isolation` policy + `matops_app` grant on all three): `member_rank` (one current rank per member+discipline, unique index = the upsert target), `rank_promotion` (append-only history), `member_note` (staff-private). Pure `packages/domain/src/rank.ts` — seeded `RANK_SYSTEMS` (BJJ belts + stripes, Judo belts), `isValidRank`/`formatRank`/`isRankChange`/`rankDisciplines`/`disciplineLabel` + 15 tests. Validators: `SetMemberRankSchema`, `ClearMemberRankSchema`, `AddMemberNoteSchema`, `NoteIdSchema`. Un-parked rank — ADR 41 written; spec O4/S7/§5 updated. Discipline stored as TEXT (validated in domain) so the model stays general. Spec: O4, S7.
- **G.2 Owner: set + promote rank per discipline** — **DONE.** New **`rank` router**: `forMember` (staff — current ranks + promotion history with promoter names), `set` (staff — validates via `isValidRank`, upserts `member_rank`, appends `rank_promotion` only when `isRankChange`, both in the one RLS tx), `clear` (staff). Web O4 member detail gains a **Rank** tab: current ranks per discipline, a discipline/belt/stripes picker → **Save rank**, and the promotion history. Discipline picker is populated from the seeded systems (no owner rank-system config in v1.4 — custom ladders parked; this folds the drafted "G.5"). Staff-tier so an instructor can set rank via API even though the web surface is owner-only O4. Spec: O4; ADR 41.
- **G.3 Student: view ranks + timeline** — **DONE.** `rank.mine` (enrolled, read-only) resolves the caller's `member.id` and returns their ranks + promotion timeline. Mobile S7 Profile gains a **My rank** card (per-discipline rank + a short promotions list); empty until a coach sets it. **Mobile device check pending.** Spec: S7; ADR 41.
- **G.4 Staff-private notes** — **DONE.** New **`note` router** (all staff-tier, never read by a student-facing route): `forMember` (notes + author name), `add`, `remove`. Web O4 member detail gains a **Notes** tab (textarea + Add, list with author/date + Delete). RLS scopes notes to the academy so all staff share them; the member never sees them. Spec: O4; ADR 41.

### v1.5 — Owner on the mat (installable PWA)

**Exit test:** the owner adds the web app to the phone home screen, it opens **standalone** (app icon, no browser chrome), and the four on-the-mat jobs — take attendance, cancel / edit a class, **share** the invite link + venue QR via the phone share sheet, approve a pending join — are thumb-reachable at phone size. Decision: **ADR [42](issues/42-owner-mobile-web-pwa.md)**. **No migration, no domain, no router change** — a client-shell + manifest concern; the tenant seam is untouched.

- **W.1 PWA manifest + install** — **DONE.** Next App-Router manifest route `apps/nextjs/src/app/manifest.ts` (`/manifest.webmanifest` — `standalone`, brand `theme_color #6a4dff`, `start_url "/"`, `192`/`512`/maskable-`512` PNG icons in `public/`, generated from the brand basketweave mark) + iOS home-screen metadata in `layout.tsx` (`appleWebApp` + a 180px `apple-touch-icon`; Safari ignores the manifest for add-to-home-screen) + `viewport-fit=cover`. **No service worker / offline** — modern Chromium install no longer needs one, and offline + native push are the deferred-native tail (ADR 42 cuts). Spec: O8.
- **W.2 On-the-mat interaction polish** — **DONE.** `env(safe-area-inset-*)` padding on the mobile shell (top-bar notch + bottom-tab home indicator; 0 on desktop, so desktop is untouched). O5 attendance **Present/Absent** become full-width ≥44px thumb targets on mobile (compact pair on desktop). Invite links + venue QR gain a **Share** button → the OS share sheet (`lib/share.ts` — `shareLink` + clipboard fallback; `useCanShare` reads `navigator` via `useSyncExternalStore` with a `false` server snapshot — no hydration hack, no effect). Spec: O8.

**Cut (ADR 42):** the O1 dashboard analytics reflow, editing payments / plans / settings on mobile, native push / offline, and any **unified / native owner app** (student stays native, owner stays web / PWA; a separate native owner app is revisited only on a native-only mat need _and_ the Apple-account / device-test blockers clearing). **Student web** stays out (Kano _Indifferent_). Verified: lint · typecheck · `next build` (the manifest route + all screens present). **Device install / visual check pending** (no simulator — the standing handoff pattern).

---

### v1.7 — Mobile dark-first design pass (Geist + shared language)

**Exit test:** the Expo student app opens **dark** (canonical pure black) with class times, capacity, prices and streaks set in **Geist Mono** (the "mat clock"), cards and callouts match the web (tight 3px radius, filled-vs-outline, dashed stripe), and Profile offers a **Light / Dark / System** toggle that persists. Decision: **ADR [44](issues/44-mobile-dark-first-design-system.md)**. **No domain / API / migration / router / token change** — presentation only, so the web can't regress.

- **U.1 Dark-first theme + Appearance toggle** — **DONE.** Mobile `ThemeProvider` (`components/theme.tsx`) defaults to dark, tri-state (Light / Dark / System), persisted in `expo-secure-store`, applied via RN `Appearance.setColorScheme` (NativeWind follows). New **Appearance** control on Profile (S7). Palette now derived from `@matops/ui/tokens` (hand-copied drift removed). Spec: S1–S9.
- **U.2 Geist typography + aligned kit** — **DONE.** `@expo-google-fonts/geist` + `-geist-mono` via `useFonts` (splash held); `Txt` / `Mono` / `Eyebrow` / `Stat` apply Geist + tabular mono to every data value. `components/ui.tsx` rebuilt to the web vocabulary — `Card` (filled/outline), dashed `Callout`, `StatusPill`, `CountBadge`, mono field labels, input focus ring, 3px radius — plus a `Blueprint` sign-in hero (the RN motif). Green: `pnpm -F @matops/expo typecheck · lint · format`; `expo export` bundles clean. **Dev-client rebuild + device check pending** (new font dep; no simulator — the standing handoff pattern).

**Cut:** none — full scope shipped. The remaining follow-up is collapsing the local `components/ui.tsx` kit onto the shared `@matops/ui` RN primitives (`button.native` / `logo.native`); the screens import behind `~/components/ui`, which is the seam.

---

### v1.8 — Mobile ease-of-use (IA + core-flow friction)

**Exit test:** a student books any bookable class from the Schedule list in **one tap**; the two class tabs read as "all" (Schedule) vs "mine" (My classes) with a single next-class card; an **overdue** member sees a thin, self-clearing warning strip on the tab screens that taps through to dues; there is **no Check-in tab** — a walk-in scans the gym poster and the app books + marks them attended; **appearance / notifications / sign out** live on a Settings screen behind a Profile gear; booking shows a toast and the S5 action sits in the thumb zone. Decision: **ADR [45](issues/45-mobile-ease-of-use.md)**. **No domain / migration / back-end change** — reuses `booking` / `checkin` / `payments` / `academy` as-is.

- **M.1 Inline booking** — **DONE.** Shared `components/book-control.tsx` (`useBookClass` hook + `BookButton`) de-dupes the book rule (schedule + detail); each bookable Schedule row books in one tap (soft-cap confirm kept). Spec: S4/S5.
- **M.2 De-dupe class tabs** — **DONE.** Rename Training → **My classes** (display only; route file kept); remove Schedule's duplicate next-class card. Spec: S4/S6.
- **M.3 Overdue header (S11)** — **DONE.** `components/overdue-banner.tsx` — thin dashed error strip on Schedule / My classes / Profile when `payments.myDues.status === "overdue"`; taps to Profile dues; self-clears on confirm. Spec: new S11.
- **M.4 QR walk-in (S8 redefined)** — **DONE.** Removed the Check-in tab; new pushed `app/checkin/[academyId].tsx` (deep link `matops://checkin/<id>`) sets active academy → resolves the live class → book + attend. Web: the public `/checkin/<id>` page keeps the drop-in form + gains an "Open the app" deep link. No back-end change. Spec: S8.
- **M.5 Settings split (S12)** — **DONE.** `app/settings.tsx` (appearance + push toggle + sign out) behind a ⚙ gear in the Profile header; Profile now scrollable, identity + membership only. Spec: S7 + new S12.
- **M.6 Booking feedback** — **DONE.** Minimal `components/toast.tsx` provider (booking / cancel toast) + sticky bottom Book/Cancel bar on S5. Spec: S4/S5.
- **M.7 Dark-theme warmth** — **DONE (needs device).** Mobile-only override in `theme.tsx` warms the dark `card`/`popover` surfaces; shared web tokens untouched.

**Verify:** `pnpm -F @matops/expo typecheck · lint` green; repo-wide typecheck 17/17, lint 15/15, tests 50 pass. Real-device pass deferred (no simulator) — flagged in ADR 45.

---

### v1.9 — Internal Referrals

**Exit test:** staff attribute an eligible student once to any retained academy member and see confirmed current-month/lifetime payment performance by referrer; instructors cannot change an assignment, while owners can correct/clear it and inspect the complete audit. Decision: **ADR [52](issues/52-internal-referral-tracking.md)**. Migration `0018`; no student/mobile surface and no commission or payout behavior.

- **J.1 Referral domain + persistence** — **DONE.** Pure target/referrer/self/currency/month rules; `member_referral` current state + append-only `member_referral_audit`, both RLS-scoped with tenant indexes, unique student key, and self-referral checks. Focused domain and PGlite tests written (not executed in this agent session).
- **J.2 Staff API** — **DONE.** `referral.dashboard` aggregates contact-free membership/plan/dues data and confirmed claims by academy month/currency; `assign` is staff-tier and catches repeated/concurrent assignment as a precondition; `correct`/`history` are owner-tier. Corrections and audit writes share the tenant transaction.
- **J.3 O9 web ledger** — **DONE.** `/referrals` for owners/instructors with metrics, selectable referrer summaries, search and five filter dimensions, removed-history toggle, one-time assignment confirm, instructor lock, owner correction warning, and on-demand audit history. No O4/O7 owner controls leak into the screen.
- **J.5 Referrer-first rewrite** — **DONE.** J.3 shipped O9 as a student ledger: a referrer `<select>` and confirm button on every row, five filter dimensions above them. The screen now leads with the people who bring students in, ranked by how many, with their students as chips and the confirmed month/lifetime money they paid. Students nobody is credited for are a second section. **One dialog owns every write** — the header button, an uncredited student, or (owner only) a student chip on a card — and it says the permanence in words instead of nesting a `ConfirmDialog`. The picker only offers what the caller may do, so an instructor never reaches a locked state. Filters drop from six controls to search plus show-removed; plan and dues leave O9 for O4/O7; the metrics band becomes one sentence. No API, schema, or permission change: the client groups `referral.dashboard` students by referrer and reuses `groupMoneyByCurrency`, so the totals follow the rows on screen. Decision: **ADR [56](issues/56-referrer-first-referrals.md)**. Spec O9 updated.
- **J.4 Demo continuity** — **DONE.** Both seed modes include multiple referrers, unassigned students, a removed historical attribution, and confirmed payment history from before attribution; both teardown modes remove only their referral rows under the existing cleanup guarantees. Since ADR [65](issues/65-beta-demo-academy.md) the fake-academy mode builds **one** gym, "Alma beta", and the referral data also covers the `corrected` and `cleared` audit actions.

**Verify:** repo-wide typecheck (17/17), lint (15/15), and Drizzle migration check green. Focused tests are written but intentionally not run under the session rule. Manual desktop/PWA interaction pass remains.

---

### v2.0 — Mobile Wave A (kept promises + freshness)

**Exit test:** a student who books a class gets a notification two hours before it starts, and cancelling the booking silently drops it; pulling down on Schedule / My classes / Profile refreshes them; reopening the app after hours away shows current spots-left, not a stale count; the schedule row names the coach; opening a class shows who else is on it, names for an approved viewer and counts for a pending one. Decision: **ADR [54](issues/54-local-class-reminders.md)**. **No migration / domain / token change**; one additive read field.

- **N.1 Local class reminders** — **DONE (needs device).** `apps/expo/src/utils/reminders.ts` schedules an `expo-notifications` local notification 2h before a booked class, cancels it on cancel, and clears everything on sign-out or when the push toggle goes off. Payload matches the server push, so the existing tap router opens the class detail. Closes the gap ADR 46 left: the Settings copy promised reminders that nothing could send. Spec: S12 + §4.
- **N.2 Freshness** — **DONE (needs device).** `AppState` drives React Query's `focusManager` in `app/_layout.tsx`, `staleTime` is 30s, and a shared `components/refresh.tsx` `useRefreshControl` adds pull-to-refresh to the three tab screens (also reachable from the empty and error states, which now sit inside the scroll view). Spec: §4.
- **N.3 Rolling week window** — **DONE.** The Schedule query window was frozen in a `useMemo` with an empty dependency list; it is now computed per render, so midnight rollover is handled. Spec: S4.
- **N.5 Who's in the class** — **DONE.** The §4 schedule-privacy rule was locked in session 12 and never built. New pure `visibleAttendees` (`packages/domain/src/attendance.ts`, 6 tests): an approved viewer sees **all booked members** by name alphabetically, **pending ones included** (ADR [55](issues/55-attendee-names-include-pending.md) amends §4 — the original approved-only rule hid an ordinary member who trains on the same mat, and the count told the viewer nothing); drop-ins and anyone with no name on file stay a count; a pending viewer gets counts only plus `namesHidden` so the UI can say why; the viewer is never listed to themselves. New enrolled `class.attendees` read joins names inside the RLS transaction and counts drop-ins — no member-table lookup, since attendee approval no longer changes the answer. Mobile S5 gains a "Who's in" field; the detail screen finally scrolls, which its sticky-bar comment already claimed. Spec: S5 + §4.
- **N.4 Instructor on the row** — **DONE.** `class.mine` left-joins `user` for `instructorName` (the pattern `class.week` and `class.get` already use) and the Schedule row renders it, which is what S4 always said it did.

**Verify:** repo-wide typecheck 17/17, lint 15/15, prettier green. Domain tests for `visibleAttendees` written but not run (session rule). Device pass outstanding.

---

### v2.1 — Dashboard as a queue, not a report (O1)

**Exit test:** an owner opens the dashboard and, in five seconds, either sees a short list of things blocking them (each clickable, each able to reach zero) or one line saying the gym is clean. Nothing on the page is a number they cannot act on. **No migration; no new domain rule.**

- **D.1 The "needs you" queue** — **DONE.** The three triage cards (one of which, "Classes today", was not a task and duplicated the stat row beneath it) are replaced by a queue of blockers: payments to confirm, pending approvals, overdue members with the total owed, and drop-in leads from the last 7 days. Items render only above zero; an empty queue collapses to one line. Money reaches the dashboard for the first time — `payments.claims` is a new call, and the overdue count and amount come from the `dues` field `membership.members` already returned and the screen was discarding. Today's rows now name the coach and mark the caller's own classes **You** (`academy.current` gains `userId`). `/members?filter=overdue` turns the Overdue chip on, matching the existing `?member=` deep link. "On today" and the "Approve members" quick action are gone as duplicates. Spec: O1, O4.
- **D.2 Unmarked attendance** — **DONE.** Nothing told staff that a past class was never marked, so every downstream number (visits, attendance rate, drift bands) drifted wrong in silence. New pure `needsAttendance` + `UNMARKED_LOOKBACK_DAYS` (`packages/domain/src/attendance.ts`, 9 tests): a class is unmarked once it has ended, is live, somebody booked it, and nothing at all was marked. It deliberately skips a class **nobody booked** (an empty register cannot be marked, so the item could never clear) and a **partly marked** one (no-shows are normally left unmarked). `class.week` gains a `markedCount` subquery, the same shape `pendingCount` already had, so no second read is needed. The dashboard widens its window back over the look-back and computes `weekCount` from today forward. **This is the first queue item instructors get**, so the queue and its empty line are now staff-wide. Today's ended-but-unmarked classes also carry an **Unmarked** tag linking to O5. Spec: O1.
- **D.3 Day block upgrade** — **DONE.** Rows open the shared `ClassRoster` modal (already built for the O2 grid — no new component, the same optimistic marking), so attendance is taken from the dashboard instead of two screens away. Each row carries its state: **Now** while running, **Unmarked** once ended with no register, a quiet title once done. The block rolls to **Tomorrow** after today's last class ends, so an evening check is not a dead page. Two fixes fell out of it: `ClassRoster` now invalidates the `class` path as well as `attendance.list`, without which marking from a modal left the D.2 queue counting a class that had just been marked (this bit the O2 modal too — v2.4 V.3 later moved that invalidation from every mark to roster close); and `now` moved out of the window `useMemo`, which had frozen the clock at mount and would have called an ended class "now" on a long-open tab. Spec: O1, O2, O5.
- **D.4 Numbers with direction** — **DONE.** "84 visits this week" told the owner nothing without a baseline. `gymInsights` gains **`visitsLastWeek`**, counted in the same loop over the same 30-day window (no wider read: this week and last week both fit comfortably). New exported pure **`monthBucket`**, which also replaces the router's hand-rolled `sameMonth` string compare, lets `stats.gym` return **`newMembersLastMonth`** beside the existing this-month count. The `Stat` primitive gains an optional comparison line, painted **muted, never green or red** — a drop in visits is not an error, and hue-only direction fails both the callout vocabulary and colour blindness. The health row is three numbers now: visits this week vs last, new members this month vs last (owner), and the attendance rate. **`visitsLastMonth` was deliberately not built** — the previous calendar month does not fit inside the 30-day window, and widening the read would change what busiest / rate / by-weekday mean. Each stat states its own period instead of the section claiming one. Spec: O1.
- **D.5 Money this month** — **DONE.** New owner-only `stats.revenue`: confirmed payment claims for the academy calendar month against last, one figure per currency. It reuses the pure `groupMoneyByCurrency` the referral ledger already had, and the `monthBucket` D.4 added, so no new domain rule was needed. The SQL bound is a coarse 70 days (this month plus last is at most 62 on any calendar, plus room for the academy zone shifting a boundary) purely to stop the query growing forever; the exact month split happens in code. Currencies are never summed, and a currency billed in either month appears in both so a drop to zero shows. It sits at the head of the health row for owners and is absent for instructors, who never see money. `Stat` gains an optional `formatDelta` so the comparison line reads `↑ €120 vs last month` rather than a raw minor-unit count. Spec: O1.

**Series verify:** typecheck 17/17 · lint 15/15 · `next build` after every slice. Domain tests written across D.2 and D.4 (12 new) but not run under the session rule. **No browser pass** — the Chrome extension would not attach; the queue at 1 vs 5 cards, the day row at phone width, and the delta lines want an eyeball.

**Not in this series:** charts. `byWeekday` is sitting there and would look good as bars, but it answers no question an owner asks daily.

---

### v2.2 — Student onboarding funnel (ADR 57)

**Exit test:** a student standing in the gym scans a code, and a few minutes later has booked a class, without installing anything. **No migration; no new domain rule.**

- **E.1 Join QR** — **DONE.** The invite link is now also a QR code, on both the student and the instructor card. The gym's own moment of joining is face to face, and the lowest-friction hand-off between two people in one room is a camera scan, not a copy-paste into WhatsApp. The poster markup, the print CSS and the `qrcode.react` call moved out of `venue-checkin.tsx` into a shared `QrPoster`, so the two posters are one component. Printing is now scoped per card (`data-printing` on the card the button belongs to) because the settings page can hold two posters at once and the old `.qr-print` class would have printed both. Spec: O6.
- **E.2 One-step join** — **DONE.** The invite form asked for the magic-link email in the middle of the flow, so the student left for their mail app before committing anything, then came back to _more_ form. Name, phone and email are one step now; opening the emailed link completes the join by itself. The profile rides in the `callbackURL` rather than in `sessionStorage`, because the mail app often opens a different browser than the form was typed in. It is **base64url**, not query pairs: better-auth decodes the `callbackURL` a second time on verify, so a phone typed as `+380…` arrived as a space (checked against its `originCheck` regex, which the opaque form also satisfies). `sign-in.tsx` gained `SocialSignIn` / `OrDivider` exports so the join page reuses the Google button without a second email form under it, and the page reads the carried profile server-side, so no `useSearchParams` Suspense boundary is needed. Spec: S2.
- **E.3 Student web** — **DONE.** A student who joined on web landed on "You're almost in." forever, because every nav item is gated on `isStaff` / `isOwner`; the copy also lied to an **approved** student, who was never going to get staff tools. `dashboard-screen`'s non-staff branch now renders a **`StudentScreen`**: the rolling seven-day week grouped by day (Today first), time / title / discipline / coach / spots left, a **Booked** pill, and inline **Book** and **Cancel**. Over capacity it asks "book anyway?" through the existing `ConfirmDialog`, which is the soft-capacity rule the mobile `useBookClass` hook already applied. **No new procedure** — `class.mine` and `booking.book` / `cancel` are the calls the app makes, so the clients cannot drift. Two shell changes fell out of it: the nav renders only above one item (a one-tab bottom bar is not navigation), and **sign-out moved into the phone header**, which had never had one — a student on a phone, and an owner in the ADR 42 PWA, had no way to sign out. Suspended members get the §4 calm notice instead of a load error, with the query gated off. `now` is passed down from the screen rather than read per row, which `react-hooks/purity` rejects. Spec: S4.
- **E.4 Install card** — **DONE.** The PWA manifest has covered `/` since W.1 (`scope: "/"`), so the student week was already installable and nothing said so. A quiet card at the foot of the screen now offers **Install** where `beforeinstallprompt` fires, and the **Share → Add to Home Screen** wording on iOS, where no prompt exists. It hides itself once `display-mode: standalone` matches, so an installed student never sees it, and the suspended branch returns before it. It advertises **installing**, not a download, because no store listing exists — see ADR 57 §Consequences. The manifest description was owner-only wording ("Schedule, members, and attendance") and now names booking too, since students read it in the install prompt.

### v2.3 — Backend review fixes (ADR 60)

**Exit test:** the API has tests that drive the real routers, and every finding from the backend review is closed. **Two migrations (`0019` index, `0020` grants); no new domain rule.**

- **Q.1 API test seam.** **DONE.** `packages/api/test` is a third test home: `appRouter.createCaller` over the real middleware and the real SQL, against PGlite injected as `ctx.baseDb`. `createTRPCContext` went from three injected functions to one handle, and `withTenant` / `getMembership` / `getMemberById` / `getMemberIdForUser` / `listMembersOf` now take `exec` as a **required** parameter, because the `exec = db` defaults were what let a missed call site keep hitting the production pool with no compile error.
- **Q.2 Critical fixes.** **DONE.** The auth error hook logged the Better Auth context, which carries the **app secret** (rotate it on deploy). A template timing edit hard-DELETEd classes that `class_participation` and `drop_in` reference with `ON DELETE no action`, so one booking locked that template's time forever; it cancels and revives now. Class emails went out with every recipient in one `to:` field.
- **Q.3 Defect sweep.** **DONE.** `payments.myDues` (bank details) was readable by a **pending** member; `deletePushToken` had no owner check; `class.update` / `class.cancel` told students the wrong local hour; `template.update` reassigned the instructor to whoever edited; both reminder sweeps stamped "reminded" then sent serially; notifications ran inside the tenant transaction; the drop-in upsert erased a returning visitor's class and double-counted the visit. Migration `0019` indexes `member (organization_id, user_id)`; `0020` revokes matops_app's write access to the identity tables.
- **Q.4 Deletion + types.** **DONE.** `referral.dashboard` lost `metrics`, `referrerSummaries`, `plans`, `currentMonth`, `timeZone` and the per-student `plan` / `dues` (nothing read them since ADR 56), which also removed a join. Five copies of the academy-membership guard became one `requireMember`. `ParticipationRow` / `BulkMarkRow` use the existing domain unions; two `as unknown as` casts became `execute<T>()`. `Membership.role` / `.status` stay `string` on purpose: the columns are free text Better Auth also writes.

**Series verify:** typecheck 17/17 · lint 15/15 · `next build`. Router tests written (`template-edit.test.ts` added), **not run** under the session rule.

### v2.4 — Frontend review fixes (ADR 59)

**Exit test:** a crafted invite link changes nothing until the person presses Join, one rule has one home, and switching class in the attendance picker starts from a clean roster. **No migration; no new feature.**

- **V.1 Join link prefills.** **DONE.** `/join/[token]` auto-fired `membership.join` from the `?p=` blob on mount, and `joinPending` writes name and phone to the **global** `user` row. Both halves of that URL are public, so one link sent to a signed-in stranger renamed them everywhere and made them pending in the sender's academy, with no click. `?p=` is a prefill now; the signed-in branch renders the normal form filled in. ADR [59](issues/59-join-link-prefills-only.md). Spec: S2.
- **V.2 Dues match by id.** **DONE.** `membership.members` returned `planName` and no `planId`, so the O7 edit form matched the plan by name and fell back to `plans[0]`. An owner editing only the due date of a member on an archived plan, or on one of two plans with the same name, silently moved them to a different price. The read carries `planId`; an archived plan stays selectable for the member already on it, so a date-only edit does not force a plan change. Spec: O7.
- **V.3 Keyed roster + one class invalidation.** **DONE.** `<ClassRoster>` had no `key`, so React reused the instance across a class switch and "Mark N present" counted walk-ins ticked on the previous class. Keyed at all three mount sites. Marking a 30-person roster also fired 30 refetches of the 15-day `class.week` window (two correlated count subqueries per row); the `class` path is invalidated once, when the roster unmounts. Spec: O5.
- **V.4 One home per rule.** **DONE.** `capacityDisplay().isOver` had no caller outside its own test and was inlined at six sites; `attendanceCounts` and `bulkMarkTargets` were reimplemented in the roster; `DAY_LABELS` was copied; the mobile reminder lead was a second literal beside the server's `REMINDER_LEAD_MINUTES`; `spotsLeftLabel` / `clockParts` existed byte-for-byte in both clients. `packages/domain` gains `format.ts` and `grid.ts`, and the week grid and the printed poster now share one hour-slot rule so a gap on paper matches a gap on screen. The drift badge had already diverged (grey on O1, green on O4) and is one `DriftBadge`.
- **V.5 Mobile session hygiene.** **DONE.** `staleTime: 30_000` landed on a cache that neither sign-out nor magic-link verify ever cleared, and query keys carry no user id, so the next person to sign in on a shared phone could be served the previous one's academy and classes for half a minute. Both paths call `queryClient.clear()`. The Training tab's hand-rolled cancel (no `onError`, silent failure) uses `useCancelBooking`, and the local reminder store's read-modify-write is serialized.
- **V.6 Addressability + accessibility.** **DONE.** `/members` threw away its own query string on mount and two of its three tabs had no address; the tab is driven by `?tab=`. `Tabs` claimed `role="tablist"` with no `aria-controls`, panel ids, roving `tabIndex` or arrow keys — all four uses are plain view switches, so it is a labelled button group. The `Stat` delta read as a bare number (an `aria-label` on a generic `<span>`), the referrals dialog suppressed its own description, and the attendance class picker had no accessible name. The week grid's now-line no longer lands on the wrong row for an evening-only gym.

**Series verify:** typecheck 17/17 · lint 15/15 · `next build`. Domain tests added (`grid.test.ts`, `format.test.ts`, `booking.test.ts`), **not run** under the session rule. The mobile fixes (V.5) want a device pass.

### v2.5 — Coach workload & coverage (ADR 62)

**Exit test:** the owner sets a coach on a template, records a cover night on last Tuesday's class without any student getting a push, and reads each coach's classes led, time on the mat, and how much of it got marked. An instructor sees their own card and nobody else's. **No migration; no scheduler.**

- **K.0 `coach.ts` engine.** **DONE.** Pure, tested: `coachWorkload` / `coachWorkloadFor` / `coachBreakdown` / `coachWindowRange` / `COACH_WINDOWS` / `canReassignCoach` / `formatMatTime`. Led = not cancelled, not deleted, already ended; marked = at least one attendance mark; a visit is a `present` participation, so drop-ins never count and O10 always agrees with O5. **Averages divide by marked classes**, never by all led classes. `localDate` was private to `stats.ts` and moved to a shared `local-date.ts` rather than being copied. Refs: ADR 62, [39](issues/39-attendance-derived-stats.md).
- **K.1 Coach picker.** **DONE.** `class.instructor_id` has been `NOT NULL` since Phase 2, but both create paths defaulted to the acting user, no client sent the field, and the web never called `class.update` — the column held whoever typed the template in. A picker on the O3 template form and the O2 one-off form, fed by a new staff-tier `membership.instructors` (the owner-only `membership.staff` carries emails and returns `member.id`, where this needs `user.id`). `requireInstructor` guards all four write paths; the column has no FK and no RLS of its own, so nothing else stopped an arbitrary user id being written there. A departed coach stays selectable so opening an edit form never silently reassigns. Spec: O3, O10.
- **K.2 Cover night.** **DONE.** `class.setInstructor` behind a narrow `SetClassInstructorSchema`, so recording a cover cannot overwrite the title, capacity or time from a stale form. Permission is the pure `canReassignCoach`: any staff on a class that has not started, owner only once it has. `classChange` takes **`now`** (required, so the compiler forced the one existing call site to decide) and returns `historyOnly`, so correcting a finished class notifies nobody. The notify block moved out of `class.update` into a shared `notifyBookedOfChange`. The control lives on `ClassRoster`, which serves both the O5 screen and the O2 detail modal. Spec: O5, O10, §4.
- **K.3 Coach reads.** **DONE.** `stats.coaches` (owner, whole roster, name-ordered, departed coaches last and flagged) and `stats.coach` (staff; own card unless you are an owner). Two bounded reads on the RLS-scoped `ctx.db` covered by `cl_by_academy_start` / `cp_by_academy_class`, then the pure engine — read-time, no cache, the ADR 39 call. The window is a three-value enum, not a free range. New `packages/api/test/coach-stats.test.ts` (8 cases over real routers and real SQL on PGlite) covers attribution, cancelled-versus-led, cross-academy isolation and all three permission rules. Spec: O10.
- **K.4 O10 screen.** **DONE.** `/coaches`, staff nav item. Window switcher, one card per coach: classes led, time on the mat, students, average headcount, attendance marked, cancellations. Expanding loads which classes, by weekday, by week, and the classes-led list. **Name-ordered, never sorted by headcount** — that measures the timeslot, not the coach. When some classes are unmarked the card says so in a sentence, so a missing register is not read as a weak coach. Spec: O10.
- **K.5 O1 unmarked nudge.** **DROPPED — already built.** `needsAttendance` (`packages/domain/src/attendance.ts`) has driven the dashboard "Classes to mark" queue since v1.2, and its rule is better than the one drafted here: it skips classes nobody booked (an item that can never be cleared teaches an owner the queue lies) and partly-marked ones, and its window is shorter than the 14-day backfill so every item it reports is still markable. The duplicate `unmarkedClasses` written in K.0 was deleted rather than shipped. Refs: ADR 62 Consequences.

**Series verify:** typecheck 17/17 · lint 15/15 · **410 tests green** across five suites (domain 245, db 82, api 62, validators 18, notifications 3). Running them surfaced a pre-existing seam defect that had the api suite failing in 366s; it is fixed in the code, not the tests, under ADR [66](issues/66-identity-reads-run-on-the-tenant-transaction.md). `next build` **not run** (no `AUTH_SECRET` in this environment) and the screen has not been rendered in a browser.

### v2.6 — Settings splits by job (ADR 63)

**Exit test:** an owner adds a coach, invites a student, prints the check-in poster and edits the bank details without opening Settings once. **No API, permission, schema or migration change.**

- **L.1 Each control moves to the screen that uses it.** **DONE.** `Staff` (list + instructor invite link) renders at the bottom of `/coaches`, below the workload cards and behind an `isOwner` gate — instructors reach that screen for their own card, while `membership.staff` and both role mutations are owner-tier. The pending-coach queue stays on top: someone is waiting in it. The student `Invites` card sits above the `/members` tabs; `VenueCheckin` moved inside the **Drop-in leads** tab, since that poster is the only thing that creates a lead; `PaymentRequisites` became a fourth **Bank details** tab on `/payments`. Settings keeps the academy name and code. Spec: O4, O6, O7, O10.

**Series verify:** `pnpm -F @matops/nextjs typecheck` · `lint` green. `next build` **not run** (no `AUTH_SECRET` here); the moved screens have not been rendered in a browser.

### v2.7 — The instructor link grants the instructor role (ADR 64)

**Exit test:** an owner sends the instructor link to someone already waiting as a student, and approves them as a coach from the Coaches queue. A member who joined by academy code is switched to instructor from their member detail. **No migration.**

- **M.1 Newest link wins, while pending.** **DONE.** The idempotent branch of `createPendingMembership` returned early and kept the stale `invitedRole`, so an invited coach was approved as a student. A **pending** row now takes the role of the link just opened; an **active** row is still left alone, because re-roling an approved member is `membership.setRole`, not a link. `membership.join` already returned `{ status, alreadyMember }` and the join screen now reads it, so an already-active member is told to ask an owner instead of being promised an approval that is not coming. Spec: S1-S3, §4.
- **M.2 Two queues, two decisions.** **DONE.** One pure rule, `isPendingCoach` (pending **and** `invitedRole === "instructor"`), splits the list in the three places it appears: the Members requests tab is the student queue, pending coaches wait at the top of Coaches (owner-only), and the O1 dashboard carries "Pending approvals" and "Coach requests" as separate items pointing at the two screens. Approving a coach grants schedule and attendance tools, which is a staffing call, not a student one. Spec: O1, O4, O10.
- **T.1 The person, not the gym.** **DONE.** `/profile` reuses `account.updateProfile` unchanged — the same three fields, the same `UpdateProfileSchema`, the same read-only email the mobile S7 screen has always had. The route's `page.tsx` is a server component that reads the session and passes name / email / phone down, so there is no second session fetch and the web auth client still needs no `inferAdditionalFields`; a save calls `router.refresh()` so the sidebar name changes with the screen. Appearance and sign out sit here too and stay in the sidebar as well, because both are used from every screen. Spec: O11, S7.
- **T.2 Reached from the footer, not the nav.** **DONE.** The sidebar footer block (avatar, name, role) becomes the link, and the mobile top bar gains the same avatar — the phone tab bar already carries seven items for an owner. A route with no nav item, the O5 Attendance pattern. `listMembershipsForUser` selects Better Auth's own `member.created_at` and `academy.current` returns it as `joinedAt`, the one fact the "member since" line needed; no write, no migration. Not role-gated: a student on the web (ADR 57) has the same footer. Spec: O11, O6.

- **M.3 A role can be changed both ways.** **DONE.** `membership.demote` only stepped an owner down, so anyone who joined by code or by the student link was a student for good. It becomes **`setRole`**: same `ownerProcedure`, same locked never-ownerless transaction, input `InviteRoleSchema` so it sets `student` or `instructor` and can never grant `owner` (that stays `promote`). The member detail Overview gains the picker; Coaches → Staff calls the same procedure for "step down". Spec: O6.

**Series verify:** typecheck 17/17 · lint 15/15. `next build` **not run** (no `AUTH_SECRET` here). Domain tests cover `isPendingCoach`; the never-ownerless guard over the wider role set is covered by the existing `membership.test.ts` cases.

### v3.0 — In-app QR scan (ADR 70)

**Exit test:** a member standing at the gym door opens the app, taps **Scan**, points the phone at the poster, and is booked + marked present. No browser, no deep link. **No migration, no router change.**

- **X.1 The Scan tab.** **DONE.** A fourth tab whose only job is check-in: Schedule · My classes · **Scan** · Profile. This reverses ADR 45's three-tab rule, because the old member path cost four taps and a browser round trip through a custom-scheme hand-off that a browser is free to ignore (the same hand-off that already fails for Google sign-in). A tab, not a header button, because check-in is a moment with its own intent. Spec: S8.
- **X.2 The phone's own scanner, not ours.** **DONE.** `CameraView.launchScanner()` from **`expo-camera`** presents the OS sheet (`DataScannerViewController` on iOS 16+, the Google code scanner on Android), so there is no camera preview, overlay, or torch of ours to own untested. `CameraView.isModernBarcodeScannerAvailable` covers the phones that cannot present one (iOS 15, Android without Play Services): they are told to use their camera app on the poster, which is the old flow. Camera permission is asked on the first tap, and a permanent refusal shows a link to system settings. Spec: S8.
- **X.3 One pure parser, nothing else new.** **DONE.** `parseCheckInLink` (domain, tested) pulls the academy id out of the scanned string and returns `null` for anything else, including the gym's own `/join/<token>` invite poster. A regex rather than `new URL()`, because Hermes does not parse custom schemes. The poster, the URL it encodes, the public drop-in page, its "Open the app" deep link, `checkin.today` / `checkin.checkIn`, and the `checkin/[academyId]` screen are all untouched. Spec: S8, §4.

**Series verify:** `@matops/expo` typecheck + lint green; repo typecheck 17/17 · lint 15/15. **Not verifiable here:** `expo-camera` is a native module and a camera never works in the iOS Simulator, so the scan itself needs a real phone. Queued in `docs/mobile-device-test.md`.

### v3.1 — A pinned map link for the academy (ADR 71)

**Exit test:** an owner pastes their Google Maps pin into Settings, checks it with the live preview, and a member tapping the address on Profile lands on that exact pin. **Migration `0022`.**

- **W.1 One nullable column, one pure rule.** **DONE.** `0022` adds `organization.map_url`. `academyMapUrl(address, mapUrl)` in `@matops/domain` returns the pinned link when there is one and falls back to the Google search URL built from the address, so every surface reads one rule. Spec: O6, S7.
- **W.2 The value is an href, so the host list is closed.** **DONE.** `MapUrlSchema` narrows `HttpUrlSchema` to a fixed list of map hosts (`maps.google.com`, `maps.app.goo.gl`, `maps.apple.com`, `openstreetmap.org`, `osm.org`, `waze.com`, and `google.com` only under `/maps`). The host comes from `new URL()`, not a regex: a browser reads a backslash in the authority as a path separator, so a regex host group can be pointed at the wrong host. Spec: O6, §4.
- **W.3 Both clients open the pin.** **DONE.** The web Settings card gains the input plus a live **Check the pin ↗** preview built from the same helper; the mobile Profile opens the pinned link directly and falls back to `maps://` / `geo:` so the tap reaches the phone's own map app. Spec: O6, S7.

**Series verify:** typecheck 17/17 · lint 15/15. `next build` not run for this wave. Migration `0022` applied to Neon (checked 2026-08-22).

### v3.2 — The student web reaches parity (ADR 73)

**Exit test:** a student signed in on the web has the app's four jobs minus Scan — books from the week, opens a class and sees who's on it, reads their own training on My classes, pays their dues and taps "I paid", and reads their rank on Profile — all inside the same shell an owner uses. **No migration, no new procedure, no new domain rule.**

- **Y.1 The shell carries a student.** **DONE.** Both nav blocks were wrapped in `items.length > 1` and a student qualified for exactly one item, so the sidebar and the bottom tab bar were built and switched off. Four student items (Schedule `/` · My classes `/training` · Dues `/payments` · Profile `/profile`) turn them on with no new chrome. The pending banner, the avatar link, the theme toggle and sign out already rendered for a student and did not change. The switcher also moves from `academy.listMine` to `academy.memberships`: `isWebLensMembership` filters to owner / instructor, so a student in two gyms saw no switcher at all, while the ADR 49 post-login gate offered them both. Owner and instructor nav is unchanged. Spec: S4, S11.
- **Y.2 My classes on the web.** **DONE.** New `/training`: the next-class card, the My Training stats card, Upcoming with Cancel, and a read-only Past list. Reads `booking.mine` + `stats.me` and divides them with the same pure `splitMyClasses` / `nextClass` / `lastClassLabel` the Expo tab calls, so the two clients cannot drift. Past is uncapped, and a class the gym cancelled carries no Cancel button, matching S4 and the app. Suspended members get the §4 calm notice and the query is not sent. Spec: S6.
- **Y.3 Class detail on the web.** **DONE.** New `/class/[id]`, the first dynamic route under `(app)/`, reached from any schedule or My-classes row. `class.get` + `class.attendees`, the same `capacityDisplay` label, the same soft-capacity "book anyway?" confirm, a class that already started says so rather than showing nothing, and the ADR 55 who's-in rule unchanged (names for an approved viewer, counts plus a reason for a pending one). Open to every role, since the procedures are `enrolledProcedure`. Spec: S5.
- **Y.4 Dues on the web.** **DONE.** `/payments` branches on role instead of gaining a second route: an owner gets O7, everyone else gets their own dues (amount, status, plan, next due, bank details and reference with the existing `CopyButton`, and **I paid** behind a confirm). This also closes a live defect: a student who typed `/payments` used to get a screen of failed owner queries. `payments.myDues` is a `memberProcedure`, so a **pending** member has the tab hidden and the page explains rather than erroring. Spec: S9, O7.
- **Y.5 Rank, address and the overdue strip.** **DONE.** `/profile` gains **My rank** (`rank.mine`, `formatRank` + `disciplineLabel`, plus the last five promotions) and the academy's address with an **Open in maps** link built by the same `academyMapUrl` the owner previews in Settings (ADR 71). The **S11 overdue strip** lands in the shell under the pending banner, so it follows a student across every screen; it is gated on `isActiveMember`, because `payments.myDues` is a `memberProcedure` and refuses a suspended member; it self-clears on the next refetch after the owner confirms a payment, and it matters more here than on the phone because the web has no push and no local reminders (ADR 46, ADR 54). Spec: S7, S11.

**Series verify:** typecheck 17/17 · lint 15/15 · `next build` green, the first since v2.4, with `/training` and `/class/[id]` in the route table. Tests **not run** under the session rule; the one rule that moved into `packages/domain` (`lastClassLabel`, previously copied in both clients) carries a case in `stats.test.ts`. The screens have not been walked through in a browser here — that is the `pilot-plan.md` dry run.

### v3.3 — Web shell seams (ADR 74)

**Exit test:** a screen under `AppShell` reads the academy without a loading branch, book and cancel invalidate the same thing wherever they are called, a role that cannot open a page is told so instead of shown failed queries, and the day bucketing and the dues words exist once for both clients. **Refactor only: no migration, no procedure, no screen redesigned.**

- **Q.1 The academy is context.** **DONE.** `AppShell` resolves `academy.current` and already refuses to render a child until it is a real membership, but thirteen screens asked again and re-wrote the loading / failed / none triple around a value that could not be null. `_components/academy.tsx` provides it once; `useAcademy()` returns a non-null membership and throws if called outside the shell. Spec: unchanged.
- **Q.2 Book and cancel are one hook.** **DONE.** Three screens had copied the mutation pair and two invalidated different query paths, so a booking made on one could leave the other stale. `_components/use-booking.ts` owns the pair, the invalidation set (`class` + `booking`) and `busyFor(classId)`, mirroring the Expo `book-control.tsx`. Spec: S4, S5, S6.
- **Q.3 One access table.** **DONE.** `_components/routes.ts` lists the owner-only (`/members`, `/referrals`, `/settings`) and staff-only (`/schedule`, `/coaches`, `/attendance`) paths. The sidebar asks it what to show and the shell asks it whether to render at all, so an instructor who types `/members` gets `NoAccessState` rather than a screen of refused queries. The tRPC tier is still the guard. Spec: §3 role split.
- **Q.4 One place for dates.** **DONE.** 24 `Intl.DateTimeFormat` instances across 14 screens became 12 named exports in `~/lib/format.ts` (the poster keeps its own, pinned to `en-GB`), which re-exports the shared `@matops/domain` rules, the arrangement `apps/expo/src/utils/format.ts` has had since v1.8. Spec: unchanged.
- **Q.5 Three rules move down.** **DONE.** `dayKey` and `groupByDay` (the same local-day bucketing loop in the staff schedule, the student schedule and the Expo schedule) and `PAYMENT_STATUS_LABEL` (the dues words, spelled out separately in each client) now live in `@matops/domain`, with tests for the first two. Spec: S4, S9.

**Series verify:** typecheck 17/17 · lint 15/15 · `next build` green · `pnpm test` **456 green** (domain 275 · db 82 · api 72 · validators 24 · notifications 3), including the six new `dayKey` / `groupByDay` cases in `packages/domain/test/format.test.ts`.

### v3.9 — Loading states (ADR 80)

**Exit test:** clicking Members draws the Members screen's own shape before its data arrives, and that shape does not move when the data lands; a cold open weaves the mark rather than drawing grey bars; a wait under 180ms shows nothing at all; reduced motion leaves everything still. **Web only: no migration, no procedure, no screen redesigned.**

- **L.1 The loader.** **DONE.** `_components/mat-loader.tsx` splits the `@matops/ui/logo` seam path into its six planks and draws each on with `stroke-dashoffset`, staggered 90ms in weave order: the two long centre seams, then the four short ones. Same tile, same violet, same 85% seam opacity, so nothing new enters the identity. The keyframes sit in `app/styles.css` beside the blueprint motifs, since NativeWind never has to parse them. `animation-fill-mode: backwards` on a 180ms delay means a boot that resolves faster shows nothing, because a loader that flashes for one frame is worse than no loader. The label is a prop and says what is happening (`Opening your academy`), not `Loading…`. Reduced motion stops the weave and leaves the mark whole. Spec: §3 states.
- **L.2 One skeleton vocabulary, cut from the real shapes.** **DONE.** `_components/skeletons.tsx` builds each piece out of the component it replaces: `SkeletonRow` uses `cardClass()`, `SkeletonSection` draws `Section`'s real hairlines around a placeholder label, `SkeletonQueue` is the O1 tile geometry, `SkeletonWeekGrid` is the O2 column template and its 64px hour rows, `SkeletonCoachCards` is the five-number grid. Structural lines are drawn for real and do not pulse: they are not the unknown part. All 32 `SkeletonRows` call sites moved to a shape that matches what follows, and the two hand-rolled pulses in `dashboard-screen.tsx` became `SkeletonQueue` and `Bar`. `states.tsx` is the empty / failed / no-access half now. Spec: §3 states.
- **L.3 A route change draws the screen, not a hole.** **DONE.** No route under `(app)/` had a `loading.tsx`, so a click held the old screen and swapped the page whole. Twelve routes have one, and each renders the same component the screen's own `isPending` branch renders, so the placeholder appears once and is replaced once. `/` and `/payments` stay deliberately vague: the first is the dashboard or the student week, the second is claims or dues, and `loading.tsx` runs before the shell mounts and knows no role, so both draw only what the two versions share rather than tabs a student never gets. Spec: §3 states.
- **L.4 The boot is not a skeleton.** **DONE.** `AppShell` resolves the academy before it renders anything and the answer is either the shell or the academy gate, which share no chrome, so the old five-bar skeleton was a guess that was wrong for every new member. Both draw the loader. Spec: §3 states.

- **L.5 The phone gate.** **DONE.** `components/mat-loader.tsx` is the same mark and the same 1900ms weave, drawn the way the phone already draws the mark: positioned Views, no SVG dependency (ADR 44). Each seam scales from the end it starts at (`transformOrigin` + `scaleX` / `scaleY`) on the native driver, 90ms apart, behind the same 180ms anti-flash delay. `Loading` in `ui.tsx` now renders it, so all six gates that already called it took it with no call-site change; the three with something nameable to say pass a `label` (`Opening your academy`, `Signing you in`, `Opening your invite`). Spec: §3 states.
- **L.6 The phone skeletons.** **DONE.** `components/skeletons.tsx` mirrors the web file, cut from the real native shapes: the class row keeps the discipline rail, the 48px time column and the row button; the day rule keeps its real hairlines; the stats card is a 22px numeral over its eyebrow. Eight screens moved off the spinner — the week, my classes, the notification feed, class detail, dues, rank, the training card and the walk-in check-in list. One `Animated` pulse for the app, ref-counted so nothing loops while nothing is on screen, and one shared `reduce motion` subscription rather than one per bar. Spec: S4, S5, S6, S7, S9, S13.
- **L.7 One spinner job left.** **DONE.** After the pass `InlineLoading`'s only caller was the onboarding gym search, where the **Find gym** button already spins for that same fetch. The duplicate went and the export with it. A spinner still belongs on an action in flight — `Button` owns that. Spec: unchanged.

**Series verify:** typecheck 17/17 · lint 15/15 · `next build` green, all twelve routes in the list, the keyframes and both classes present in the emitted CSS with the reduced-motion utility winning the cascade. No test change: the whole wave is presentation. **Neither client has been seen running** — no browser extension and no simulator in the build env, so the weave timing, the native `transformOrigin` scaling, and each skeleton's fit to the screen behind it want an eyeball pass (`docs/mobile-device-test.md`).

### v3.5 — A daily cron, off the host (ADR 75)

**Exit test:** a member who is three days from their due date gets one push + email at 09:00 Lisbon without anyone at the gym doing anything, and gets exactly one that period. No class reminder is sent by the server. **No migration, no domain change, no screen.**

- **C.1 One scheduled job.** **DONE.** `.github/workflows/cron.yml` curls `/api/cron/remind` once a day at **09:00 in Lisbon**, the pilot's zone, with the existing `CRON_SECRET` bearer token. GitHub cron is UTC-only and Portugal moves between UTC+0 and UTC+1, so both hours are scheduled and one guard line keeps whichever tick is 09:00 local; a skipped tick exits 0, so a red run always means the sweep failed. `/api/cron/materialize` is **not** scheduled (ADR 79): the class horizon is the owner's **Rebuild schedule** button, six months at a time. The schedule read no longer materializes. `CRON_SECRET` is the only repo secret; the production URL sits in the workflow, since a domain is public. `curl -fsS` fails the workflow on a bad sweep, which is free monitoring. The scheduler is **not the host**, so Vercel Cron stays removed (ADR 46) and nothing is host-locked. **Daily is a Neon constraint:** Neon Free sleeps after 5 min idle on ~100 compute-hours/month, so each ping buys ≥5 min of compute and a 15-min cadence would keep the database awake (~730 h/month) until it hard-suspends.
- **C.2 Dues only.** **DONE.** The route passes `runReminderSweep({ leadMinutes: 0 })`, which empties the class claim window (`startsAt > now AND startsAt <= now`), so **no class is claimed and none is stamped** — switching it on later loses nothing. The dues half runs for real: one message per member per billing period, due-soon (3 days) or overdue, never a second time in the same period. Class reminders stay on the device (ADR 54): their benefit is fewer no-shows, which v1 does not track, and a daily tick would reach only the classes inside the 2h lead window. Spec: §4, O7 R.1.

**Series verify:** typecheck 17/17 · lint 15/15. No test change — the sweeps' own tests are unchanged and pass `leadMinutes` explicitly.

### v3.7 — The notification center (ADR 77)

**Exit test:** a student whose class is cancelled finds the notice on `/notifications` with push turned off; an owner posts "No class Friday" to students, the button says how many that is, and every one of them has it within a poll; the owner sees their own copy. **Migration `0023`; no scheduler change.** T.6 brings the phone in: same feed, reached from a header bell instead of a tab.

- **T.1 The table.** **DONE.** `notification` (one row per recipient per event: `kind`, `title`, `body`, `link`, `sent_by`, `read_at`), academy-scoped with the standard isolation policy (`DELETE` comes from `0001`'s default privileges; no procedure deletes a row). `insertNotifications` runs on the base connection, because its callers do. `announcementRecipients` + `NOTIFICATION_KIND_LABEL` + `buildAnnouncementMessage` in `@matops/domain`. Spec: S13, O12.
- **T.2 Every event lands in the inbox.** **DONE.** `deliver()` writes the row in its own `try` **before** it pushes, so a dead token cannot cost the member the message; all five existing kinds gained an entry with no new call sites. `DueDuesReminder` grew an `academyId` so the daily dues sweep can address the row. Router: `list` (50, no cursor), `unreadCount`, `markAllRead`, each narrowed to the caller's own user id on top of the academy policy. Spec: §4.
- **T.3 The center on web.** **DONE.** `(app)/notifications` groups the feed by local day with the shared `groupByDay`, dots the unread rows, marks the feed read once per visit (dots kept for that render), and opens `link` on tap. Nav item with the unread badge, using the badge pattern the Members and Payments items already had. Open to every active member — no `routes.ts` entry. Spec: S13.
- **T.4 Announcements.** **DONE.** `announce` on `staffProcedure` behind `AnnounceSchema` (sanitized, title ≤ 80, body ≤ 1000), fanned out through the pure audience rule to active members only. Owners and instructors can both post; the sender's display name is copied onto every row it writes (`sent_by`, migration `0024`) and shown on the feed. The compose box sits above the feed and its button names the reach (`Post to 34`) from `audienceCounts`, the same function that picks the recipients. The sender's own copy is included. Spec: O12.
- **T.5 One delivery choice.** **DROPPED (v3.8).** matops has no mail layouts, so no gym message is emailed at all: the feed plus push is the whole delivery, and a preference with nothing to switch went with it. `notification_pref`, the `/profile` switch, and the "Also send as email" tick are gone. Email carries the sign-in magic link only. Spec: S13, O12, §4.

- **T.6 The feed on the phone.** **DONE.** `apps/expo/src/app/notifications.tsx` is the web screen minus the compose box: the same `groupByDay` day rules, unread dots and mark-read-once effect. It is a pushed screen, not a fifth tab, reached from a **bell in the Schedule and My classes headers** that carries a red dot while anything is unread (`components/notification-bell.tsx`). The bell hides until the membership is active, because the feed is `memberProcedure`. Only a `/class/<id>` row is tappable: `/payments` has no mobile route. The web's mobile top bar gets the same bell and drops Notifications from its bottom tabs; the desktop sidebar keeps the item. Spec: S13.

- **T.7 The phone header.** **DONE.** `components/app-header.tsx` gives every tab screen the same bar the web mobile shell has: mark, academy name, then the bell (and the settings control on Profile). `Screen` gained a `header` slot so the bar sits outside the screen padding, full-bleed on `--card` with a hairline; the screen title moved below it into the content, matching the web's `PageHeader`. The bell and settings emoji are gone: `components/icons.tsx` redraws the web shell's own glyphs with positioned Views at the same stroke weight, the way the tab icons are drawn. Spec: S7, S13.

**Series verify:** typecheck 17/17 · lint 15/15 · `next build` green (`/notifications` in the route list). Tests written, not run in-session (per the working rule): the `notification-rls` leak suite in `packages/db/test`, the router suite in `packages/api/test/notification.test.ts` (feed scoping, unread counts, mark-read isolation, owner-only announce, audience counts, sanitization, the preference round trip) and the audience + message cases in `packages/domain/test/notify.test.ts`. **Migration `0023` is applied to Neon** (checked 2026-08-22: 24 migration rows, RLS on both tables, both policies live).

## Parked — next iteration (do NOT build in v1)

Promote to a slice only on purpose (an ADR or a new roadmap row).

- **Capacity hygiene:** hard caps, booking priority, waitlists, no-show tracking, cancel cut-offs. (tickets 22, 13)
- **Home widget:** ~~parked~~ **promoted to v1.3 R.2** (S10) — still a native fast-follow, off the launch critical path. (ticket 27, ADR 40 plan)
- **Live UI:** SSE + Postgres LISTEN/NOTIFY via a separate always-on worker. (tickets 04, 15, 17)
- **Card billing:** payment **processor / auto-subscription / Stripe**, invoicing, multi-currency tax. _(Manual-transfer dues are **promoted to v1.3** — ADR 40; only the card/recurring layer stays parked.)_ Researched and written up as a parked, ready-to-build wave (6 slices, P.4-P.9): [card-billing-plan.md](card-billing-plan.md). Promoting it needs ADR 72 + new rows here, and the gates listed in that file.
- **Deferred domains:** ~~belts/rank~~ (**promoted to v1.4** — ADR 41; only owner-defined **custom rank ladders** + **bulk** promotion stay parked), ~~announcements~~ (**promoted to v3.7** — ADR 77; **DMs, replies and per-kind preferences** stay parked), curriculum, cross-academy franchise views, i18n, super-admin. (map "out of scope")

Each is additive by design (new schema file + router + pure logic; the tenant seam is untouched) — architecture.md §8.
