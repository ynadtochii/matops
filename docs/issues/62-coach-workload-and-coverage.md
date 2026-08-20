# 62 · Coach workload and coverage — attribution first, then the numbers

_(v2.5, spec **O10**. Builds on the attendance-derived stats engine of ADR [39](39-attendance-derived-stats.md), the role split of ADR [38](38-app-navigation-shells.md) extended by ADR [52](52-internal-referral-tracking.md), and the class edit rules of spec §4. No migration.)_

## Context

Owners asked for a screen showing what each coach does: how many classes they led, which classes, how many people came. Three different jobs hide behind that request. An owner wants to know who is carrying the week (pay and fairness) and which classes are running unstaffed or unmarked (coverage). A coach wants to see their own month.

A fourth reading, ranking coaches by headcount, is the one people ask for first and the one that should not be built. Attendance follows the timeslot, not the coach: a Tuesday 07:00 class loses to a Wednesday 19:00 class whoever teaches it. In a five-person gym a leaderboard built on that reads as a performance review made of noise, and it is expensive to walk back.

**The blocker found before any of it could ship.** `class.instructor_id` and `class_template.instructor_id` have existed since Phase 2 and are `NOT NULL`, but nothing set them on purpose. `template.create` and `class.create` both fell back to `input.instructorId ?? ctx.session.user.id`, no client ever sent the field, and `class.update` (which accepts an instructor change) was never called by the web at all. The column recorded who typed the template in, not who taught. Reporting on it unchanged would have produced confident wrong numbers, and the first coach to read them would have stopped trusting the product.

The column also had no foreign key and no RLS of its own, so any staff member could have written an arbitrary user id into it.

## Decision

### Fix attribution before reporting on it

Two client changes and one guard, no schema change:

- A **coach picker** on the recurring template form and the one-off class form, sourced from a new `membership.instructors` read. It defaults to the acting staff member, which is the old implicit behavior made visible.
- A **"change the coach for this class"** control on every class roster, so a cover night can be recorded. The roster is shared by the O5 attendance screen and the O2 class detail modal, so one control serves both.
- `requireInstructor(ctx, userId)` in `packages/api/src/members.ts` asserts the target is an **active owner or instructor of the caller's academy**, wired into all four write paths. It runs only when the value actually changes, so an unchanged edit never fails on a coach who has since left.

`membership.instructors` is deliberately not the existing owner-only `membership.staff`: that one carries emails and returns `member.id`, while `instructor_id` is a `user.id` and the picker is opened by every staff member.

### Credit is automatic and read-time

A class counts for whoever sits in its `instructor_id` when the screen loads. There is no confirmation step and no separate "did you teach this" mark. A template's coach cascades to every class it generates; a one-off carries the coach picked on the form; a template edit propagates to future non-cancelled instances only, so past classes keep the coach who taught them.

Because credit follows the current value, **reassigning a past class moves its history**. That is the same rule ADR 52 chose for referral corrections, and it is the point: correcting who taught last Tuesday should correct last Tuesday's figures. The O10 card says so in words rather than leaving an owner to discover it.

### Who may reassign

`canReassignCoach(membership, classStartsAt, now)`, pure and tested:

| When                  | Who may change the coach |
| --------------------- | ------------------------ |
| class has not started | any active staff member  |
| class already started | owner only               |

Scheduling is already a staff job, so an instructor setting the coach on next Tuesday needs no owner. Once a class has started the field is reported history, and rewriting it is an owner action. This mirrors ADR 52, where any staff member records a referral but only an owner corrects one. A class starting exactly now counts as history.

**No audit trail in v1.** Referrals carry one because credit and money hang off them. Here the class row is the single source of truth and the gym is small. A `class_instructor_audit` table is the named upgrade path if an owner ever disputes a past month.

### A past-class edit notifies nobody

`classChange` decided whether to push "your class changed" from the fields alone, so correcting who taught a finished class would have notified every student who booked it. It now takes `now` and returns `historyOnly`: when both the old and the new start are in the past, `shouldNotify` is false. `now` is **required**, not optional, so the compiler forced the existing call site to decide rather than letting the old behavior survive by default.

An edit that moves a class across `now` in either direction still notifies, because the student can still act on it.

### Definitions, fixed in one place

`packages/domain/src/coach.ts` is pure and holds every rule:

- **Led** — not cancelled, not soft-deleted, and already **ended** (`starts_at + duration <= now`).
- **Marked** — the class carries at least one attendance mark, present or absent.
- **Visit** — a `present` participation, the same basis as ADR 39 and the roster `visitCount`, so O10 never disagrees with O5. **Drop-ins are not visits**: they have no participation row. Counting them would make the coach headcount the only number in the product that disagrees with every other one.
- **Average headcount** — visits divided by **marked** classes, never by all led classes. A gym that forgets to mark would otherwise watch every coach's headcount decay toward zero, which reads as a broken screen rather than a missing mark.
- **Marked rate** — marked divided by led. It sits beside the average so the gap is visible, and the card spells it out in a sentence when it is below 100%.

Windows are the three fixed keys `this_month` / `last_month` / `last_90_days` (`COACH_WINDOWS`), resolved in the **academy** zone with the shared `localDate` helper. That helper was private to `stats.ts` and moved to `packages/domain/src/local-date.ts` so both stat engines draw boundaries identically. An enum rather than a free date range keeps the read bounded and stops the two sides disagreeing about where a month starts.

### The screen shows workload and coverage, never a ranking

`stats.coaches` (owner) returns every coach **name-ordered**, and the screen does not re-sort. Headcount is shown and is never the sort key. `stats.coach` (staff) returns one coach with the breakdown behind it: omit the id for your own, and only an owner may name someone else. An instructor therefore sees their own card and nobody else's, which keeps the screen closer to recognition than to review.

A coach who has left the roster still gets a row, flagged `onStaff: false` and listed last. Dropping them would make the per-coach figures stop adding up to the gym's.

### Read-time compute, no cache

Two bounded queries on the RLS-scoped `ctx.db`, covered by `cl_by_academy_start` and `cp_by_academy_class`, then the pure engine. At pilot scale (roughly 1,500 classes and 15,000 participations a year) this is well inside budget. Caching stays a deferred optimization, the same call ADR 39 made.

## Consequences

- Attribution is true **going forward only**. Every template and class created before this wave still points at whoever created it. The default window is "this month" so the screen fills with real data from the start, and the empty state says why early history is thin.
- A gym that never marks attendance sees a low marked rate and no headcounts. The O1 "Classes to mark" queue is the fix, and the card leads with classes led and time on the mat, which are true regardless.
- Reassigning a past class changes a number an owner may already have acted on. Mitigated by the owner-only rule and by naming the behavior on the screen, not by blocking it.
- **Considered and rejected: a `class_instructor` join table** for head coach plus assistant. It is honest for larger gyms, needs a migration, and touches every schedule read. The single `instructor_id` is the deliberate v1 choice and this is the named upgrade path.
- **Considered and rejected: an O1 nudge for unmarked classes.** It was planned as part of this wave and turned out to already exist. `needsAttendance` (`packages/domain/src/attendance.ts`) has driven the dashboard "Classes to mark" queue since v1.2, and its rule is better: it skips classes nobody booked (an item that can never be cleared teaches an owner the queue lies) and partly-marked ones (leaving no-shows unmarked is how coaches work), and its window is shorter than the backfill so every item it reports is still markable. A second definition of "unmarked" was written for this wave and deleted rather than shipped.
- **Parked:** money of any kind (hourly rate, pay owed, payroll periods), retention per coach (meaningless at gym scale), CSV export, notes written per coach (turns workload into monitoring), and a per-slot fair comparison of a coach against the academy average for the same class title.
- Verified by the pure tests in `packages/domain/test/coach.test.ts` and the router tests in `packages/api/test/coach-stats.test.ts`, which drive the real routers and real SQL over PGlite: attribution, the cancelled-versus-led split, cross-academy isolation, and all three permission rules.
