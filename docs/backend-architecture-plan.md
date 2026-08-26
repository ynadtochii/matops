# Backend architecture plan — restructure before public testing

**Status: this is a proposed plan, nothing is scheduled.** It is scoped to the
backend: `packages/api`, `packages/db`, `packages/domain`, `packages/validators`,
`packages/notifications`, and the client-to-API layer. It does not cover UI work.
The frontend performance work lives in its own branch and its own doc.

Written 2026-08-24 against `main` at commit `0243e23`.

| | |
|---|---|
| **Why now** | Nothing is in front of strangers yet. Every change below is cheaper today than after three gyms depend on the behaviour. |
| **Trigger** | The pilot in [pilot-plan.md](pilot-plan.md): two or three friends' academies, nobody from matops in the room. |
| **Scope** | 17 work items in three waves. Wave 1 is safety and should land before the pilot. |
| **Non-goal** | Changing the architecture. The model is right. This fixes drift from it. |
| **How to run it** | [backend-architecture-epic.md](backend-architecture-epic.md) turns this into a checklist with phase gates, driven by `/loop /epic`. |

---

## The verdict first

The stack pattern matops picked is the one the field converged on for
tRPC v11 + Drizzle + Postgres RLS + Turborepo: **thin routers, pure rules in a
separate package, the tenant filter pushed into the database, and no repository
layer over the ORM.** That is what the code already is. The tiered procedure
builders, the two-handle split, and the one-transaction tenant seam are the
clearest parts of the codebase.

So this plan proposes no new layers, no service classes, no dependency-injection
container, and no repository abstraction. It has three jobs:

1. Close four ways the system can fail silently in front of a stranger.
2. Move duplicated queries and stray business rules to where the existing
   pattern already says they belong.
3. Cover the 46 procedures nobody tests.

Scale, for context. `packages/api` is 5,125 lines across 104 procedures.
`packages/domain` is 2,265 lines. 23 tables, 27 migrations. The codebase is small.
That is why this is cheap.

### What this plan will not touch

- The tenant seam design: one transaction, one `set_config`, policy on the GUC.
- Drizzle queries written directly in resolvers.
- `packages/domain` as pure framework-free rules. Item 8 is about rules that
  never arrived there, not about the package.
- The `ctx.db` versus `ctx.baseDb` split and the lint rule behind it.
- The non-streaming batch link (ADR 83). It costs latency and buys correct cookies.
- The tiered procedures: `enrolled` / `member` / `staff` / `owner`.

---

## Wave 1 — safety. Land before the pilot.

Six items. Roughly two days total.

### 1. Make the tenant transaction roll back when a resolver throws

**Problem.** `enforceTenant` hands `next()` to `withTenant`, which is a Drizzle
transaction. tRPC's middleware dispatcher never rethrows. It catches the resolver
error and returns a value:

```js
} catch (cause) {
  return { ok: false, error: getTRPCErrorFromUnknown(cause), marker: middlewareMarker };
}
```

(`@trpc/server@11.18.0`, `dist/initTRPC-BRf4imah.mjs:269-275`, read directly.)

So the callback resolves normally even when the resolver threw, and Postgres
commits. A resolver that writes through `ctx.db` and then throws a `TRPCError`
commits the write and reports failure to the client.

No resolver loses data today. Every write-then-throw site follows the same safe
shape: the write matched zero rows, so the throw reports "not found" and there is
nothing to undo (`attendance.ts:88,102` · `template.ts:177,184` ·
`template.ts:204,211` · `class.ts:334,348` · `class.ts:386,393` ·
`class.ts:410,425`). Database-level failures are also fine, because an aborted
Postgres transaction turns COMMIT into ROLLBACK.

The risk is that the seam does not do what the docs say it does.
`docs/issues/13-booking-write-atomicity.md:67` states that "a failed capacity
claim rolls back the participation change". That holds for database errors only.
The first resolver that writes successfully and then throws a validation error
will corrupt data quietly, written by someone who read ADR 13 and believed they
were covered.

**Change.** Inside the `withTenant` callback, throw a private marker when
`result.ok` is false. Catch it immediately outside and return the original
result. Roughly six lines in `packages/api/src/trpc.ts:252-278`.

**Files.** `packages/api/src/trpc.ts`. Append an amendment to
`docs/issues/13-booking-write-atomicity.md` stating what is actually guaranteed.

**Done when.** A test in `packages/api/test` writes a row through `ctx.db`, throws
a `TRPCError`, and asserts the row is absent afterwards.

**Effort.** 1 hour.

### 2. Add a structural RLS guard test

**Problem.** Adding a tenant table takes four steps. Step three is hand-writing
`ENABLE ROW LEVEL SECURITY` plus the policy into the generated SQL. Drizzle does
not model policies, so `drizzle-kit generate` never emits them, and
`drizzle-kit check` (the only migration gate in CI, `.github/workflows/ci.yml:77-78`)
validates the journal, not the policy.

Meanwhile `migrations/0001_tenant_rls.sql:29-30` sets
`ALTER DEFAULT PRIVILEGES ... GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO matops_app`.
So a new table is readable by the tenant role the moment it exists. With no
policy, RLS is off, and every row of every academy is visible. No error, no log
line.

Forgetting the policy and forgetting the test are the same omission, because
every RLS test is hand-written per table. There is no query anywhere against
`pg_policies`, `relrowsecurity` or `pg_class` (grepped: zero hits).

**Change.** One test in `packages/db/test`. Read `information_schema.columns` for
every table carrying an `academy_id` column, join to `pg_class.relrowsecurity` and
`pg_policies`, assert both are present. Allow an explicit exception list for the
two tables that are protected by grants instead, and require a comment on each.

**Also cover in the same pass.** Two tenant-scoped tables have no policy on
purpose and no database-level test proving the alternative protection holds:

- `member` carries `organization_id`, has no policy, and keeps SELECT for
  `matops_app`. Its boundary is enforced entirely in app code by `requireMember`
  (`packages/api/src/members.ts:38-47`).
- `academy_invite` carries `academy_id` and is protected only by the `REVOKE ALL`
  in migration `0020`.

**Files.** New test in `packages/db/test`.

**Done when.** The test passes on the current schema, and fails if you comment
out a `CREATE POLICY` line in any migration.

**Effort.** 1 hour.

### 3. Make cross-connection writes recoverable

**Problem.** Some mutations touch identity tables (base connection) and tenant
tables (RLS transaction) in the same call. Those are two connections and two
commits, and there is no compensation. This cannot be fixed by wrapping in a
transaction: the two connections exist for a real reason (ADR 66 — nesting the
base connection inside `withTenant` checks out a second pooled connection and
deadlocks outright on single-connection PGlite).

- `approve` (`membership.ts:477`, `:486-497`): grants the role on `baseDb`, then
  inserts dues on `ctx.db`. A failed dues insert leaves the member approved with
  no plan.
- `archive` (`membership.ts:541-546`, `:547`): writes status on `baseDb`, releases
  future seats on `ctx.db`. A failed release leaves an archived member holding
  seats in future classes.
- `purge` (`membership.ts:559-591`): four steps, three commit boundaries. The
  comment at `:551-558` shows the ordering was chosen so a half-finished erase
  falls back to a recoverable state. This one is already right.

**Change.** Order the two failing cases the way `purge` is ordered, so the
partial state is always one a human can repair, and state the intended order in a
comment on each. Do not attempt distributed atomicity.

**Files.** `packages/api/src/router/membership.ts`.

**Done when.** One test per mutation that fails the second step and asserts the
resulting state is repairable (the member can be approved again, the seats can be
released again).

**Effort.** Half a day.

### 4. Stop leaking Postgres text, and stop swallowing real faults

**Problem, half one.** `errorFormatter` (`packages/api/src/trpc.ts:111-120`)
attaches a flattened `zodError` and redacts nothing. tRPC wraps a non-`TRPCError`
throw into `INTERNAL_SERVER_ERROR` and copies `cause.message`, so Postgres text
reaches the client's JSON. Every unguarded write is exposed: `class.create`,
`note.add`, `rank.set`, all of `template.ts`, most of `payments.ts`, and the
explicit rethrow at `referral.ts:231`.

**Problem, half two.** One over-broad catch, `payments.ts:583-590`:

```ts
} catch {
  throw new TRPCError({ code: "CONFLICT", message: "A payment for this period is already awaiting confirmation." });
}
```

A dropped connection, a NOT NULL violation and a foreign key failure all reach the
student as "already awaiting confirmation". The `cause` is dropped, so Sentry
never sees it. During a pilot where nobody from matops is in the room, that is
exactly the failure mode ADR 76 exists to prevent.

**Change.** In `errorFormatter`, replace `message` for `INTERNAL_SERVER_ERROR`
with a fixed string in production and keep the real one in development. Then
narrow the `payments.claim` catch to the unique-violation code, reusing the
`23505` unwrapping already written at `referral.ts:75-83`. That logic is now
needed in two places, so pull it into one helper.

**Files.** `packages/api/src/trpc.ts`, `packages/api/src/router/payments.ts`, a
small shared helper in `packages/api/src`.

**Done when.** A test asserts a thrown raw `Error` reaches the caller with no
database text, and a test asserts a non-unique failure inside `payments.claim`
does not surface as `CONFLICT`.

**Effort.** 2 hours.

### 5. Bound the list reads that grow forever

**Problem.** Two bounds exist in the whole API: `notification.ts:22`
(`FEED_LIMIT = 50`) and `class.ts:46-51` (a 400-day span cap). Everything else is
unbounded: `membership.members`, `membership.archived`, `dropIn.list`,
`payments.claims`, `referral.dashboard`, `referral.history`, `booking.mine`,
`note.forMember`, `rank.forMember`, `attendance.list`, `template.list`.

At 20 seeded students this is invisible. At a real gym with 300 members, a year
of bookings and a year of claims, `membership.members` is six joined reads
returning everything on every dashboard load, and `booking.mine` returns a
student's entire history forever.

**Change.** The cheap version, not cursors. Add a hard `LIMIT` with a documented
ceiling to the reads that grow without bound over time: `booking.mine`,
`referral.history`, `payments.claims`, `note.forMember`, `attendance.list`. Leave
the roster reads alone until a gym is actually large. Mark each limit with a
`ponytail:` comment naming the ceiling and the upgrade path, so the deferral is
tracked rather than forgotten.

**Files.** `packages/api/src/router/{booking,referral,payments,note,attendance}.ts`.

**Done when.** Each bounded procedure has a stated ceiling in a comment.

**Effort.** 2 hours.

### 6. Index the three cross-academy sweeps

**Problem.** Every index in the schema was designed for the RLS request path, so
every one leads with `academy_id`. The three cron sweeps are the only
cross-academy readers, so none of those indexes can serve them.

| Query | Location | Missing index |
|---|---|---|
| Materialization sweep, `status='active' AND generated_until < horizon` | `packages/db/src/materialize.ts:176-199` | `class_template(status, generated_until)` |
| Class-reminder claim | `packages/db/src/reminder.ts:80-89` | `class(reminder_sent_at, starts_at)`, or partial `WHERE reminder_sent_at IS NULL` |
| Dues sweep, `next_due_at <= $1 ORDER BY next_due_at LIMIT n` | `packages/db/src/dues-reminder.ts:76-80` | `member_dues(next_due_at)` — today a full scan plus sort on every run |

One more, on the request path rather than a sweep: `listMembershipsForUser`
(`packages/db/src/membership.ts:136`) filters on `user_id` alone, but the only
index is `(organization_id, user_id)` with `user_id` in second position. That
query runs on the academy switcher and on most page loads. Add `member(user_id)`.

**Change.** One migration, four indexes.

**Files.** New migration in `packages/db/migrations`, plus the index declarations
in the matching schema modules.

**Done when.** The migration applies clean on Neon and `pnpm test` still passes.

**Effort.** 1 hour.

---

## Wave 2 — shape. Cheap now, expensive later.

The theme is one sentence: **the routers own the SQL, and some of the rules never
made it to `packages/domain`.**

### 7. Extract the queries that repeat three or more times

**Problem.** About 165 inline Drizzle sites across the routers. The repeats are
not incidental:

| Repeated thing | Copies |
|---|---|
| `listMembersOf(ctx.academyId, ctx.db)` | 13 |
| "roster read, then build a name Map" | 5 |
| `and(eq(class.id, x), isNull(class.deletedAt))` | 5, all in `class.ts` |
| `memberDues innerJoin membershipPlan` | 4 |
| single-row `paymentSettings` read | 4 |
| open pending claim lookup | 4 |
| booking counter increment / decrement SQL | 4, in two byte-identical pairs |
| "is this user in this academy" | 4 implementations, 3 different miss behaviours |
| class pre-read `{status, startsAt, deletedAt}` | 3 |
| last-owner guard | 2 near-identical functions, message duplicated verbatim |
| "booked students of this class", then notify | 2 copies in one file |

Duplicated user-facing strings compound it: `"Class not found"` appears at 9
sites, `"Plan not found"` at 3, `"This payment has already been handled."` at 2.

`packages/api/src/members.ts` already proves the fix works. Its header says five
routers each kept a private copy of the same guard before it was consolidated.
That file is now the chokepoint for member scoping, and it is the thing
`member-scope.test.ts` tests.

**Change.** Extract only what repeats three or more times, in the same style as
`members.ts` and `payments-gate.ts`. Roughly six small modules, not a layer. Each
becomes a place a test can sit, and each removes a way to forget the `deletedAt`
filter.

Deletion test: remove `requireMember` and the same guard reappears in five
routers. That is exactly what happened before it existed, which is the evidence
that these extractions earn their keep.

**Files.** New modules under `packages/api/src`, callers across
`packages/api/src/router`.

**Done when.** Each extracted module has a test, and the duplicate counts above
drop to one.

**Effort.** 1-2 days.

### 8. Move the stray business rules into `packages/domain`

**Problem.** Named policies do live in domain and the routers call them.
`rank.set` (`rank.ts:96-121`) is the model: three pure calls and nothing else.
What leaked out are the rules nobody thought to name.

In routers:

- Booking reason to user copy, a 17-line nested ternary (`booking.ts:83-99`).
  Domain already has `bookingAccessMessage`, which proves where this belongs.
- Referral assignment state, `assigned | cleared | never_assigned`
  (`referral.ts:151-155`).
- Gym "new members this month versus last" (`stats.ts:212-221`).
- Template timing-versus-content propagation, the whole schedule policy
  (`template.ts:139-168`).
- "An archived plan stays selectable for the member already on it"
  (`payments.ts:167-170`).
- "Auto-assign the only plan on approval" (`membership.ts:504-524`).
- `canEnroll` reimplemented as a status filter (`academy.ts:75-76`), and
  `!isStaff` reimplemented as a role filter (`stats.ts:334-338`).
- Default grace days written as the literal `7` (`payments.ts:197`) while
  `DEFAULT_GRACE_DAYS` exists in domain.
- "Only an owner may read another coach's figures" inline at `stats.ts:257-262`,
  while its sibling `canReassignCoach` lives in `coach.ts:404`.

In React, which is worse because no test can reach it:

- `apps/nextjs/src/app/_components/dashboard-screen.tsx` holds `showTomorrow`
  (`:174-176`), `nowIndex` (`:179-182`), pending and overdue counts (`:184-188`),
  `weekCount` (`:189-192`), `newLeads` (`:199-201`), `firstRun` (`:256`), and
  days-since-last-attendance (`:673-677`). All pure. All untested. This is the
  densest concentration of untested business logic in the repo.
- Both clients reimplement half of `canBook` inline (`class-detail.tsx:50-53`,
  `apps/expo/src/app/class/[id].tsx:106-114`) and neither checks
  `BOOKING_WINDOW_DAYS`. A deep-linked class three weeks out shows a live Book
  button, then the server rejects it.
- "Should I fetch my dues" is two different rules on web and mobile
  (`use-booking.ts:26` versus `book-control.tsx:41`).
- Overdue filtering is written inline in three components
  (`dashboard-screen.tsx:188`, `members.tsx:288-293`, `payments-screen.tsx:234-235`).
- Money formatting exists three times with three different outputs
  (`apps/nextjs/src/lib/money.ts:5`, `apps/expo/src/app/(tabs)/profile.tsx:153`,
  `packages/api/src/notify.ts:257`). Domain owns `MoneyAmount` and
  `groupMoneyByCurrency` but no `formatMoney`.

**Change.** Move each named rule into `packages/domain` with a test. These are
small mechanical moves. Do the dashboard block first: it is the biggest single
win, and it currently needs a React render to exercise.

**Files.** `packages/domain/src`, `packages/api/src/router`, the named components.

**Done when.** Each moved rule has a domain test, and the router or component
calls it instead of restating it.

**Effort.** 1-2 days.

### 9. Delete what is dead in `packages/domain`, and separate rules from labels

**Problem.** 23 files, 2,265 lines. The genuine engines are `coach`, `stats`,
`payments`, `attendance`, `materialize`, `csv`, `grid`. Those are deep and well
tested, and the test allocation matches: the four heaviest suites are the four
heaviest modules.

The rest is thin. `isActiveMember` is one string compare, `bookingTier` is one
ternary, `PAYMENT_STATUS_LABEL` and `notificationKindLabel` are maps, six message
builders are template literals, `isEligibleReferrer` is a non-empty-string check
dressed as a rule.

Thin is not automatically wrong. `isOwner` has 50 call sites and naming it earns
the file. But some of it is genuinely dead:

- `src/invite.ts` is dead outside its own test, superseded by `InviteRoleSchema`.
- `src/local-date.ts` has no external caller, and every consumer redefines
  `DAY_MS` locally instead (four places).
- Test-only exports: `normalizeAcademyCode`, `activeOwnerCount`,
  `wouldLeaveOwnerless`, `rankSystemFor`, `hasRankSystem`, `isValidStartMinutes`,
  `nextBookableClass`, `isInReminderWindow`, `reminderRecipients`,
  `claimDedupeKey`.
- Dead constants: `NOTIFICATION_KINDS`, `ATTENDANCE_BACKFILL_DAYS`,
  `ACADEMY_CODE_LENGTH`, `MIN_GAP_HOURS`, `BOOKING_WINDOW_DAYS`,
  `CHECK_IN_EARLY_MINUTES`, `MINUTES_PER_DAY`, `DAY_MS`, `DRIFT_THRESHOLDS`.
- Roughly 45 exported types nothing outside domain ever names.

Two of those matter beyond tidiness:

- `isInReminderWindow` and `reminderRecipients` are the reminder rules, tested,
  and never called. The real reminder window runs as SQL inside
  `claimDueReminderClasses`, and the recipient filter is hand-written SQL twice
  in `class.ts:96-103` and `:427-434`. The tested version and the running version
  are different code.
- `ATTENDANCE_BACKFILL_DAYS` is exported and unused while the web hardcodes `14`
  next to it (`attendance.tsx:27`).

**Change.** Delete the dead files, constants and types. Decide once whether label
maps belong in domain or behind a separate `labels` entry point, then stop mixing
them with rules. The barrel is a flat `export *`, so today a caller cannot tell a
deep rule from a string helper at the import site.

**Files.** `packages/domain/src`, `packages/domain/src/index.ts`.

**Effort.** Half a day.

### 10. One definition of a week, one definition of the check-in window

**Problem.** Five screens compute their own week window:
`schedule.tsx:106-111` (Monday-based), `student-screen.tsx:31-35`,
`apps/expo/src/app/(tabs)/schedule.tsx:246-247`, `dashboard-screen.tsx:107-126`,
`attendance.tsx:26-29`. Meanwhile `localDate` in domain is Sunday-aligned and
`DAY_LABELS` is Sunday-first. The two conventions coexist and nothing reconciles
them. `local-date.ts` already contains the correct academy-zone math and no app
calls it.

Same area, same problem: the check-in window is defined three ways.
`CHECK_IN_EARLY_MINUTES` says 60 minutes early to class end (`checkin.ts:9,28`),
the server guard on `checkIn` uses `canMarkAttendance` instead (14 days back, 1
day forward), and the lookup window is hardcoded as `3h back / 6h ahead` twice, in
`checkin.ts:16-17` and `dropin.ts:20-21`, derived from neither.

**Change.** One `academyWeek(now, zone, offset)` in domain, one convention, every
screen calls it. One check-in window function, three callers.

**Effort.** Half a day. This is the kind of drift that produces an off-by-one-day
bug nobody can reproduce.

### 11. Compose the validators instead of repeating them

**Problem.** One file, 616 lines, 56 schemas.

- `{ firstName, lastName, phone }` is declared five times: three in validators
  (`JoinAcademySchema`, `UpdateProfileSchema`, `JoinByCodeSchema`) and twice in
  the web app.
- The class shape (`title / discipline / instructorId / startsAtMinutes /
  durationMinutes / timeZone / capacity`) is written out three times with
  identical bounds.
- `{ classId: z.uuid() }` has three names. `{ id: z.uuid() }` has two.
- `isValidTimeZone` is implemented twice, in validators and in domain, and
  `academy.updateSettings` calls the domain one again on already-validated input
  (`academy.ts:119`). A time zone is checked three times in one request.
- The academy code shape exists three ways: a regex in validators, a length
  constant plus predicate in domain, and a third regex in the Expo onboarding
  screen.
- Four routers declare inline `z.object`. Three are trivial. One is not:
  `WeekInput` (`class.ts:44-51`) carries a real business rule, a 400-day span cap,
  and lives in neither validators nor domain.
- Client forms validate by hand instead of using the schema that will grade the
  submission (`templates.tsx:173`, `apps/expo/src/app/onboarding.tsx:121`).

Coverage: 44 of 56 schemas have no assertion anywhere. The untested ones include
real logic, such as `UpdateClassSchema`'s all-or-nothing reschedule refine and
`CreateClassTemplateSchema`'s unique-days refine.

**Change.** Compose from shared field groups, move `WeekInput` in, delete the
duplicate time-zone check, and split the file by area now while it is 616 lines
rather than at 1,500.

**Effort.** Half a day, plus tests.

### 12. Make sanitization a property of the boundary, not of each field

**Problem.** The primitives are good and the ordering is right: strip invisibles,
collapse whitespace, then measure length on the cleaned value
(`packages/validators/src/index.ts:19-56`). But applying them is opt-in, and
three tiers exist by accident:

- Fully sanitized: anything built from `lineText` / `blockText`, plus
  `PhoneSchema` and `EmailSchema`.
- Trim only: `IdSchema` (used for `memberId`, `studentId`, `instructorId`,
  `academyId` on nearly every mutation), `OpaqueTokenSchema`, `AcademyCodeSchema`,
  `TimeZoneSchema`, plan currency.
- Not sanitized at all: `HttpUrlSchema`, and therefore `MapUrlSchema` and
  `CreatePaymentClaimSchema.proofUrl`.

The URL path is the one field type that renders as an `href` for every member,
and it is the one that skips the invisible-character strip. `MapUrlSchema` does
careful host checking afterwards and handles the backslash-in-host trick
correctly, so this is a gap in defence depth, not an open hole.

**Change.** Make cleaning a property of the string builders so a new field cannot
opt out by accident, and add the strip to the URL path.

**Effort.** 2 hours.

### 13. Decide what `packages/notifications` is

**Problem.** The package doc describes two adapters. In reality `sendPush` has
exactly one caller (`packages/api/src/notify.ts:88`) and `sendEmail` has zero
production callers. There is no interface, no injection point, no fake.
`sendPush` is imported concretely and calls global `fetch`, so
`packages/api/src/notify.ts` (299 lines) cannot be tested without stubbing the
network, and it has no tests at all.

One adapter is a hypothetical seam. Two is a real one. This is one live adapter
plus a dead one. Separately, `class.ts:414` comments "Push + email every booked
student" and no email is ever sent.

**Change.** Pick one:

- **Inject the sender** into `notify.ts` so it becomes testable. A one-parameter
  change, and `notify.ts` is the least-tested important file in the repo.
- **Or accept it is one transport**, delete the Resend adapter and the stale
  comment, and stop calling it a seam.

Recommendation: inject. The reason is not future flexibility, it is that item 16
needs `notify.ts` under test and this is the cheapest way to get there.

**Effort.** 2 hours.

---

## Wave 3 — communication and tests

### 14. Cut the round trips that come from procedure shape

The tRPC batch link means one HTTP request per tick, so the cost is procedures,
not requests.

- **Dashboard** fires 8 unique procedures in one batch. Three of them,
  `stats.gym`, `stats.drifting`, `stats.revenue`, are owner-only aggregates always
  fetched together for one screen. Because the link is deliberately non-streaming
  (ADR 83, to keep `Set-Cookie`), the whole dashboard waits on the slowest.
  One `stats.dashboard` turns three database trips into one.
- **Member detail** fires three more procedures per expanded row
  (`membership.memberHistory`, `rank.forMember`, `note.forMember`). Opening ten
  members costs ten requests and 30 procedures. One `membership.memberDetail`
  makes it ten.
- **Coach cards** fire `stats.coach` per expanded coach, and `stats.coaches`
  already returns the roster.
- **Class detail waterfalls**: `class.attendees` cannot start until `class.get`
  resolves, on both web and mobile.
- **Training waterfalls**: `stats.me` is rendered inside the `else` of
  `mine.isPending`, so it only starts after `booking.mine` returns.
- **Every Expo tab costs two sequential batches minimum.** `payments.myDues`,
  `notification.unreadCount`, `class.mine` and `booking.mine` are all `enabled`
  on a value derived from `academy.current`, and mobile has neither the RSC
  prefetch nor the 5-minute `staleTime` the web gives that query
  (`app-shell.tsx:38`). Training costs three.

The cheapest single fix is the Expo `staleTime`, which turns a per-30-seconds
waterfall into a per-5-minutes one. The rest are new per-screen procedures.

This overlaps the `frontend-performance-plan` branch. The backend half is the new
procedures. The client half belongs there.

### 15. Give cache invalidation one rule

Roughly 40 ad hoc `invalidateQueries` call sites, in three styles mixed freely: a
local helper per component, a bare `invalidateQueries()` that clears the whole
cache (7 sites), and optimistic `setQueryData` with rollback (3 sites).

`apps/nextjs/src/app/_components/use-booking.ts` is the one place that got it
right, and its header says so: "One place decides what a booking invalidates".
Expo has no equivalent and duplicates the same pair twice inside one file
(`book-control.tsx:52-53` and `:118-119`).

The concrete bug this produces: `coaches-screen.tsx:270` invalidates `stats` after
approving a coach, but no attendance or booking mutation ever does. So dashboard
insights and student stats stay stale until the 30-second `staleTime` lapses.

**Change.** The `use-booking.ts` pattern, applied per aggregate. One module per
area that owns "what does writing X invalidate", shared by both clients.

### 16. Test the cron path

Both routes duplicate the same shared-secret block (`remind/route.ts:32-40`,
`materialize/route.ts:31-39`), bypass the tRPC procedure layer, and run
cross-academy on the base connection outside RLS. That is deliberate, documented
in both file headers, and the right call for a sweep.

What is missing is tests. `packages/api/src/notify.ts` holds both sweeps and has
zero. The sweeps also claim-then-send: a crash between the claim and the send
loses the notification permanently (`notify.ts:226-228` acknowledges this). Dues
reminders are the only live automated message during the pilot, so that path
deserves a test. Item 13 is the prerequisite.

Small related item: the tRPC route sets `Access-Control-Allow-Origin: *` with no
`Allow-Credentials` (`apps/nextjs/src/app/api/trpc/[trpc]/route.ts:14-17`). Expo
is not CORS-bound and the web client is same-origin, so the wildcard buys nothing
and only widens the surface. Delete it.

### 17. Cover the 46 untested procedures

The harness is good. `packages/api/test/helpers.ts` boots PGlite, injects it as
`baseDb`, and builds a real caller, so tests run real SQL through real middleware
and real RLS. 13 suites, 2,113 lines. What exists is solid.

58 of 104 procedures are called by a test. The 46 that are not, ranked by risk:

1. `dropIn.submit` — public, stranger-writable, rate-limited insert. The thing
   behind the wall poster.
2. `template.rebuild` and `template.delete` — destructive schedule writes.
3. `class.cancel` — the only cancellation notification path.
4. `attendance.mark` / `markAll` / `addVisitor` — the instructor's daily job.
5. `referral.correct` — the only path that rewrites attribution.
6. `stats.revenue`, `stats.drifting` — owner-facing numbers.
7. `packages/api/src/notify.ts` — 299 lines, zero tests.
8. The `rateLimited` middleware is never driven through a procedure, so the
   `path:ip` keying at `trpc.ts:164` is unverified.

Also untested elsewhere: `packages/domain/src/local-date.ts` (the shared week and
month bucket math behind every academy-zone statistic), `packages/db/src/invite.ts`
(no test file at all), the two `FOR UPDATE` "never ownerless" transactions in
`packages/db/src/membership.ts:258,303`, `eraseMemberData`'s per-table
completeness, and every failure path in `packages/notifications`.

One structural blocker: `authApi` in the api test harness is a Proxy that throws
on any access (`test/helpers.ts:23-34`). That is why `academy.create`,
`membership.join`, `joinByCode` and `academy.setActive` have no coverage. Fixing
that unlocks the whole onboarding funnel for testing, which is the path every
pilot gym walks first.

**Run the suites with:** `pnpm test`

---

## Order and effort

| Wave | Items | Effort | When |
|---|---|---|---|
| 1, safety | 1, 2, 4 first (each under a day, each closes a class of silent failure), then 6, then 3 and 5 | ~2 days | Before the pilot |
| 2, shape | 7 and 8 together are the real work. 9-13 can run alongside | ~4-5 days | Next |
| 3, comms and tests | 14's backend half pairs with the frontend performance branch. 15, 16, 17 ongoing | ongoing | After |

Items 1, 2, 4 and 6 are independent of each other and of everything else, so they
can land in any order or in parallel. Item 13 blocks item 16. Item 7 makes item 8
easier but does not block it.

## Doc work this plan implies

Following `delivery.md` §4, if any of this ships:

- Item 1 needs an amendment appended to
  [ADR 13](issues/13-booking-write-atomicity.md), because the
  current text promises a rollback that does not happen.
- Items 7, 8 and 13 are technical decisions and need an ADR each.
- `docs/architecture.md` §0 needs updating for anything that moves between
  packages.
- One `CHANGELOG.md` line per slice.
