# 39 · Attendance-derived stats — per-academy, read-time, one pure engine

*(v1.2 "Personal & Insight" foundation, plan `.scratch/v1.2/plan.md`. Builds on the Phase-3 booking/attendance schema and the roster `visitCount` — [08](08-data-model.md), [22](22-provisional-booking-capacity.md). Reference only, not borrowed as-is: MAT's cached `users.stats` + refresh cron.)*

## Context

v1.2 adds personal and gym-level numbers on top of data matops already stores: the student "My Training" card (B.1), the owner gym-insights + "who's drifting" widget (C.1), and the tabbed member detail (C.2). No new domain, no migration, no cron. The open questions were: what counts as a training "session", which academy the numbers belong to, where the math lives, and how time-window boundaries are drawn.

## Decision

### A session = one attended participation, scoped to the active academy
A "session" is a `class_participation` row with `attendance_status = 'present'`, joined to its `class` for the start instant, title, and discipline. A booking without a present mark does **not** count. This is the exact basis the roster's `visitCount` already uses (`membership.ts` roster resolver), so the two never disagree.

All stats are **per-academy**. Every read runs on `ctx.db` — the RLS transaction scoped to the active academy — so "total sessions" means sessions at the currently-active academy, not a lifetime figure across gyms. This matches the tenant seam ([33](33-tenant-seam-enforcement.md)) and keeps the numbers explainable ("this is your training *here*"). A member who trains at two gyms sees two independent counts, one per active academy.

### One shared pure engine — `packages/domain/src/stats.ts`
All the math is pure (no I/O, no clock read) and lives in one module, tested in isolation (`packages/domain/test/stats.test.ts`, 20 cases). It powers every surface:

- `trainingStats(sessions, now, tz)` → `{ total, thisMonth, streakWeeks, favoriteDiscipline, favoriteWeekday, daysSinceLastClass }` — the student card (B.1) and the member-detail totals (C.2).
- `classifyDrift(lastAttendanceDate, now)` → `active | cooling | at_risk | dormant` — the drift signal (C.1, C.2).
- `gymInsights(marked, now, tz)` → `{ visitsThisWeek, visitsThisMonth, attendanceRate, busiest, byWeekday }` — the owner dashboard (C.1).
- `splitMyClasses(rows, now)` and `nextClass(upcoming, now)` — the mobile Training tab + next-class card (B.2).

Read-time compute (not a cached aggregate) is fine at v1.2 scale and avoids the cron and denormalization MAT carried. Reconciliation/caching stays a deferred optimization.

### Boundaries in the academy time zone; weeks start Sunday
`class.starts_at` is a UTC instant; each academy carries an IANA zone. Week and month boundaries are computed in that **academy zone** (passed into the pure function), never a per-user zone — keeping the "no per-user tz" rule (spec §4). The projection reuses the `materialize.ts` idiom: `Intl.DateTimeFormat("en-CA", { timeZone })` to read local Y/M/D, then plain calendar arithmetic on those parts (DST-safe — we only index whole days). Weeks are **Sunday-aligned**, matching `DAY_LABELS` (0 = Sun).

**Streak** = consecutive Sunday-start weeks ending at the most recent attended week. It stays alive only if that latest week is *this* week or *last* week; an older latest week means it already broke (result 0). A mid-week gap never breaks a week — one session anywhere in the week keeps it.

### Drift thresholds (days since last attended)
Constants in `stats.ts`, exported as `DRIFT_THRESHOLDS`, so API and both clients agree:

| Band | Days since last session |
|---|---|
| `active` | ≤ 7 |
| `cooling` | 8–13 |
| `at_risk` | 14–27 |
| `dormant` | 28+ (or never attended) |

### Attendance rate is optional by design
`attendanceRate = present ÷ (present + absent)`, returned as `null` when there are **no absent marks**. Many gyms never mark absent, which would force a meaningless 100%. The UI leads with counts and shows the rate only when it means something.

## Consequences

- One tested engine, four surfaces — a change to the streak rule or a threshold is one edit + one test file.
- Numbers are academy-local and attendance-based, so they always reconcile with `visitCount` and the attendance screen.
- Verified by the domain unit tests (pure logic first, per delivery.md §5). Live/device verification of the client cards rides with each B/C slice.
- Deferred: cached `users.stats` + refresh cron (an optimization, not needed yet); richer profile fields; the audit-log activity tab on member detail (needs a new domain).
