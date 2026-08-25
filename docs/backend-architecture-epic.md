# Backend architecture epic — run file

This is the executable half of [backend-architecture-plan.md](backend-architecture-plan.md).
The plan says what is wrong and why. This file says what to do next and holds the
state between turns.

**The file is the source of truth, not the conversation.** State lives here so it
survives compaction and `/clear`. Never keep plan state only in context.

---

## How to run it

One invocation does **one whole phase**, then stops at that phase's `GATE`.

```
/loop /epic docs/backend-architecture-epic.md
```

**This overrides the `epic` skill's "one item per invocation" rule, on purpose.**
The skill assumes a stop between items so state cannot be lost. State is safe
here for a different reason: this file is written after every item, not after
every phase. Read the skill's rule, then follow this section instead.

The turn runs like this:

1. Rebase on latest `main` (the working rule below).
2. Take the first unchecked `- [ ]` item in the current phase. Do it in full,
   to the per-item Definition of done.
3. **Write the file before starting the next item.** Flip the item to `- [x]`
   and append its entry to `## Log`. Never carry two finished items in context
   with neither written down: a crash or a context limit between them loses
   work that the file was supposed to hold.
4. Repeat from step 2 until the phase's `GATE` item is next.
5. Run the gate.

Say one or two lines per item as you go, so the terminal shows progress. The
full detail goes in `## Log`, not in the reply.

To do a single item by hand, without the loop:

```
/epic docs/backend-architecture-epic.md
```

### The compaction protocol

Every phase ends with a `GATE` item. A gate is a hard stop:

1. Run the gates (see **Definition of done** below).
2. Do the doc work for the phase.
3. Write the phase summary into `## Log`.
4. Call `ScheduleWakeup({stop: true})` to end the loop. Say plainly that the phase
   is done and the next step is compaction.

Then the human runs `/compact` (or `/clear`, since this file carries the state)
and restarts the loop for the next phase. Do not carry a finished phase's detail
into the next one.

### When to break the phase early

Stop mid-phase, without reaching the gate, in three cases. In all three, write
the file first, then call `ScheduleWakeup({stop: true})`.

- **The same item fails twice in a row.** Mark it `- [!]`, put the reason in
  `## Log`.
- **A decision is the human's to make.** A change contradicts an existing ADR, or
  an item turns out to need a call outside this plan's scope. Say what the choice
  is and stop. Do not guess and keep going: five more items land on top of a
  wrong turn before anyone sees it.
- **The phase has grown past what one turn can hold well.** If the remaining
  items would push the reply into guesswork, stop at the last clean item and say
  which one is next. A phase finished badly is worse than a phase finished in
  two turns.

---

## Goal

Restructure the backend before the pilot, on the architecture that is already
there. Close the ways it can fail silently, move duplicated queries and stray
rules to where the existing pattern says they belong, and cover what is untested.

No new layers. No repository over the ORM. No service classes. No
dependency-injection container. See "What this plan will not touch" in the plan
doc, and treat that list as binding.

---

## Constraints

Repo rules, from `CLAUDE.md` and `docs/delivery.md`:

- Read a file before editing it. Absolute paths.
- **Do not commit or push.** Not at item level, not at gate level. The human commits.
- **Do not run the full suite except at a GATE item.** An item whose whole job is
  to verify a fix (0.3, 0.9) may run the specific files it is verifying, scoped
  with `pnpm -F <package> exec vitest run <file>`. Everything else: write the
  test, hand the command to the human.
- Zero comments on edited lines. No JSDoc added just because a field is new. The
  only exception is a genuine non-obvious *why*: a workaround, an external
  constraint, a gotcha. Zero comments in test files, always.
- Deliberate shortcuts with a known ceiling get a `ponytail:` comment naming the
  ceiling and the upgrade path.
- Plain English in every doc, ADR, and commit message. Short sentences, active
  voice, no em dashes.
- Write the pure rule in `packages/domain` with a test **before** the API or UI
  that uses it (`delivery.md` §5).

Working rules specific to this epic:

- **Work in the worktree** at `.claude/worktrees/backend-architecture-review`.
  Never `cd` to the main checkout. The frontend performance work is on another
  branch and must not be disturbed.
- **Rebase on latest `main` at the start of every phase**, as the first act after
  a gate. The frontend branch is landing waves in parallel (v4.2 through v4.7,
  ADRs 85-91). Anything below can be invalidated by a merge.
- **Line numbers in the plan doc are from commit `0243e23`.** Treat them as
  hints. Re-grep before editing. If a reference has moved or the code already
  changed, say so in `## Log` and adjust.

---

## Definition of done

### Per item

An item is done when all five hold:

1. The change is in, and it does what the item says.
2. `pnpm typecheck` passes for the packages you touched.
3. `pnpm -F <package> lint` passes for the packages you touched.
4. If the item changes behaviour or a rule, a test exists for it. Written, not
   run. Hand the command to the human.
5. The item is flipped to `- [x]` and its entry is in `## Log`, **written before
   the next item starts**. This is what makes a whole-phase turn safe: the file
   is never more than one item behind the work.

### Per phase (the GATE item)

A phase is done when all six hold:

1. Every item in the phase is `- [x]` or `- [!]` with a logged reason.
2. `pnpm typecheck` passes, 17/17.
3. `pnpm lint` passes, or fails only on the pre-existing failures recorded in
   `## Log` by item 0.1. No new lint failures.
4. `pnpm test` shows **no new failures** against the baseline recorded by item
   0.1. After Phase 0 the baseline should be zero failures. If it is not, that is
   a blocker, not an acceptable state.
5. The doc work for the phase is done, per `delivery.md` §4:
   - `docs/spec.md` if user-visible behaviour changed.
   - `docs/architecture.md` §0 plus a new ADR in `docs/issues/` if a technical
     decision changed. Append-only. Supersede, never rewrite.
   - `docs/roadmap.md` cells flipped.
   - One line in `CHANGELOG.md`.
6. A phase summary is in `## Log`, and the loop is stopped for compaction.

---

## Adjusting as you go

This plan is a hypothesis written from a read of the code at one commit. It is
expected to be wrong in places. When it is:

- **A better solution appears.** Take it. Do not implement the worse one because
  it is written down. Log what you did instead and why, in one or two sentences.
- **An item is already done**, by the frontend branch or by a merge. Flip it to
  `- [x]`, log "already true after rebase", move on.
- **An item turns out to be wrong**, meaning the problem does not exist or the
  fix would make things worse. Mark it `- [!]`, log the evidence, move on. Do not
  argue with it across turns.
- **The work reveals new required steps.** Insert them as new `- [ ]` items in
  the right phase, at the right position. This is normal, not scope creep.
- **An item is bigger than one commit.** Split it into two `- [ ]` items and do
  the first.
- **A change contradicts an existing ADR.** Stop and say so. An ADR is only
  reopened deliberately, with a new ADR that supersedes it. Never silently.

The one thing not adjustable: the "What this plan will not touch" list. If an
item seems to need a repository layer or a service class, the item is wrong.

---

## Tasks

### Phase 0 — make the gates readable

Every later phase gate is meaningless while `pnpm test` has 27 pre-existing
failures and root `pnpm lint` is red. Fix the instrument before measuring.

- [x] **0.1 Record the baseline.** Run `pnpm lint`, `pnpm typecheck`, `pnpm test`.
      Write the exact failure counts and the failing suite names into `## Log`.
      Change no code in this item.
- [x] **0.2 Cut the notify path's dependency on the singleton `db`.** The 27
      timeouts trace to `packages/api/src/notify.ts`. `deliver()` runs the academy
      lookup, the inbox write and the push-token read on the module-level `db`,
      which `packages/api/vitest.config.ts:11` points at a dummy host, so each
      call hangs on DNS. The test output shows it directly: `[notify] academy
      lookup failed`, `[notify] inbox write failed`, `[notify] delivery failed`,
      all `DrizzleQueryError`. Because `notify` swallows its own errors, the tests
      do not fail on the error, they fail on the timeout: 124s, 244s and 341s for
      the three suites.
      Fix: pass the executor into `notify.ts` from the caller, the same way
      `membership.ts:26-27` and `erase.ts` take a required `exec`. Then sweep the
      `packages/db` helpers that still hard-code the singleton or default
      `exec = db` (`invite.ts`, `push-token.ts`, `notification.ts`,
      `academy-settings.ts`, `academy-code.ts`, `dropin.ts`, `materialize.ts`,
      `dues-reminder.ts`), so a missed call site is a compile error rather than a
      silent hit on the real pool.
      Note this also delivers the prerequisite that item 5.1 needs, so revisit
      5.1's scope when you get there.
- [x] **0.3 Confirm the timeouts are gone.** They are not. 0.2 fixed a real
      problem but not this one. Real cause found and written up in `## Log`: a
      tenant procedure writes an identity table on `ctx.baseDb` while its own
      `withTenant` transaction is open, which self-deadlocks on PGlite's single
      connection. Fix split into items 0.6 and 0.7.
- [x] **0.6 Let the resolver own when the tenant transaction opens.** First
      attempt failed, see `## Log`. An `afterCommit`-style queue cannot work,
      because it forces one ordering on every mutation and `archive` needs the
      opposite one.
      Do this instead: generalize `ownerIdentityProcedure` (`trpc.ts:316-332`)
      into a builder that authorizes exactly like the tenant tiers but does NOT
      open the transaction. The resolver gets `ctx.baseDb` and a
      `ctx.withTenant(fn)` it calls itself for the tenant-table work. One
      connection at a time, ordering stays the resolver's choice, and it works on
      PGlite.
      Keep the tier names honest: a staff-level and an owner-level variant, not a
      fourth unrelated concept.
- [x] **0.7 Move the eight membership mutations onto it.** `approve` (`:477`),
      `reject` (`:518`), `archive` (`:548`), `purge` (`:576`, `:584`, `:586`,
      `:591`), `suspend` (`:605`), `restore` (`:627`), `promote` (`:639`),
      `setRole` (`:658`). Each currently writes `member` on `ctx.baseDb` from
      inside the tenant transaction. Order each so a failure at the second step
      leaves a state a human can repair, the way `purge` already reasons about it
      at `:551-558`. This supersedes item 1.5, which asked for the same ordering
      work without knowing it was also the cause of the 27 failures.
      Keep each mutation's existing ordering. `archive` writes status FIRST on
      purpose (`membership.ts:544-546`): status is the access gate, so a race
      cannot book in the gap between cancelling seats and revoking access. Do not
      reverse that.
      Check the reads too: `academy.ts:98` (`getAcademyCode` inside
      `academy.current`) has the same shape and has simply never been hit by a
      test.
- [x] **0.10 Move `invite.*` and `attendance.addVisitor` onto identity
      procedures.** Found while doing 0.5, same defect class as 0.7 and just as
      latent. `invite.list/create/rotate/revoke` are `ownerProcedure` and
      `attendance.addVisitor` is `staffProcedure`, so all five run inside
      `withTenant`, yet every one of them reaches the base connection:
      `academy_invite` has `REVOKE ALL` from `matops_app` (migration 0020) and
      `createDropIn` writes on the base handle too. Nobody noticed because all
      five have zero tests.
      0.5 threaded `ctx.baseDb` through them, which preserves today's behaviour
      exactly and fixes nothing here. Convert them to `ownerIdentityProcedure` /
      `staffIdentityProcedure` with `ctx.withTenant` where a tenant table is
      involved, and add a test for each so the deadlock cannot come back unseen.
- [x] **0.8 Type `ctx.baseDb` away inside tenant procedures.** Only after 0.7,
      because it breaks every remaining inline base write by design. Override
      `baseDb: undefined` in the ctx that `enforceTenant` passes to `next()`, so
      a tenant resolver physically cannot reach the base connection and the
      compiler says so. Tried during the 0.6 attempt and it found all 12 offending
      sites in `membership.ts` instantly, which is the argument for keeping it.
- [x] **0.4 Fix root `pnpm lint`.** Already green at this base: 15/15 successful.
      The "type that could not be resolved" failure described in `CLAUDE.md` is a
      condition of the `frontend-performance-plan` working tree, not of `main`.
      Nothing to do here. Re-check after any rebase that pulls that work in.
- [x] **0.9 Fix the six failures the deadlock was hiding.** All six were inside
      the original 27, so none of them is new. They only became visible once the
      timeouts stopped masking them. Three separate causes:
      1. Five tests die on `That belt or stripe count isn't valid for this
         discipline.` The test sends `belt: "blue"`, `RANK_SYSTEMS`
         (`packages/domain/src/rank.ts:44`) stores `"Blue"`, and `isValidRank`
         does a case-sensitive `belts.includes`. Decide which side is wrong: the
         rule should probably normalize case, because a stored belt string is
         user-facing copy and an API input should not have to match its casing.
      2. One dies on a `nextDueAt` Zod `Invalid ISO date` in setup.
      3. The three `purge` tests and one `restore` test need a second look after
         1 and 2 are fixed, since they may be downstream of the same setup.
- [x] **0.5 Sweep the db helpers outside the notify path.** Split out of 0.2,
      which fixed only what the failing tests touch. Still hard-coding the
      singleton or defaulting `exec = db`: `push-token.ts` (`upsertPushToken`,
      `deletePushToken`), `dropin.ts` (`listAcademyClassesInWindow`, and the rest
      of the module), `invite.ts` (all five), `academy-settings.ts` (three),
      `academy-code.ts` (two), `materialize.ts` (`runMaterializationSweep`).
      Same treatment: a required `exec` parameter, so a missed call site is a
      compile error. Callers inside routers pass `ctx.baseDb`; the materialize
      cron route passes `db` the way the remind route now does.
- [x] **GATE 0.** Gates green. ADR for the injection change (it is a technical
      decision: every db helper is now injectable). Then stop for compaction.

### Phase 1 — safety

Plan items 1, 2, 4, 6, 3, 5. Land before the pilot.

- [x] **1.1 Roll back the tenant transaction when a resolver throws.** Plan item 1.
      Throw a private marker inside the `withTenant` callback when `result.ok` is
      false, catch it outside, return the original result.
      `packages/api/src/trpc.ts:252-278`. Test: write through `ctx.db`, throw a
      `TRPCError`, assert the row is absent. Then append an amendment to
      `docs/issues/13-booking-write-atomicity.md`, whose line 67 currently
      promises a rollback that does not happen.
- [x] **1.2 Add the structural RLS guard test.** Plan item 2. One test in
      `packages/db/test`: every table with an `academy_id` column has
      `relrowsecurity` true and a policy in `pg_policies`. Explicit exception
      list for `member` and `academy_invite`, each with a reason. Verify it fails
      when a `CREATE POLICY` line is commented out.
- [x] **1.3 Stop leaking Postgres text, and narrow the swallowing catch.** Plan
      item 4. `errorFormatter` replaces `message` for `INTERNAL_SERVER_ERROR` in
      production. `payments.ts:583-590` narrows to the unique-violation code,
      reusing the `23505` unwrapping at `referral.ts:75-83`, pulled into one
      helper since it is now needed twice.
- [x] **1.4 Add the four missing indexes.** Plan item 6. One migration:
      `class_template(status, generated_until)`,
      `class(reminder_sent_at, starts_at)` or the partial form,
      `member_dues(next_due_at)`, `member(user_id)`.
- [!] **1.5 Make `approve` and `archive` recoverable.** Superseded by items 0.6
      and 0.7, which do the same ordering work. Phase 0 has to do it because the
      same defect is what fails 27 tests. Keep the "fail the second step, assert
      the state is repairable" test idea and land it with 0.7.
- [x] **1.6 Bound the reads that grow forever.** Plan item 5. Hard `LIMIT` with a
      `ponytail:` comment naming the ceiling on `booking.mine`,
      `referral.history`, `payments.claims`, `note.forMember`, `attendance.list`.
      Leave the roster reads alone.
- [x] **1.7 Delete the CORS wildcard.** `apps/nextjs/src/app/api/trpc/[trpc]/route.ts:14-17`.
      Expo is not CORS-bound, the web client is same-origin, and there is no
      `Allow-Credentials`, so it buys nothing.
- [x] **GATE 1.** Gates green. ADR covering the transaction rollback fix and the
      error redaction. Roadmap, changelog, architecture §0. Then stop for
      compaction.

### Phase 2 — one copy of each query

Plan item 7. Extract only what repeats three or more times, in the style
`packages/api/src/members.ts` and `payments-gate.ts` already use.

- [x] **2.1 One roster read.** `listMembersOf` appears 13 times, and "roster read
      then build a name Map" 5 times. One helper, one test.
- [x] **2.2 One "is this user in this academy".** Four implementations with three
      different miss behaviours: `trpc.ts:228`, `academy.ts:220-230`,
      `attendance.ts:159-169`, `members.ts:38-47`. Decide the one correct miss
      behaviour (`NOT_FOUND`, per the existing rule that foreign ids never return
      `FORBIDDEN`), then collapse to one.
- [x] **2.3 One payments read module.** The `paymentSettings` single-row read (4
      copies), the `memberDues innerJoin membershipPlan` (4 copies), the open
      pending claim lookup (4 copies).
- [x] **2.4 One class pre-read and one booking counter.** The
      `{status, startsAt, deletedAt}` pre-read (3 copies), the
      `and(eq(class.id, x), isNull(class.deletedAt))` predicate (5 copies in
      `class.ts`), the increment and decrement SQL (2 byte-identical pairs).
- [x] **2.5 One "notify the booked students of this class".** Two copies in
      `class.ts` (`:96-118` and `:427-451`), each doing the same read, time-zone
      lookup, map and `afterCommit` queue.
- [x] **2.6 One place for the repeated user-facing strings.** `"Class not found"`
      at 9 sites, `"Plan not found"` at 3, `"This payment has already been
      handled."` at 2, plus the last-owner message duplicated verbatim in two
      near-identical functions at `membership.ts:131-150` and `:213-232`.
- [x] **GATE 2.** Gates green. ADR for the extraction (what got a module and what
      deliberately did not). Then stop for compaction.

### Phase 3 — rules to `packages/domain`

Plan item 8. Each rule gets a domain test first, then the caller switches to it.

- [x] **3.1 Booking copy and the client-side `canBook`.** Move the 17-line
      ternary at `booking.ts:83-99` into a `notBookableMessage(reason)` beside
      `bookingAccessMessage`. Then make both clients call `canBook` instead of
      reimplementing half of it (`class-detail.tsx:50-53`,
      `apps/expo/src/app/class/[id].tsx:106-114`), which also fixes the
      `BOOKING_WINDOW_DAYS` gap where a class three weeks out shows a live Book
      button the server then rejects.
- [x] **3.2 Payments rules.** "An archived plan stays selectable for the member
      already on it" (`payments.ts:167-170`), "auto-assign the only plan on
      approval" (`membership.ts:504-524`), `canDecideClaim` (the pending-only
      precondition written twice at `payments.ts:281-287` and `:334-340`), and
      the literal `7` at `payments.ts:197` replaced by `DEFAULT_GRACE_DAYS`.
      Add `formatMoney` and collapse the three different money formats.
- [x] **3.3 Stats and access rules.** New-members month comparison
      (`stats.ts:212-221`), `canEnroll` instead of the status filter at
      `academy.ts:75-76`, `!isStaff` instead of the role filter at
      `stats.ts:334-338`, and the "only an owner reads another coach's figures"
      rule at `stats.ts:257-262` moved beside `canReassignCoach`.
- [x] **3.4 Template propagation policy.** The timing-versus-content branch at
      `template.ts:139-168` is the whole schedule policy sitting in a resolver.
- [x] **3.5 The dashboard rules.** `dashboard-screen.tsx`: `showTomorrow`
      (`:174-176`), `nowIndex` (`:179-182`), pending and overdue counts
      (`:184-188`), `weekCount` (`:189-192`), `newLeads` (`:199-201`), `firstRun`
      (`:256`), days-since-last-attendance (`:673-677`). All pure, all currently
      reachable only through a React render. This is the biggest single win in
      the phase.
- [x] **3.6 Referral assignment state.** The `assigned | cleared | never_assigned`
      ternary at `referral.ts:151-155`.
- [x] **GATE 3.** Gates green. ADR for what belongs in domain and what does not,
      since this phase draws that line explicitly. Then stop for compaction.

### Phase 4 — domain and validators cleanup

Plan items 9, 10, 11, 12.

- [x] **4.1 Delete what is dead in `packages/domain`.** `src/invite.ts`,
      `src/local-date.ts`'s unused public surface (or wire it up in 4.2 instead),
      ten test-only exports, nine dead constants, roughly 45 exported types
      nothing names. Full list in plan item 9. Decide whether label maps stay in
      domain or move behind a separate entry point, and stop mixing them with
      rules.
- [x] **4.2a One check-in window.** Three definitions today: the rule
      (`CHECK_IN_EARLY_MINUTES`, 60 min early to class end, `checkin.ts:9,28`),
      the `checkIn` mutation guard (`canMarkAttendance`, 14 days back), and the
      hardcoded `3h back / 6h ahead` fetch bound in `checkin.ts:16-17` and
      `dropin.ts:20-21`, derived from neither. Split out of 4.2 because it fixes a
      live defect, not only duplication.
- [x] **4.2b One week window.** `academyWeek` in domain, replacing five
      hand-rolled windows, and reconciling the Monday grid against the
      Sunday-first `DAY_LABELS` used by every statistic.
- [x] **4.3 Compose the validators.** Shared field groups instead of five copies
      of `{ firstName, lastName, phone }` and three of the class shape. Move
      `WeekInput` (`class.ts:44-51`) in, since it carries a real 400-day rule.
      Delete the duplicate `isValidTimeZone` so a time zone is checked once, not
      three times. Split the 616-line file by area.
- [x] **4.4 Sanitize at the boundary.** Make cleaning a property of the string
      builders so a field cannot opt out by accident, and add the
      invisible-character strip to `HttpUrlSchema`, which today skips it while
      being the one field rendered as an `href`.
- [x] **GATE 4.** Gates green. Then stop for compaction.

### Phase 5 — the notification path

Plan items 13 and 16.

- [x] **5.1 Inject the sender into `notify.ts`.** One parameter. The reason is
      not future flexibility, it is that `packages/api/src/notify.ts` is 299
      lines with zero tests and cannot be tested while `sendPush` is imported
      concretely and calls global `fetch`. Delete the dead Resend adapter and the
      stale "Push + email every booked student" comment at `class.ts:414`, or
      keep Resend and say plainly what it is for.
- [x] **5.2 Test the sweeps.** `runReminderSweep` and `sweepDuesReminders`,
      including the claim-then-send gap where a crash between the two loses the
      notification permanently (`notify.ts:226-228`). **This now also owns the
      reminder window itself.** Item 4.1 deleted `isInReminderWindow` and
      `reminderRecipients`, the tested-but-never-called domain twins of the SQL in
      `claimDueReminderClasses`. That SQL has no test at all, and it is a
      different algorithm: it bounds the window on one side plus
      `reminder_sent_at IS NULL`, where the domain version used a two-sided sweep
      window. Test the SQL, do not resurrect the twin.
- [x] **5.3 One cron auth helper.** The shared-secret block is duplicated at
      `remind/route.ts:32-40` and `materialize/route.ts:31-39`.
- [x] **GATE 5.** Gates green. Then stop for compaction.

### Phase 6 — round trips and cache rules

Plan items 14 and 15. Coordinate with the `frontend-performance-plan` branch
before starting: it may already have moved some of this.

- [x] **6.1 `stats.dashboard`.** Fold `stats.gym`, `stats.drifting` and
      `stats.revenue` into one procedure. Three database trips become one, and
      the non-streaming batch stops waiting on the slowest of three.
- [!] **6.2 `membership.memberDetail`.** Fold `membership.memberHistory`,
      `rank.forMember` and `note.forMember`. Ten opened member rows go from 30
      procedures to 10.
- [!] **6.3 Fold the coach breakdown into `stats.coaches`.** It already returns
      the roster, and today each expanded card fires its own `stats.coach`.
- [x] **6.4 Kill the mobile waterfalls.** Give Expo the same 5-minute
      `staleTime` on `academy.current` that the web has at `app-shell.tsx:38`,
      which turns a per-30-seconds waterfall into a per-5-minutes one. Then hoist
      the two query calls that sit inside an `else` branch so they stop waiting:
      `stats.me` behind `booking.mine`, and `class.attendees` behind `class.get`
      on both clients.
- [x] **6.5 One invalidation rule per aggregate.** Follow
      `use-booking.ts`, whose header already says "One place decides what a
      booking invalidates". Shared by both clients. Fix the concrete bug: no
      attendance or booking mutation invalidates `stats`, so dashboard insights
      and student stats stay stale.
- [x] **GATE 6.** Gates green. Then stop for compaction.

### Phase 7 — cover the untested procedures

Plan item 17. 46 of 104 procedures have no test.

- [ ] **7.0 Put every `test/` directory in the typecheck gate.** `pnpm typecheck`
      runs each package's own script, which points at `src`. The `test/tsconfig.json`
      files are never run by any gate, and vitest strips types without checking
      them, so a test can call a function with arguments its signature refuses and
      still pass. Found live in `packages/domain/test/notify.test.ts` during item
      3.4. Fix in the package `typecheck` scripts, not by merging the tsconfigs:
      the split exists to keep `build` off the test files.
- [ ] **7.1 Unblock `authApi` in the api test harness.** It is a Proxy that
      throws on any access (`packages/api/test/helpers.ts:23-34`), which is why
      the whole onboarding funnel is untestable. Fixing this is the prerequisite
      for 7.2.
- [ ] **7.2 Test the onboarding funnel.** `academy.create`, `membership.join`,
      `joinByCode`, `academy.setActive`. This is the path every pilot gym walks
      first.
- [ ] **7.3 Test the public surface.** `dropIn.submit` (stranger-writable insert
      behind the wall poster) and the `rateLimited` middleware driven through a
      real procedure, so the `path:ip` keying at `trpc.ts:164` is verified.
- [ ] **7.4 Test the destructive schedule writes.** `template.rebuild`,
      `template.delete`, `class.cancel`.
- [ ] **7.5 Test the attendance mutations.** `attendance.mark`, `markAll`,
      `addVisitor`. The instructor's daily job.
- [ ] **7.6 Close the rest.** `referral.correct`, `stats.revenue`,
      `stats.drifting`, `packages/domain/src/local-date.ts`,
      `packages/db/src/invite.ts`, the two `FOR UPDATE` never-ownerless
      transactions (`membership.ts:258,303`), and `eraseMemberData` per-table
      completeness, which `erase.ts:47-48` warns about and nothing checks.
- [ ] **GATE 7.** Gates green. Final summary in `## Log`. Then stop.

---

## Log

Format: one line per item. What changed, files touched, anything that surprised
you. At a gate, add a short phase summary block.

<!-- Append below. Newest at the bottom. -->

### Baseline, 2026-08-24, `main` @ `0243e23`

Rebase check: `origin/main` is `0243e23`, the worktree is level with it, nothing
to rebase. The v4.2 through v4.7 waves described in `CLAUDE.md` live on the
`frontend-performance-plan` working tree and are not on `main` yet.

`pnpm install` was needed first, the worktree had no `node_modules`.

| Gate | Result |
|---|---|
| `pnpm typecheck` | **green**, 17/17 |
| `pnpm lint` | **green**, 15/15 |
| `pnpm test` | **red**, 27 failed / 107 passed in `@matops/api`. Every other package green. |

Per-package test counts, all green except api: `@matops/domain` 318/318 in 22
files, `@matops/db` 105/105 in 20 files, `@matops/validators` 24/24,
`@matops/notifications` 3/3. `@matops/api` 107 passed, 27 failed, 13 files.

The three failing suites and their wall-clock times:

- `test/booking-gate.test.ts`, 4 of 14 failed, 124s
- `test/instructor-desk.test.ts`, 8 of 9 failed, 244s
- `test/membership-lifecycle.test.ts`, 15 of 21 failed, 341s

Total run 5m49s. **This is the number every later gate compares against: 27
failures, and only in those three files.**

Two corrections to what the plan assumed:

1. **Lint is not red on `main`.** It is red only on the frontend branch. Item 0.4
   is closed with no work.
2. **The 27 timeouts are `packages/api/src/notify.ts`, not the eight
   `packages/db` helpers first suspected.** The test log names it three ways:
   `[notify] academy lookup failed`, `[notify] inbox write failed`, `[notify]
   delivery failed`, all `DrizzleQueryError` on queries against `organization`,
   `notification` and `user left join push_token`. Those are `deliver()`'s three
   reads and writes, and they run on the module-level `db`, which
   `packages/api/vitest.config.ts:11` points at `postgres://api-test-dummy/db`.
   Because `notify` swallows every error by design, nothing fails loudly. The
   suites fail on the 30-second timeout instead, which is why the three slowest
   files are exactly the three that approve, archive, restore or purge a member.
   Item 0.2 rewritten to match.

That comment at `packages/api/vitest.config.ts:6-10` says "nothing can silently
fall back to this URL". It is wrong, and it has been wrong since `notify.ts`
landed.

- **0.1** baseline recorded, no code changed.
- **0.4** already green at this base, closed with no work.
- **0.2** notify path no longer reaches the singleton `db`. Every function on
  that path now takes the executor. `packages/db`: `insertNotifications(rows,
  exec)`, `getPushTargets(userIds, exec)`, `getAcademyPublic(academyId, exec)`
  with the `= db` default dropped, `claimDueReminderClasses(opts & { exec })`,
  `claimDueDuesReminders` with `exec` required and the `?? db` fallback gone.
  `packages/api/src/notify.ts`: `deliver`, `academyName`, the four `notify*`
  exports, `runReminderSweep(exec, opts)` and `sweepDuesReminders(exec, opts)`.
  Callers: `router/membership.ts`, `router/notification.ts`, `router/class.ts`
  twice, `router/dropin.ts` twice pass `ctx.baseDb`; the remind cron route passes
  `db`. `reminder.ts`, `dues-reminder.ts`, `notification.ts` and `push-token.ts`
  no longer import the singleton at all, so it is now unreachable from them.
  Two things worth noting. `NotifyScope` in `router/class.ts` needed a `baseDb`
  field, and typing it meant importing `DbExec`, which routers cannot pull from
  `@matops/db/client` because `packages/api/eslint.config.ts:16-29` bans that
  path. Fixed by re-exporting the type from `tenant.ts`, so `@matops/db` now
  carries it. And `packages/db/dist` is stale until `pnpm -F @matops/db build`
  runs, so editor diagnostics lie about missing exports until then.
  Gates after the change: typecheck 17/17, lint 15/15. Test effect unverified,
  that is item 0.3.
  Split out: item **0.5**, the db helpers outside the notify path that still
  hard-code the singleton. 0.2 deliberately touched only what the failing suites
  reach.

- **0.3** the fix did not work, and the real cause is worse than the plan
  assumed. Full run after 0.2: still 27 failed / 107 passed, same three files,
  same wall-clock times (125s, 245s, 342s). The `[notify]` error lines are gone,
  so 0.2 did fix what it claimed. It was simply not the cause.

  **What is actually happening.** Every failure is a timeout, not an assertion.
  Running `test/booking-gate.test.ts` alone shows the shape: the first ten tests
  pass in 4-18ms each, then `approving a student in a one-plan academy
  auto-assigns the plan` times out at 30s, and every test after it fails in
  `beforeEach` with `Hook timed out in 30000ms`. Four failures times 30s is the
  125s file time. The last of the four passes on its own when run with `-t`.
  So one test wedges the connection and the rest of the file dies behind it.

  **The cause.** `membership.approve` is a `staffProcedure`, so the whole
  resolver runs inside `withTenant`. At `membership.ts:477` it calls
  `setMemberRoleStatus(input.memberId, granted, ctx.baseDb)`, an identity write
  on the base handle, while that transaction is still open.
  `packages/api/test/helpers.ts:36-52` hands the same `execOn(pg)` in as
  `baseDb`, and `enforceTenant` opens the tenant transaction on that same
  handle. PGlite is one connection. The base write queues behind the open
  transaction, and the transaction is awaiting the base write. Self-deadlock,
  until vitest's 30s timeout kills it and leaves the connection wedged for every
  later `beforeEach`.

  This is precisely the hazard ADR 66 documents and that `ownerIdentityProcedure`
  (`trpc.ts:316-332`) was created to dodge. The three failing suites are exactly
  the three that approve, reject, archive, restore or purge a member.

  **It is not only a test problem.** In production the pool hands out a second
  connection, so nothing hangs. The request just holds two pooled connections for
  its whole duration, which ADR 66 already warns about. With `max: 20` that
  halves effective capacity under concurrent approvals.

  Plan item 3 and this are the same defect. New items **0.6** (the mechanism) and
  **0.7** (move the eight mutations onto it) supersede item 1.5.

- **0.6 attempt 1, abandoned. No code shipped, `trpc.ts` is byte-identical to
  HEAD and typecheck is 17/17.**

  The idea was to reuse the existing `afterCommit` queue for identity writes and
  hand the base handle to the task after COMMIT, plus type `ctx.baseDb` away
  inside tenant resolvers so the bad move becomes a compile error. The type guard
  worked immediately and flagged all 12 offending sites in `membership.ts`, which
  is why it is kept as item **0.8**.

  The queue itself is wrong. It forces one ordering on every mutation, and the
  mutations do not agree on the ordering. `archive` (`membership.ts:544-546`)
  writes status FIRST on purpose, and the comment says why: status is the access
  gate, so a race cannot book a seat in the gap between cancelling the member's
  seats and revoking their access. Deferring that write to after COMMIT reverses
  the order and reopens exactly that race. `approve` wants the opposite order.
  A middleware cannot offer "before the transaction opens" either, because the
  resolver already runs inside it.

  So the ordering has to belong to the resolver, not the seam. Item 0.6 rewritten
  around generalizing `ownerIdentityProcedure`: authorize like a tenant tier, do
  not open the transaction, hand the resolver `ctx.withTenant(fn)` and let it
  decide. That keeps one connection open at a time and leaves each mutation's
  ordering choice intact.

  0.6 and 0.7 will now land together. The type guard in 0.8 makes them
  inseparable, so splitting them only produces a red tree in between.

- **0.6 + 0.7 landed together. The deadlock is gone: 27 failures down to 6, and
  the three suites went from 11 minutes to 8 seconds.**

  The design shrank once I classified the eight mutations. Five of them
  (`reject`, `suspend`, `restore`, `promote`, `setRole`) never touch a tenant
  table at all. They read `member` and write `member`, both identity work. They
  needed no new mechanism, only the right tier. Only three are genuinely mixed:
  `approve`, `archive`, `purge`.

  `trpc.ts`: `ownerIdentityProcedure` generalized into an `identityProcedure`
  factory, giving `staffIdentityProcedure` and `ownerIdentityProcedure`. Both
  authorize exactly as before and add `ctx.withTenant(fn)`, which opens the
  scoped transaction around only the part that needs it.

  `router/membership.ts`: eight mutations moved over, plus a small
  `identityScope(ctx)` so `requireMember` reads through `ctx.baseDb` when there
  is no ambient transaction. Every ordering is unchanged. `archive` still writes
  status before releasing seats, `purge` still archives first, `approve` still
  grants the role before assigning the plan. `approve` also stopped needing
  `afterCommit` for its welcome push: with no ambient transaction, a plain await
  is already outside one.

  Gates: typecheck 17/17, lint 15/15. `booking-gate` is fully green, 14/14 in
  791ms, having been 4 failures in 124s.

  The six that remain are pre-existing and were all inside the original 27. Five
  are one bug: the test sends `belt: "blue"` and `RANK_SYSTEMS` stores `"Blue"`,
  and `isValidRank` compares case-sensitively. New item **0.9** covers them.

- **0.9 done. `@matops/api` is fully green: 134 passed / 134, in 10.77s.** From a
  baseline of 107 passed / 27 failed in about 11 minutes.

  All six were test bugs, not product bugs, and all three causes were casing or
  format mismatches that the timeouts had been hiding:
  1. `instructor-desk.test.ts` sent `belt: "blue"`; `RANK_SYSTEMS`
     (`packages/domain/src/rank.ts:44`) stores `"Blue"`. I checked which side was
     wrong before touching anything: `member-detail.tsx:175,291` picks belts
     straight out of `system.belts`, and both seeds write `"White"` / `"Blue"`
     (`seed/data.ts:582`, `seed/augment.ts:460`). Production sends capitalized,
     so the rule is right and the test was wrong. Left `isValidRank` alone.
  2. `membership-lifecycle.test.ts` sent `discipline: "BJJ"`; the `RANK_SYSTEMS`
     key is `"bjj"`. Same shape, same call.
  3. `instructor-desk.test.ts` sent a full ISO datetime for `nextDueAt`;
     `SetMemberDuesSchema` (`packages/validators/src/index.ts:510`) wants
     `z.iso.date()`, a `"YYYY-MM-DD"` calendar date.

  `member-scope.test.ts:79-80` also uses lowercase, and passes, because it
  asserts a rejection that happens before the rank is validated. Left alone.

  Constraint amended while doing this: the "tests only at a GATE" rule now allows
  an item whose whole job is verification to run the specific files it is
  verifying, scoped to one package. Running the full suite still waits for a gate.

- **0.5 done. No module in `packages/db` reaches the singleton any more.** The
  only remaining `import { db }` outside `client.ts` is `seed.ts`, a CLI entry
  point, which is correct.

  Fifteen functions took a required `exec` and lost their `= db` default:
  `invite.ts` all five, `push-token.ts` two, `dropin.ts` three,
  `academy-settings.ts` three, `academy-code.ts` three, plus
  `runMaterializationSweep`, whose `SweepOptions.exec` went from optional to
  required. `materialize.ts` also stopped deriving its `Executor` type from the
  singleton (`typeof db`) and now uses `DbExec | TenantTx` directly, which is what
  finally cut the last import.

  Callers updated: `router/invite.ts` five sites, `router/pushToken.ts` two,
  `router/dropin.ts` two, `router/attendance.ts` one, `router/membership.ts` one,
  `auth/src/index.ts` one, and the materialize cron route, which now passes `db`
  the way the remind route already did.

  Gates: typecheck 17/17, lint 15/15.

  **What this surfaced.** Threading the handle forced a choice at each call site,
  and five of them had no good answer. `invite.list/create/rotate/revoke` are
  `ownerProcedure` and `attendance.addVisitor` is `staffProcedure`, so all five
  run inside `withTenant`, and all five reach the base connection. That is
  exactly the 0.7 defect, still live, in five more procedures. It has never been
  seen because all five have zero tests. 0.5 passed `ctx.baseDb` at each site,
  which preserves today's behaviour and fixes nothing there. New item **0.10**
  does the real fix with tests.

- **0.10 done. The five latent deadlocks are gone and covered.**

  `invite.list/create/rotate/revoke` moved to `ownerIdentityProcedure`. They
  touch only `academy_invite`, so they need no tenant transaction at all and use
  `ctx.withTenant` nowhere. `attendance.addVisitor` moved to
  `staffIdentityProcedure` and wraps its one tenant read,
  `assertMarkable(ctx.db, …)`, in `ctx.withTenant`. Order unchanged: assert the
  class is markable, then write the lead.

  New suite `packages/api/test/identity-seam.test.ts`, 5 tests, 508ms, covering
  what previously had zero coverage: the invite create → list → rotate → revoke
  round trip, resolve on a live token and `NOT_FOUND` on a revoked one, the
  owner-only tier plus cross-academy isolation, the walk-in visitor, and the
  refusals for a student and for a foreign class.

  Two things the tests caught in my own work, not in the product:
  `class.id` is a uuid, so a readable string id fails the insert outright. And I
  first asserted that a repeat `addVisitor` for the SAME class increments
  `visitCount`. It does not, by design: `createDropIn`
  (`packages/db/src/dropin.ts:106`) only counts a visit when the class differs,
  and says so. The test now asserts the documented rule, that a double submit for
  one class stays at 1 and a genuinely new class goes to 2.

  Gates: typecheck 17/17, lint 15/15.

- **0.8 done. Reaching the base connection from inside a tenant transaction is
  now a compile error.**

  `enforceTenant` overrides `baseDb: undefined` in the context it hands to
  `next()`, so a tenant resolver has no base handle to reach for. `afterCommit`
  became `(exec: DbExec) => Promise<void>` and the middleware passes the real
  handle when it runs the task, after COMMIT, which is the one moment the
  connection is free.

  It broke exactly four call sites, all of them notify closures that were already
  correct in behaviour and merely closed over `ctx.baseDb`: `router/class.ts`
  twice, `router/notification.ts` once, plus `NotifyScope`, which dropped its
  `baseDb` field. Each now takes the handle as a parameter. Nothing else in the
  codebase was reaching, which is the evidence that 0.7 and 0.10 caught them all.

  One correction to what item 0.10 assumed: `academy.current` (`academy.ts:82`)
  is `protectedProcedure`, not a tenant procedure, so its `ctx.baseDb` read was
  never at risk. The earlier note calling it "the same shape" was wrong.

  Gates: typecheck 17/17, lint 15/15.

### GATE 0 — passed, 2026-08-24

**Gates.** `pnpm typecheck` 17/17. `pnpm lint` 15/15. `pnpm test` **589 passed,
0 failed, 5/5 packages, 19.4s**. Baseline was 27 failed / 562 passed in 5m49s.

Per package: domain 318, db 105, api 139 (up 5, the new identity-seam suite),
validators 24, notifications 3.

**Docs.** ADR [92](issues/92-identity-writes-leave-the-tenant-transaction.md)
written, numbered 92 rather than 85 because the frontend branch already holds
85-91 and has not merged. `architecture.md` §0 amended and §4 extended with the
identity tiers. `map.md` index row added. One `CHANGELOG.md` entry. Roadmap gets
a new slice **5.4** under Phase 5 pointing at the plan and this run file.
`spec.md` untouched: no user-visible behaviour changed.

**What Phase 0 actually did.** It set out to make the gates readable and found a
live architectural defect underneath. Thirteen procedures ran inside the tenant
transaction and then wrote an identity table on the base connection. In tests
that self-deadlocks on PGlite's single connection; in production the pool absorbs
it by handing out a second connection, so every approve, archive, restore, purge,
invite action and walk-in held two of twenty. ADR 66 had already named the
hazard. Nothing enforced it, so it spread.

Eight items became eleven. Three of the extra ones (0.5, 0.9, 0.10) exist only
because a previous item's work exposed something the plan had not seen, which is
the adjust rule doing its job. One item (0.6) was attempted, found wrong, and
reverted with nothing shipped.

**Two things the plan got wrong, both recorded above.** Root lint was never red
on `main`, only on the frontend branch. And the 27 timeouts were not the
`packages/db` singleton helpers, which is what 0.2 fixed; 0.2 was worth doing but
did not move the number.

**Carried into Phase 1.** Item 1.5 is superseded by 0.7. Item 1.1, the
transaction rollback, is now more interesting than when it was written: with
identity writes outside the transaction, what the transaction does on a thrown
error is a sharper question, not a softer one.

**Next.** Compact, then restart the loop. Phase 1 opens with a rebase on `main`.

---

### Phase 1

**Rebase check.** `main` is still `0243e23`. Nothing to rebase. Phase 0's work is
uncommitted in the worktree.

**1.1 done.** The plan proposed a private marker thrown inside the `withTenant`
callback and caught outside. I tried that first and it broke the whole file:
typing the caught result as `Awaited<ReturnType<typeof next>>` makes the context
inference circular, and every `ctx.db` / `ctx.academyId` in every router went to
`any`. The simpler fix does the same job with no marker and no catch. Read
`@trpc/server` `callRecursive` and confirmed it wraps our middleware in its own
try/catch, so `throw attempt.error` comes back to tRPC as the identical
`{ ok: false, error }` object, and `getTRPCErrorFromUnknown` passes an existing
`TRPCError` through untouched. So the middleware just rethrows. The
`if (result.ok)` guard on the `afterCommit` drain is now unreachable-by-failure
and became a plain loop.
Files: `packages/api/src/trpc.ts:263-286`, `packages/api/test/helpers.ts`
(extracted `ctxFor` so a test can build a caller for its own router),
`packages/api/test/tenant-rollback.test.ts` (new),
`docs/issues/13-booking-write-atomicity.md` (amendment appended).
Ran the one new file, not the suite: 2 passed. Then reverted the fix in place and
re-ran to prove both cases fail without it, then restored. The test targets the
middleware contract through a two-procedure probe router, not one mutation's
incidental behaviour, so it survives any router refactor.
Surprise worth keeping: this bug was live in every two-step mutation on a tenant
procedure, and ADR 13 line 67 has promised the opposite since session 10.

**1.2 done.** `packages/db/test/rls-coverage.test.ts` (new, 5 tests). It asks
Postgres, not the schema file: every `public` table with an `academy_id` column
must have `relrowsecurity` true and at least one row in `pg_policies`.
Correction to the plan: the exception list is **one** table, not two. `member`
never matched, because Better Auth names its column `organization_id`, not
`academy_id`. It is an identity table and is out of scope by design, so widening
the query to catch it would have made the guard say something it does not mean.
The only real exception is `academy_invite`, and the reason lives in the code as
the map value.
Went one step past the item: the guard also proves the exception cannot rot. It
fails if an exempt table later gains RLS or a policy, if a name in the list no
longer exists, and if `matops_app` holds any of SELECT / INSERT / UPDATE /
DELETE on it. That last one is what actually protects `academy_invite`, since it
has no policy to protect it. The exception is now self-justifying rather than a
bare allowlist.
Proved it bites, twice, by editing `0017_common_greymalkin.sql` in place and
re-running: commenting out `CREATE POLICY "member_note_isolation"` fails the
policy test naming `member_note`, and commenting out its
`ENABLE ROW LEVEL SECURITY` fails the RLS test. The second is the case that
matters, because RLS-on-with-no-policy fails closed while RLS-off fails open.
Migration restored, `git diff --stat packages/db/migrations/` is empty.

**1.3 done.** Two changes, one new module, one new test file.
Redaction: `errorFormatter` now runs `shape.message` through
`publicErrorMessage(code, message)`, which returns a fixed string when the code
is `INTERNAL_SERVER_ERROR` and `NODE_ENV` is production. Exported and checked at
call time rather than folded into a module constant, so it is testable: the
formatter itself never runs through `createCaller`, only through the HTTP
handler, so a constant would have made the rule unreachable from a test.
Known consequence: two routers throw `INTERNAL_SERVER_ERROR` on purpose,
`academy.ts:189` "Could not create the academy" and `payments.ts:91` "Could not
create the plan". Both are server faults with no user action attached, so
replacing them in production is right, not a regression.
Narrowed catch: `payments.claim` caught everything and told the user a payment
was already awaiting confirmation. An RLS denial, a dropped connection or a
check-constraint failure all became a friendly CONFLICT. It now rethrows
anything that is not `23505`.
The `23505` reader moved out of `referral.ts` into `packages/api/src/pg-error.ts`
as `isUniqueViolation`, unchanged, now imported by both callers.
`packages/api/test/error-shape.test.ts` (new, 8 tests) covers the predicate
through a Drizzle-style wrapped cause chain, a different Postgres code, a
code-less error, a cause cycle, and the three redaction cases.
Files: `packages/api/src/trpc.ts`, `packages/api/src/pg-error.ts` (new),
`packages/api/src/router/referral.ts`, `packages/api/src/router/payments.ts`,
`packages/api/test/error-shape.test.ts` (new).

**1.4 done.** Migration `0027_missing_indexes.sql`, plus the four index
declarations in the Drizzle schema so a later `generate` does not try to drop
them again. Re-read each query first rather than trusting the plan: all four
gaps are real, and three of the four are cross-academy cron sweeps, which is why
the existing academy-first indexes cannot serve them.
Took the partial form on both scheduling indexes, which the plan offered as an
option. `cl_reminder_due` is `(starts_at) WHERE reminder_sent_at IS NULL AND
deleted_at IS NULL`: a class leaves the index once its reminder is sent, so the
index stays the size of the pending set instead of growing with history forever.
`ct_sweep_stale` is `(status, generated_until) WHERE deleted_at IS NULL`.
`member_by_user` is the one that is not a cron: `listAcademiesForUser`
(`membership.ts:136`) filters `member.user_id` alone and `member_by_org_user`
leads with `organization_id`, so it could not be used. That query runs on every
academy switch and every mobile sign-in.
Generated with `drizzle-kit generate`, not hand-written, so the snapshot and
journal are consistent. `drizzle-kit check` says "Everything's fine". Note the
worktree has no `.env`, so both commands needed a dummy `POSTGRES_URL`. Generate
and check are offline, so nothing touched Neon.
Verified the migration applies by running three `packages/db` suites that boot
`freshDb()`: 13 passed.
**For the gate:** `docs/architecture.md` still says the migration set is
`0000`-`0020` and `CLAUDE.md` says `0026` is the last applied. 0027 is written
and NOT applied to Neon. Both need the doc pass at GATE 1.

**1.6 done, four of the five.** Capped `booking.mine` at 300,
`referral.history` at 200, `note.forMember` at 200 and `payments.claims` at 500,
each behind a named const with a `ponytail:` comment giving the ceiling and the
upgrade path. All four already order newest-first, so the cap drops the oldest
rows, which is the right end.
**`attendance.list` is not on the list, and the plan was wrong to put it there.**
It reads the participants of ONE class, so it is bounded by how many people fit
in a room, not by time. Worse, it returns `attendanceCounts(rows)` derived from
the same rows, so a `LIMIT` would make the present/absent counts lie before it
ever protected anything. A cap set high enough to be safe would never bind, which
is a dead branch. Left alone deliberately.
Checked `booking.mine` before capping it, because a cap there could have
silently broken the training stats. It does not: stats come from `stats.me`, a
separate procedure. `booking.mine` only feeds the Upcoming and Past lists, and
`desc(startsAt)` keeps every upcoming class plus the most recent past ones.
Files: `packages/api/src/router/booking.ts`, `referral.ts`, `note.ts`,
`payments.ts`. No test: a `LIMIT` on a newest-first read changes no rule, and the
existing suites already cover these procedures' shape.

**1.7 done.** Removed `setCorsHeaders`, both of its call sites and the `OPTIONS`
export from `apps/nextjs/src/app/api/trpc/[trpc]/route.ts`. Took the `OPTIONS`
handler with it: a preflight reply that sets no CORS headers tells a browser
nothing, so keeping it would have been decoration.
Checked the two clients before deleting rather than trusting the plan.
`apps/expo/app.config.ts` declares `ios` and `android` only, no web target, and
React Native's fetch is not CORS-bound. The Next clients are same-origin, and a
same-origin request never preflights. There was no `Access-Control-Allow-Credentials`,
so no browser would have sent the session cookie cross-origin anyway. The
wildcard granted nothing and advertised the endpoint.
Grepped the whole repo: no other `Access-Control-Allow-Origin`.

---

## GATE 1 — passed

**Gates.** `pnpm typecheck` 17/17. `pnpm lint` 15/15. `pnpm test --force`
**604 passed, 0 failed** across 5 packages: domain 318, api 149, db 110,
validators 24, notifications 3. Baseline at the end of Phase 0 was 589, so the
phase added 15 tests and broke none.

**Docs, per `delivery.md` §4.** ADR
[93](issues/93-safety-pass-before-the-pilot.md) written, covering all five
changes and amending ADR 13. Index row in `docs/map.md`. `docs/architecture.md`
§0 migration paragraph rewritten: it claimed the set was `0000`-`0020` and
applied through `0018`, which had been wrong for seven migrations. It now reads
`0000`-`0027`, applied through `0026`, with `0027` written and not applied.
Roadmap slice 5.4 updated. One `CHANGELOG.md` entry. `docs/spec.md` untouched:
nothing user-visible changed except error copy, which the changelog carries.

**What the phase was.** Five failures that nobody had reported, because none of
them announces itself. The transaction rollback is the one that mattered most:
`docs/issues/13` had promised it since session 10, the SQL was written to rely on
it, and it had never happened once. Any mutation that wrote and then threw kept
the write.

**Three places the plan was wrong, all corrected in place.**
1.1's marker-and-catch design broke context inference across every router and was
replaced with a plain rethrow. 1.2's exception list had two tables; `member`
never matched, because Better Auth names its column `organization_id`. 1.6 listed
`attendance.list`, which must not be capped: it is bounded by room size, and its
present/absent counts derive from the same rows a `LIMIT` would cut.

**Both structural guards were proved to bite before being kept.** Commenting out
a `CREATE POLICY` in migration `0017` fails the RLS test by name, and commenting
out its `ENABLE ROW LEVEL SECURITY` fails the other one. Reverting the rollback
rethrow fails both of its cases. A guard that has never failed is not a guard.

**Carried forward.** Migration `0027` is written and **not applied to Neon**. It
needs `pnpm -F @matops/db migrate` on the next deploy. All four are plain
`CREATE INDEX`, which briefly locks writes; at pilot size that is milliseconds.
This joins the open operational items in `CLAUDE.md`, alongside rotating
`AUTH_SECRET`.

**Next.** Compact, then restart the loop. Phase 2 opens with a rebase on `main`
and is the first phase that only moves code: one copy of each repeated query.

---

**Run mode changed, 2026-08-25.** One invocation now does a whole phase and stops
at its gate, instead of one item. Requested after Phase 1, where seven items cost
seven turns for no benefit: the stop between items bought nothing, because the
file is written after every item anyway. See **How to run it** above for the new
turn shape and the three cases that still break a phase early. Nothing else about
the plan changed: the per-item Definition of done, the doc work, and the gate are
the same.

---

### Phase 2

Rebase: none needed. `main` is still `0243e23`, the commit the plan was written
from, so every line reference in Phase 2 is current.

**2.1 One roster read.** `rosterOf(ctx)`, `nameByUser(rows)` and
`nameByMember(rows)` added to `packages/api/src/members.ts`, next to the
`requireMember` / `staffOf` guards that already take a `MemberScope`. All 13
`listMembersOf(ctx.academyId, ctx.db)` calls now go through `rosterOf`, and no
router imports `listMembersOf` from `@matops/db` any more: the roster read enters
the API through one module.

The name Map was the part worth extracting. Five sites built one by hand and the
key differed between them: `userId` in `rank.ts`, `stats.ts` and half of
`referral.ts`, `memberId` in `payments.ts` and the other half of `referral.ts`.
Two rows of the same roster, two different id columns, one `.get()` away from a
silent "Member" fallback that never resolves. Two named functions make the choice
explicit at the call site.

Files: `packages/api/src/members.ts` (+3 exports), and the call sites in
`attendance.ts`, `membership.ts`, `notification.ts`, `payments.ts`, `rank.ts`,
`referral.ts`, `stats.ts`.

`stats.ts` imports the helper as `userNames`, because the read it builds already
returns a field called `nameByUser` that two procedures destructure by that name.
Aliasing the import was smaller than renaming the field through both.

Test: `packages/api/test/members.test.ts`, 3 cases, all pure. Each asserts the
map answers on its own id and returns `undefined` for the other one, which is the
mistake the two functions exist to prevent.

Gates: `tsc -p tsconfig.json` and `tsc -p test/tsconfig.json` clean,
`pnpm -F @matops/api lint` clean.

**2.2 One "is this user in this academy".** `requireMembership(userId,
academyId, exec, message)` in `packages/api/src/members.ts`, beside
`requireMember`. It answers NOT_FOUND on a miss and returns the row on a hit.

The plan listed four implementations. Only two of them are the same question:

- `academy.setActive` said FORBIDDEN. The academy id comes from the caller, so
  NOT_FOUND is the consistent answer. Changed.
- `attendance.addWalkIn` already said NOT_FOUND. Now says it through the helper.
- `members.ts:38-47` is `requireMember`, which resolves a **member id**, not a
  user id. Different key, same miss behaviour, already correct. Left alone.
- `trpc.ts:228` (`resolveActiveMembership`) is **not** the same question and
  keeps FORBIDDEN. It asks about the caller's own active academy, taken from
  their session, not from input. There is no foreign id to protect, and the
  answer means "you are signed in but not entitled here", which is what
  FORBIDDEN says. Collapsing it would have been wrong.

The message stays a parameter. "You are not a member of that academy" and "That
person is not a member of this academy" are different sentences about different
people, and merging them would make one of the two read wrong. What the helper
fixes is the **code**, which is the part a third caller could get wrong.

Behaviour change: `academy.setActive` now returns NOT_FOUND instead of FORBIDDEN.
No client reads the code, only the message, so nothing breaks. One stale comment
in `apps/expo/src/app/checkin/[academyId].tsx:52` named the old code and was
updated.

Files: `packages/api/src/members.ts`, `router/academy.ts`, `router/attendance.ts`,
`apps/expo/src/app/checkin/[academyId].tsx`.

Test: `packages/api/test/membership-miss.test.ts`, 4 cases, run and passing. It
asserts that a foreign academy and a non-existent academy give the **same**
answer, which is the property the code choice exists for, plus that a real member
still passes the walk-in check.

**2.3 One payments read module.** New file `packages/api/src/payments-read.ts`,
four exports:

- `readPaymentSettings(db)` replaces 4 copies of the single-row read, each of
  which selected a different subset of the same three columns. It applies the
  defaults itself, so a caller cannot pick a different one.
- `readAllDuesWithPlan(db)` and `readDuesWithPlan(db, memberId)` replace 4 copies
  of `memberDues innerJoin membershipPlan`. One `DUES_COLUMNS` map feeds both, so
  the four different column subsets became one row shape. The extra columns cost
  nothing: three of the four reads are `LIMIT 1`.
- `readOpenClaim(db, memberId, period)` replaces the 2 byte-identical
  period-scoped lookups, in `payments.mine` and `payments.claim`. Those two must
  agree or the screen offers a button the mutation then refuses.

`loadGateSettings` in `payments-gate.ts` is deleted; it was the fourth settings
copy. `payments-gate.ts` and `membership.ts` now call `readPaymentSettings`.

**A real defect, found by the extraction.** `payments.getRequisites` defaulted
`graceDays` to a literal `7`. `loadGateSettings` defaulted it to
`DEFAULT_GRACE_DAYS`. Two numbers that happen to be equal today, in the two
places that must never disagree: the screen where an owner sets the grace period
and the gate that enforces it. Changing the domain constant alone would have
silently desynced them. Now one function answers both.

The plan counted 4 copies of the open-claim lookup. Only 2 are the same question.
`payments-gate.ts` asks "any open claim at all" with no period, and
`membership.ts:361` asks for every member with one, as a list. Different
questions, left where they are.

Not changed: `packages/db/src/payments-schema.ts:151` carries the same literal
`7` as the column default. Pointing it at `DEFAULT_GRACE_DAYS` would make
`@matops/db` depend on `@matops/domain` for one number, and the value is already
baked into migration `0025` on Neon, so the TS change would be cosmetic.

Files: `packages/api/src/payments-read.ts` (new), `payments-gate.ts`,
`router/payments.ts`, `router/membership.ts`.

Test: one case added to `packages/api/test/payments.test.ts` covering the settings
defaults with no `payment_settings` row, which is the branch the literal `7` sat
in. The agreement properties the other extractions protect were already covered
there ("a second claim for the same period is refused", "the member list dot
agrees with the student's own view"). Ran `payments.test.ts` (8 passed),
`booking-gate.test.ts` and `membership-lifecycle.test.ts` (35 passed).

**2.4 One class pre-read and one booking counter.** New file
`packages/api/src/classes.ts`, four exports:

- `requireClassFacts(db, classId)` replaces the 3 copies of the
  `{status, startsAt, deletedAt}` pre-read plus its NOT_FOUND throw, in
  `booking.book`, `checkin.checkIn` and `attendance.assertMarkable`. Only the
  read is shared. What each caller does with the facts stays at the call site,
  because the three rules are different: `canBook`, "isn't running", and
  `canMarkAttendance`.
- `liveClass(classId)` replaces the 5 copies of
  `and(eq(class.id, x), isNull(class.deletedAt))` in `class.ts`.
- `claimSeat(db, classId)` replaces the 2 byte-identical increments in
  `booking.book` and `checkin.checkIn`.
- `releaseSeats(db, classIds)` replaces the 2 decrements. They were not
  byte-identical: `booking.cancel` decremented one class, the member-removal
  path in `membership.ts` decremented a list. The list form covers both, and the
  empty-list guard moved from `membership.ts` into the helper, so a future caller
  cannot pass an empty array to `inArray` and get a broken query.

`CLASS_NOT_FOUND` is exported from the same file, which is the start of what item
2.6 will finish. `class.ts` still throws the string literal at 8 more sites.

Files: `packages/api/src/classes.ts` (new), `router/booking.ts`,
`router/checkin.ts`, `router/attendance.ts`, `router/class.ts`,
`router/membership.ts`. Three routers dropped now-unused `sql` and
`classInstance` imports.

Test: `packages/api/test/classes.test.ts`, 2 cases on `requireClassFacts`. The
counter needed no new test: `booking-count.test.ts` already asserts the stored
count against the actual confirmed participations across all four paths that move
it, which is the invariant the extraction has to keep. Ran `booking-count`,
`booking-gate` and `membership-lifecycle` after the change: 47 passed.

**2.5 One "notify the booked students of this class".** `notifyBookedOfChange`
in `class.ts` became `notifyBooked(ctx, row, send)`, where `send` is the notify
function to queue. `notifyClassChanged` and `notifyClassCancelled` have the same
signature, so the parameter is typed `typeof notifyClassChanged` rather than a
new interface.

The `cancel` mutation's 22 inline lines are gone. All three callers (full edit,
coach reassignment, cancel) now share one read of the booked students, one
time-zone resolve and one `afterCommit` queue. `class.ts` is 40 lines shorter.

Test: `packages/api/test/class-notify.test.ts`, 2 cases. This path had no
end-to-end coverage at all: nothing asserted that cancelling a class actually
reaches the booked student's inbox. The test drives the real router and reads the
`notification` table.

Proved it bites. Passing `notifyClassChanged` to the cancel call site (the exact
mistake a shared function with a callback parameter makes possible) fails the
cancel case and leaves the other passing. Restored, and `class.ts` matches the
intended state.

**2.6 One place for the repeated user-facing strings.** New file
`packages/api/src/messages.ts`, five constants:

| Constant | Copies before |
|---|---|
| `CLASS_NOT_FOUND` | 6 |
| `TEMPLATE_NOT_FOUND` | 4 |
| `PLAN_NOT_FOUND` | 3 |
| `CLAIM_HANDLED` | 2 |
| `LAST_OWNER` | 2 |

`TEMPLATE_NOT_FOUND` was not on the plan's list. A count of every message
literal in `packages/api/src/router` found it at 4 copies in `template.ts`, above
the "three or more" bar the phase sets, so it went in with the rest.

One file rather than one constant per domain module. These are product copy: the
reason they were duplicated is that nobody knew where to look for the existing
wording. `classes.ts` now imports `CLASS_NOT_FOUND` from here instead of
declaring it, so item 2.4's constant did not become a second home.

**The last-owner pair.** `setStatusOrRejectLastOwner` and
`setRoleOrRejectLastOwner` in `membership.ts` were the same function with one
word changed, and each carried its own copy of the message. Both are replaced by
`rejectIfLastOwner(write)`, which takes the `@matops/db` call as a promise and
turns `{ok: false}` into the error. The four call sites now name the db function
they run, which is clearer than the wrapper name was.

Files: `packages/api/src/messages.ts` (new), `classes.ts`, `router/class.ts`,
`router/booking.ts`, `router/template.ts`, `router/payments.ts`,
`router/membership.ts`.

Test: one case added to `membership-lifecycle.test.ts`, "refuses to step the last
owner down to instructor". The status path already had "refuses to leave the
academy without an owner"; the role path had nothing, and it is the half a
wiring mistake in the collapsed function would break. 22 passed.

Full `@matops/api` suite after the item: **161 passed, 20 files**, up from 149 at
the end of Phase 1.

---

## GATE 2 — passed

**Gates.** `pnpm typecheck` 17/17. `pnpm lint` 15/15. `pnpm test --force`
**617 passed, 0 failed** across 5 packages: domain 318, api 162, db 110,
validators 24, notifications 3. Baseline at GATE 1 was 604, so the phase added 13
tests and broke none.

**Docs, per `delivery.md` §4.** ADR
[94](issues/94-one-copy-of-each-query.md) written. Index row in `docs/map.md`.
`docs/architecture.md` §0 gained a "Pre-pilot backend restructure, phases 1-2"
section covering both ADR 93 and 94, and the procedure-tiers bullet now names
`requireMembership` beside `requireMember`, with the `resolveActiveMembership`
exception stated. `docs/roadmap.md` slice 5.4 flipped to "Phase 2 done".
`CHANGELOG.md` has the entry.

**No `docs/spec.md` change.** The one behaviour difference in the phase,
`academy.setActive` answering NOT_FOUND instead of FORBIDDEN, is invisible to a
user: no client reads the code and the message is unchanged. The spec describes
behaviour, not error codes.

**What the phase actually found.** Two things worth more than the line count:

1. `payments.getRequisites` and the booking gate carried **two separate defaults
   for the grace period**. Both are `7` today, so nothing was broken. Editing
   `DEFAULT_GRACE_DAYS` would have moved one and not the other, and no test would
   have failed. This is the class of bug that duplicated reads produce, and the
   only reason it surfaced is that someone put the four copies side by side.
2. **`class.cancel` had no test at all.** Nothing asserted that cancelling a class
   reaches the booked student's inbox, in a product whose whole point is that
   students find out. `class-notify.test.ts` covers it now.

**Numbers.** `packages/api/src` gained three files (`payments-read.ts`,
`classes.ts`, `messages.ts`) and four exports in `members.ts`. `class.ts` is 40
lines shorter. Thirteen roster reads, four payment-settings reads, four
dues-plus-plan joins, five class predicates, two increments, two decrements, two
notify blocks and 17 message literals all became one copy each.

**Carried forward, unchanged.** Migration `0027` is still written and **not
applied to Neon**. It needs `pnpm -F @matops/db migrate` on the next deploy.

**Next.** Compact, then restart the loop. Phase 3 opens with a rebase on `main`
and is the first phase that moves logic rather than queries: rules out of the
routers and into `packages/domain`, each with its test written before the caller.

---

### Phase 3

Rebase: none needed. `main` is still `0243e23`.

**3.1 Booking copy and the client-side `canBook`.**
`notBookableMessage(reason)` added to `packages/domain/src/booking.ts`, beside
`canBook` and `NotBookableReason` rather than beside `bookingAccessMessage` in
`payments.ts`. Same style, better locality: the rule and its copy sit together.

Its parameter is `Exclude<NotBookableReason, "deleted">`. A deleted class is a
404, not a message, so the type makes every caller handle that case before it can
ask for copy. The router's `if (reason === "deleted")` branch narrows it for
free.

The `too-far-ahead` string changed from "You can book up to a week ahead" to
"You can book up to 7 days ahead", interpolating `BOOKING_WINDOW_DAYS`. The old
copy spelled the number as a word, so changing the constant would have left the
sentence lying.

**The `BOOKING_WINDOW_DAYS` gap is closed.** Both clients reimplemented
`cancelled` and `past` and neither knew about the window, so a deep link to
`/class/<id>` for a class three weeks out showed a live Book button the server
then refused. Both now call `canBook` and render `notBookableMessage`:

- `apps/nextjs/src/app/_components/class-detail.tsx` shows the refusal and
  disables both Book buttons on `!bookable.ok`. Cancel stays reachable for a
  future class, unchanged.
- `apps/expo/src/app/class/[id].tsx` shows the refusal in place of the Book
  button. Its `action` ternary lost its two hand-written branches.

Test: 3 cases in `packages/domain/test/booking.test.ts`, written before the
callers switched (`delivery.md` §5). The third walks every reason `canBook` can
return for a class that exists and asserts each has copy, so a new
`NotBookableReason` cannot ship without one. 23 passed.

Gates: `pnpm typecheck` 17/17, `pnpm lint` 15/15.

**3.2 Payments rules.** Four rules and one formatter moved into
`packages/domain/src/payments.ts`, each with a test written first:

- `canAssignPlan(plan, currentPlanId)` — "an archived plan stays selectable for
  the member already on it", which was a comment plus a three-clause condition in
  `payments.setMemberDues`.
- `autoAssignedPlan(livePlans)` — "auto-assign the only plan on approval", which
  was `plans.length === 1 ? plans[0] : undefined` inside a `withTenant` callback
  in `membership.approve`, the least reachable place in the file.
- `canDecideClaim(claim)` — the pending-only precondition, written twice in
  `payments.confirm` and `payments.reject`.
- `formatMoney(minor, currency)` — see below.

**The literal `7` at `payments.ts:197` was already gone.** Item 2.3 replaced that
whole read with `readPaymentSettings`, which applies `DEFAULT_GRACE_DAYS` itself.
This item found nothing left to do there, which is the outcome the plan wanted.

**Three money formats became one.** `apps/nextjs/src/lib/money.ts` used
`Intl.NumberFormat` with a plain-text fallback; `apps/expo/.../profile.tsx` had a
private `money()` doing only the plain text; `packages/api/src/notify.ts:303`
inlined the same plain text a third time, in the dues reminder a student
actually receives. The domain version is the `Intl` one, with the same fallback,
so the server and the web are unchanged and `lib/money.ts` is deleted (five
importers repointed).

**Expo is the one place this is a visible change I cannot verify from here.** The
old comment claimed "Hermes Intl is partial on native". If that holds, the
`catch` returns exactly today's string. If the runtime has full ICU, the app
starts showing "€80.00" instead of "EUR 80.00", which is an improvement, not a
regression. Either way the fallback is the current behaviour, so there is no
crash path. Checked what actually triggers the fallback: `Intl` accepts any
well-formed three-letter code (`XYZ` formats fine, with a non-breaking space) and
only throws `RangeError` on a malformed one, so the test pins that case rather
than a plausible-looking currency. This belongs on the outstanding
`docs/mobile-device-test.md` list.

Files: `packages/domain/src/payments.ts`, `packages/api/src/router/payments.ts`,
`router/membership.ts`, `src/notify.ts`, `apps/nextjs/src/lib/money.ts`
(deleted) and its five importers, `apps/expo/src/app/(tabs)/profile.tsx`.

Test: `packages/domain/test/payments-rules.test.ts`, 12 cases, run and passing.
Then `payments.test.ts` + `membership-lifecycle.test.ts`, 30 passed.
Gates: `pnpm typecheck` 17/17, `pnpm lint` 15/15.

**3.3 Stats and access rules.** Two new domain functions, two filters replaced
by predicates that already existed.

- `newMemberCounts(joinedBuckets, thisMonth)` in
  `packages/domain/src/stats.ts`. The month comparison was inline in
  `stats.gym`, along with the comment explaining why both sides count only
  retained members. The comment moved into the function's docblock, where it is
  attached to the rule rather than to one call.
- `canReadCoachFigures(membership, instructorId, callerId)` in
  `packages/domain/src/coach.ts`, directly under `canReassignCoach`, which draws
  the same owner-versus-self split.
- `academy.memberships` filtered on `status === "pending" || status === "active"`
  by hand. That is `canEnroll`, which exists and is a deliberate whitelist so a
  new status is denied until someone admits it. The hand-written copy was an
  allow-list that would have silently admitted anything new. Now `.filter(canEnroll)`.
- `stats.drifting` filtered on `status === "active" && role !== "owner" && role
  !== "instructor"`. That is `isActiveMember(m) && !isStaff(m)`.

Both replaced filters were not just duplication: each was a second, weaker copy
of a rule the domain already owned, and each would have drifted on the next
status or role added.

Test: `packages/domain/test/growth-and-access.test.ts`, 9 cases, written first.
The `newMemberCounts` set includes a year boundary, because the rule is
`thisMonth - 1` on a bucket number rather than a month name and would be wrong if
it ever compared names. The last block pins `canEnroll` and `isStaff` themselves,
since two routers now lean on them for filtering rather than for a guard.

Domain suite 342 passed. `coach-stats.test.ts` 8 passed.
Gates: `pnpm typecheck` 17/17, `pnpm lint` 15/15.

**3.4 Template propagation policy.** `templateEditStrategy(before, after)` in
`packages/domain/src/class-edit.ts`, returning `"regenerate" |
"update-in-place" | "none"`, with `templateContentChanged` as its second half.
`templateTimingChanged` stays as the tested building block the strategy calls.

**`"none"` is new and is the point of doing this.** The resolver was an
if/else, so a save that changed nothing still ran an `UPDATE` over every future
scheduled class the template owns. An owner opening the edit form and pressing
save wrote to every class out to the 180-day horizon. Now that path writes
nothing.

The comment explaining why a regenerate CANCELS rather than DELETEs stayed in the
resolver, trimmed. It is about `ON DELETE no action` on `class_participation` and
`drop_in`, which is a database fact, not a domain rule.

Test: `packages/domain/test/template-edit-strategy.test.ts`, 9 cases, written
first. Includes weekday order-independence and "timing wins when both moved",
neither of which had a direct test before. `template-edit.test.ts` (the PGlite
router test) still passes, 3 cases.

**Incidental find, fixed.** `packages/domain/test/notify.test.ts:192` passed an
`academyName` that `buildAnnouncementMessage` does not accept. It failed
`tsc -p test/tsconfig.json` and nobody saw it, because **`pnpm typecheck` does
not cover any package's `test/` directory**: each has its own tsconfig and the
package script points at `src`. Vitest strips types without checking them, so the
test ran green against a signature it did not match. Dropped the stale argument.
The systematic gap is a new item, 7.0 below.

Gates: `pnpm typecheck` 17/17, `pnpm lint` 15/15.

**3.5 The dashboard rules.** New module `packages/domain/src/dashboard.ts`,
eight exports, all pure:

| Export | Was |
|---|---|
| `classEndsAt` | a local `endsAt` in the tsx, and a fourth copy inside `needsAttendance` |
| `onSameLocalDay` | a local `sameDay` in the tsx |
| `dayPlan` | `onDay` + `todays` + `tomorrows` + `showTomorrow` + `dayList` + `nowIndex`, 18 lines |
| `rosterSummary` | four `members.filter(...)` passes, including the coach subtraction |
| `upcomingClassCount` | `weekCount` |
| `newLeadCount` | `newLeads` |
| `isFirstRun` | `firstRun` |
| `daysSince` | the inline `Math.floor(... / (24*60*60*1000))` in `DriftRow` |

Every one of these was reachable only through a React render. `dayPlan` alone has
seven branches (roll forward, empty tomorrow, empty today, cancelled rows,
sorting, the now-line index, no now-line on tomorrow) and not one of them had a
test.

**Two things the tests pinned that were only implied before:**

- `todays.every(...)` is true of an empty array, so a day with no classes rolls
  forward to tomorrow. That is the behaviour we want and it was an accident of
  `every`. It has a test now.
- A class that ends exactly at `now` counts as over, in both `dayPlan` and
  `needsAttendance`. They agreed by coincidence, since both open-coded the same
  arithmetic. They share `classEndsAt` now.

`needsAttendance` in `packages/domain/src/attendance.ts` now calls `classEndsAt`
rather than repeating the multiplication.

`dashboard-screen.tsx` maps `startsAt` to a `Date` once, at the top, instead of
calling `new Date(...)` in five filters and comparators. `ClassRow` is retyped as
the router row with `startsAt: Date`, so the component below it stops parsing
strings too.

Test: `packages/domain/test/dashboard.test.ts`, 18 cases, written first. Domain
suite is 369 passed, from 342 at the start of the item.

Gates: `pnpm typecheck` 17/17, `pnpm lint` 15/15. `next build` was **not** run:
it loads `next.config.js`, which validates env, and this worktree has no `.env`.
That is a pre-existing limitation of working here, not a regression. The gate
list for this epic is typecheck, lint and test.

**3.6 Referral assignment state.** `referralAssignmentState(referral)` and the
`ReferralAssignmentState` type in `packages/domain/src/referrals.ts`, replacing
the nested ternary with the three `as const` casts in `referral.dashboard`.

The distinction the function now states out loud: `cleared` is not
`never_assigned`. A row with a null referrer means an owner deliberately removed
the credit, and only an owner may set it again (ADR 52). The web reads that
difference in three places (`referrals-screen.tsx:260`, `:423`, `:431`), so it is
a rule, not a display detail.

Test: 3 cases appended to `packages/domain/test/referrals.test.ts`, 12 passed.
Gates: `pnpm typecheck` 17/17, `pnpm lint` 15/15.

---

## GATE 3 — passed

**Gates.** `pnpm typecheck` 17/17. `pnpm lint` 15/15. `pnpm test --force`
**671 passed, 0 failed**: domain 372, api 162, db 110, validators 24,
notifications 3. Baseline at GATE 2 was 617, so the phase added 54 tests and
broke none. All 54 are in `packages/domain`, which is the shape this phase was
supposed to have.

**Docs, per `delivery.md` §4.** ADR
[95](issues/95-what-belongs-in-domain.md) written, and it is the first one to
state the rule for what belongs in `packages/domain` rather than assuming it.
Index row in `docs/map.md`. `docs/architecture.md` §0 section retitled to
"phases 1-3" with five new bullets. `docs/roadmap.md` slice 5.4 flipped to
"Phase 3 done". `CHANGELOG.md` has the entry.

**`docs/spec.md` changed**, unlike the last two phases. The S5 booking-window
line said the rule "changes nothing a student can see" and named the old copy.
Both halves needed amending: the copy now interpolates `BOOKING_WINDOW_DAYS`, and
the class detail page a student can deep-link to now shows the reason instead of
a Book button that fails.

**What the phase found.**

1. **Both clients were guessing.** Each reimplemented half of `canBook` and
   neither knew about the booking window. The bug this produced is the exact one
   ADR 79 wrote the window to prevent, reintroduced one layer up.
2. **A no-op template save wrote to every future class.** The resolver was an
   if/else over a boolean, so "nothing changed" fell into the update branch.
   `templateEditStrategy` has three answers now.
3. **`pnpm typecheck` covers no package's `test/` directory.** Each has its own
   tsconfig and the package script points at `src`; vitest strips types without
   checking them. A domain test had been calling `buildAnnouncementMessage` with
   an argument its signature refuses, and passing. Fixed the call. The gate is
   new item **7.0**.
4. **Two dashboard behaviours were correct by accident.** An empty today rolls
   the block forward because `every` is true of nothing, and a class ending
   exactly at `now` counts as over in two places that agreed only because both
   open-coded the same arithmetic. Both are pinned now.

**Not done, and why.** `next build` was not run at this gate. It loads
`next.config.js`, which validates env, and this worktree has no `.env`. The gate
list for this epic is typecheck, lint and test; `next build` needs to run once
from the main checkout before this branch merges.

**Carried forward, unchanged.** Migration `0027` is still written and **not
applied to Neon**.

**New this phase.** The Expo money format may render differently on a device
(`Intl` versus the plain fallback). Both outcomes are acceptable and neither can
crash, but it belongs on the outstanding `docs/mobile-device-test.md` list.

**Next.** Compact, then restart the loop. Phase 4 opens with a rebase on `main`:
domain and validators cleanup, plan items 9 through 12.

---

### Phase 4

Rebase: none needed. `main` is still `0243e23`.

**4.1 Delete what is dead in `packages/domain`.** Four deletions and two
deliberate refusals. The plan's list was written from a read at one commit and
needed checking; three of its entries were already wrong.

**Deleted:**

1. **`src/invite.ts` and its test.** Genuinely dead, superseded by
   `InviteRoleSchema`. Nothing outside its own test named it.
2. **`isInReminderWindow` and `reminderRecipients`**, plus their 7 tests. These
   are the item's real finding. Both are the reminder rules, tested, and **never
   called**. What runs is SQL inside `claimDueReminderClasses`, which has **zero**
   tests. So the rule with seven passing tests was not the rule in production, and
   the two are not even the same algorithm: the SQL bounds the window on one side
   plus `reminder_sent_at IS NULL`, the domain version used a two-sided sweep
   window. Deleting the twin makes the gap visible instead of papering over it.
   Item **5.2** now owns testing the SQL, and says not to resurrect the twin.
3. **`NOTIFICATION_KINDS`.** Referenced nowhere, not even a test.
4. **Eight of the nine `DAY_MS` definitions.** It was declared **four times
   inside `packages/domain` itself** (`booking`, `materialize`, `attendance`,
   `payments`) while `local-date.ts` exported one nobody imported, plus copies in
   `packages/db/src/materialize.ts`, `apps/nextjs/.../attendance.tsx` and
   `week-grid.tsx` (that one as `86400000`, the same number written differently).
   All now import the one in `local-date.ts`.

**Fixed while here:** `apps/nextjs/.../attendance.tsx` hardcoded `14` for the
backfill window while `ATTENDANCE_BACKFILL_DAYS` sat exported and unused. It
imports the constant now, so the screen and `canMarkAttendance` cannot disagree.

**Not done, on purpose:**

- **The ~62 "unused exported types" and the ~30 "unused constants".** The list
  does not survive checking. Most constants are used by the module that declares
  them, so they are not dead, only un-imported; un-exporting them would break the
  domain tests that import them directly. Most types are the parameter and return
  types of functions that ARE used, so deleting them takes away a caller's ability
  to name what it receives, and TypeScript erases them at build so they cost
  nothing. A scan for "imported from `@matops/domain`" also **undercounts**:
  `fillLabel` looked unused and is re-exported through
  `apps/expo/src/utils/format.ts`. Bulk-deleting off that list would have removed
  live code.
- **Splitting the label maps behind a second entry point.** Decided no. They pass
  the ADR 95 test for belonging in domain (a decision about what the product says,
  no I/O, user-visible if wrong), both clients share them, and a second entry
  point means a second export map and a choice at every import site. The problem
  the plan names, "a caller cannot tell a deep rule from a string helper at the
  import site", is real but small, and the fix is worse than it.

`pnpm test` 662 passed, from 671: 9 fewer because 7 decoy tests and the 2
`isInvitableRole` cases went with the code they covered. No test broke.

Gates: `pnpm typecheck` 17/17, `pnpm lint` 15/15.

**4.2a One check-in window.** Split out of 4.2 because it turned out to be two
live defects, not duplication. `packages/domain/src/checkin.ts` gains
`MAX_CLASS_MINUTES`, `checkInFetchWindow(now)` and `canCheckIn(class, now)`.
`resolveCheckInClass` is now the one authority and the other two answer through
it.

**Defect 1: the `checkIn` mutation accepted a class from two weeks ago.** Its
guard was `canMarkAttendance` (14 days back, 1 day forward) with the comment
"Reuse the attendance window as the check-in window guard". The rule the product
promises is `resolveCheckInClass`: 60 minutes before the start through the end of
the class. Spec S8 says "the class happening now", and the error message already
said "No class to check into right now" while accepting anything from the last
fortnight. So the real rule ran on the client only, and a student could mark
themselves present at a class they never attended, which then feeds the
attendance stats and the drifting report. The guard is `canCheckIn` now, and it
matches the spec rather than contradicting it.

**Defect 2: a long class still running was invisible to the scanner.** The fetch
bound was a hardcoded 3 hours back, "derived from neither", while the validators
accept a `durationMinutes` up to 600. A 10-hour seminar that started 5 hours ago
is inside its own check-in window and was outside the query that looks for it.
`checkInFetchWindow` derives both ends from the rule instead: back
`MAX_CLASS_MINUTES`, forward `CHECK_IN_EARLY_MINUTES`. The forward end also
narrows, from 6 hours to 1, because a class whose doors have not opened is not a
candidate.

`requireClassFacts` grew `id` and `durationMinutes`, which is what lets the
mutation ask the same question the list asks. Both are on a `LIMIT 1`-shaped
read.

Files: `packages/domain/src/checkin.ts`, `packages/api/src/classes.ts`,
`router/checkin.ts`, `router/dropin.ts` (the second copy of the same hardcoded
window).

Tests: `packages/domain/test/checkin-window.test.ts`, 7 cases, including a sweep
over start times and durations asserting the fetch window never drops a class
`canCheckIn` would accept. Then `packages/api/test/checkin-window.test.ts`, 6
router cases through PGlite.

**Both halves proved to bite.** Putting `canMarkAttendance` back fails the two
"refuses" cases and leaves the rest green. Putting the 3h/6h fetch bound back
fails the long-class case and leaves the rest green. Both restored.

Gates: `pnpm typecheck` 17/17, `pnpm lint` 15/15, `pnpm test` 674 passed.

**4.2b One week window.** New `packages/domain/src/calendar.ts` with
`startOfDay`, `dayWindow`, `calendarWeekStart`, `GRID_WEEK_STARTS_ON` and
`onSameLocalDay` (moved from `dashboard.ts`, where it did not belong).

The plan asked for one `academyWeek` replacing five windows. That is wrong,
because the five are **two different things**:

- A **rolling window** from midnight today: the student schedule on both clients,
  and the dashboard's read. `dayWindow(now, {backDays, aheadDays})`.
- A **calendar week** the owner pages through: the O2 grid, Monday first.
  `calendarWeekStart(now, offset, startsOn)`.

Folding them together would have made the student's "next seven days" into "the
rest of this week", which is a different product.

**`attendance.tsx` deliberately does not use `dayWindow`.** Its picker window has
to match `canMarkAttendance`, and that rule is **instant-anchored**
(`now - 14 * DAY_MS`), not midnight-anchored. Moving the picker to midnight would
widen it past the server rule and offer classes the mutation then refuses. It
keeps its own arithmetic and now uses `ATTENDANCE_BACKFILL_DAYS` for the number
(item 4.1). Worth saying out loud: the "five hand-rolled windows" are four, and
one of them is right.

`schedule.tsx` also had `start.getTime() + 6 * 86400000` for its range label,
which is wrong across a DST boundary: adding six 24-hour steps to a Monday
midnight lands at 23:00 or 01:00 on the Sunday, not midnight. It uses
`setDate(+6)` now, like everything else.

**Left for the human, not blocking.** The Monday-versus-Sunday split is real and
this item did not resolve it: the grid pages Monday-first, while `localDate`'s
`weekBucket` is Sunday-aligned and feeds "weeks trained" in `trainingStats`. A
student who trains Sunday and Monday counts as two weeks under Sunday alignment
and one under Monday. Changing `weekBucket` would move every historical figure,
so it is a product decision, not a refactor. `WeekStartsOn` and
`GRID_WEEK_STARTS_ON` make the choice explicit at the call site instead of
implicit in a `(getDay() + 6) % 7`; the ADR records the question.

Files: `packages/domain/src/calendar.ts` (new), `dashboard.ts`, `index.ts`,
`apps/nextjs/.../student-screen.tsx`, `schedule.tsx`, `dashboard-screen.tsx`,
`apps/expo/src/app/(tabs)/schedule.tsx` (its private `startOfToday` deleted).

Test: `packages/domain/test/calendar.test.ts`, 11 cases including a month
boundary crossed by calendar days rather than 24-hour steps, and both week
conventions. The two `onSameLocalDay` cases moved here with the function.

Gates: `pnpm typecheck` 17/17, `pnpm lint` 15/15, `pnpm test` 685 passed.

**4.3 Compose the validators.** Four changes.

**`personFields`.** `{ firstName, lastName, phone }` was spelled out five times:
`JoinAcademySchema`, `UpdateProfileSchema`, `JoinByCodeSchema`,
`AddVisitorSchema`, `DropInSchema`. One `as const` object, spread into each. The
walk-in still overrides `lastName` to optional, and now that override is the only
line that differs, so a reader can see the exception instead of comparing five
blocks.

**One `isValidTimeZone`.** `packages/validators` had a private copy of the
function `packages/domain/src/academy-settings.ts` already exported, and the two
differed: the domain one guards an empty string, the validators one relied on a
`.min(1)` sitting above it. `@matops/domain` is now a dependency of
`@matops/validators` (acyclic: domain does not depend on validators), and there
is one implementation. `academy.updateSettings` already called the domain one
directly, so a time zone was being checked by two functions on the same request.

**`WeekWindowSchema` moved in.** It was `WeekInput`, private to
`packages/api/src/router/class.ts`, and it carries a real rule: a schedule read
may span at most 400 days. That is input validation, so it belongs with the other
input validation. `MAX_SCHEDULE_WINDOW_DAYS` is now a named constant and the
error message interpolates it, so the number and the sentence cannot disagree.

**The file is split by area.** 616 lines became nine files behind an unchanged
barrel: `fields` (the primitives and `personFields`), `scheduling`, `booking`,
`checkin`, `push`, `payments`, `rank`, `referrals`, `notifications`. The section
comments were already there and became the cut lines. `index.ts` is nine
`export *` lines, so **no caller changed**: the split is invisible outside the
package.

Files: `packages/validators/src/*` (9 new, `index.ts` rewritten),
`packages/validators/package.json`, `packages/api/src/router/class.ts`.

No new test. This item moves and composes schemas without changing what any of
them accepts; `packages/validators/test` (24 cases) is the guard that it did not,
and it still passes. `lineText` and `blockText` had to become exported to be
shared across the new files, which is the one visible surface change.

Gates: `pnpm typecheck` 17/17, `pnpm lint` 15/15, `pnpm test` 685 passed.

**4.4 Sanitize at the boundary.** `cleanedString(rawMax)` in
`packages/validators/src/fields.ts` is now the one entry point for a
user-supplied string: bound it cheaply, then strip the invisibles. `lineText`,
`blockText`, `PhoneSchema`, `EmailSchema` and `HttpUrlSchema` all start from it,
so the strip is a property of the builder rather than something each field
remembers to ask for. `singleLine` and `multiLine` now only fold whitespace,
because the cleaning happened before them.

**`HttpUrlSchema` was the field that had opted out**, and it is the one rendered
as a tappable `href` for every member of a gym (the academy map link, ADR 71). A
zero-width space or a bidi override survived validation and reached the DOM. A
right-to-left override in a path is the classic filename-reversal trick; in a
link preview it lets the visible text disagree with where the tap goes.

Two things did **not** change, on purpose:

- The scheme check still runs after `z.url()`, so `java<ZWSP>script:` is refused
  rather than cleaned into `javascript:`. There is a test for exactly that,
  because "strip then parse" is the ordering that could have introduced the bug
  it is meant to prevent.
- `IdSchema` and `OpaqueTokenSchema` keep `.trim()` and no strip. They are opaque
  values compared exactly against the database, never rendered. Stripping there
  would let a malformed id quietly become a valid one.

Test: 5 cases added to `packages/validators/test/sanitize.test.ts`, 29 passing.
**Proved to bite:** putting the old `HttpUrlSchema` back fails the two invisible
cases and leaves the scheme cases green, which is the right split. Restored.

Gates: `pnpm typecheck` 17/17, `pnpm lint` 15/15, `pnpm test` 690 passed.

---

## GATE 4 — passed

**Gates.** `pnpm typecheck` 17/17. `pnpm lint` 15/15. `pnpm test --force`
**690 passed, 0 failed**: domain 380, api 168, db 110, validators 29,
notifications 3. Baseline at GATE 3 was 671. Nine tests were deleted with the
code they covered and 28 added.

**Docs, per `delivery.md` §4.** ADR
[96](issues/96-one-definition-per-rule.md) written. Index row in `docs/map.md`.
`docs/architecture.md` §0 retitled to "phases 1-4" with six new bullets.
`docs/roadmap.md` slice 5.4 flipped to "Phase 4 done". `CHANGELOG.md` entry.
`docs/spec.md` S8 amended: the spec was already right about the check-in window,
so the note records that the **server** now enforces what the line already said.

**Item 4.2 was split** into 4.2a (check-in window) and 4.2b (week window), per
the "bigger than one commit" rule. 4.2a turned out to be two live defects rather
than duplication, which is why it deserved its own commit.

**What the phase found.** This was the richest phase so far, and three of the
four findings are defects rather than tidiness:

1. **`checkin.checkIn` accepted a class from two weeks ago.** Guarded by
   `canMarkAttendance` instead of its own rule, while the error message already
   said "No class to check into right now". A student could mark themselves
   present at a class they never attended; attendance feeds the gym statistics
   and the drifting report.
2. **A long class still running was invisible to the scanner.** The fetch bound
   was 3 hours back against a 600-minute maximum duration.
3. **`HttpUrlSchema` skipped the invisible-character strip** while being the one
   field rendered as an `href` for every member.
4. **Two reminder rules had seven passing tests and were never called.** The SQL
   that actually runs has none, and is a different algorithm.

**Where the plan was wrong, and what was done instead.** The plan doc for this
phase was written from one read and needed checking:

- "Five hand-rolled week windows, unify them" → they are **two concepts**, and
  `attendance.tsx` is a third that is already correct. Unifying would have broken
  the student schedule or the attendance picker.
- "~45 unused exported types and ~30 dead constants, delete them" → the list does
  not survive checking and acting on it would have deleted live code.
  `fillLabel` looked unused and is re-exported through the Expo app. Not done, on
  purpose, with the reasoning in the ADR.
- "The literal `7` at `payments.ts:197`" (item 3.2) → already fixed by item 2.3.

**Not done, and why.** `next build` still needs one run from the main checkout
before this branch merges: it validates env in `next.config.js` and this worktree
has no `.env`.

**Carried forward.** Migration `0027` is still written and **not applied to
Neon**. The Expo money format (item 3.2) still wants a device check.

**Next.** Compact, then restart the loop. Phase 5 opens with a rebase on `main`:
the notification path, and item 5.2 now also owns testing the reminder SQL that
item 4.1 stopped pretending was covered.

### Phase 5

**5.1 Inject the sender into `notify.ts`** — done 2026-08-25. `main` had not moved
(`0243e23`), so there was nothing to rebase.

`PushSender` is a structural type, `(messages: BatchPush[]) => Promise<unknown>`,
not `typeof sendPush`. A test double should not have to build a `SendPushResult`
to say "I was called with these three tokens".

The parameter sits on `deliver` with `sendPush` as its default, and reaches the
outside through `SweepOptions`, which extends the existing `ClaimRemindersOptions`
the cron route already passes. So the sweeps gained no new parameter at all.

**The other five notify functions were left alone, on purpose.** Threading `send`
through `notifyClassCancelled` and its four siblings would be five parameters that
nothing passes: their routers call them through `ctx.afterCommit`, so a test that
wanted to inject a sender would have to inject it into the tRPC context, which is
a much larger change than this item. What those five already have is Phase 2's
`class-notify.test.ts`, which asserts on the inbox rows, and the inbox is the
durable copy by design. Add the parameter when a test needs it.

`sweepDuesReminders` became exported. It is half the work `runReminderSweep`
does and item 5.2 has to be able to run it alone.

`claimDueReminderClasses({ ...opts, exec })` became an explicit three-field call.
Spreading `SweepOptions` would have handed a `send` function to the db package,
which is exactly the layering `docs/issues/34` set up to avoid.

**Two things the item asked for turned out not to be there.**

- The "dead Resend adapter" is not dead. `sendEmail` has one caller,
  `packages/auth/src/index.ts:177`, and it is the sign-in magic link. So the item's
  second branch applies: the package docblock now says which sender carries what,
  and that no gym message goes out by email (v3.8, ADR 77). Nothing deleted.
- The stale "Push + email every booked student" comment at `class.ts:414` is
  already gone. Phase 2 item 2.5 rewrote that function into `notifyBooked` and took
  the comment with it. A repo-wide grep for the string finds nothing.

Files: `packages/api/src/notify.ts`, `packages/notifications/src/index.ts`.
`@matops/api` typecheck and lint green, `@matops/notifications` lint green.

**5.2 Test the sweeps** - done 2026-08-25. `packages/api/test/reminder-sweep.test.ts`,
11 cases, all passing. This is the first test the reminder path has ever had.

Six cases on the class sweep, five on the dues sweep. What they pin down:

- A due class is claimed once. Both booked students get a push and an inbox row.
  A second run right after sends nothing.
- The window has two sides. A class 600 minutes out is not claimed, and neither
  is one that started 30 minutes ago. `startsAt > now` is strict, so the sweep
  never chases a class that is already running.
- A class with no live booking is skipped, and so is one where the only booking
  was cancelled. The `innerJoin` on a booked participation is what does this.
- A cancelled class, a soft-deleted class, and a class in a soft-deleted academy
  are all left alone. The deleted-academy case is the one worth having: it is the
  only guard in that query that protects a gym that has closed.
- `limit` bounds one run and the leftovers are picked up on the next tick.
- Dues: due-soon claims, not-yet-due does not, an archived member is never billed,
  and an overdue member gets different words than one merely due soon.
- One `runReminderSweep` call runs both halves and reports them separately.

**The claim-then-send gap is now written down as a test, not fixed.** The
"push is dead" case makes an exploding sender and asserts what survives: the
inbox row is there, the class is stamped, and the retry sends nothing. So a push
outage costs the push and not the message, because `deliver` writes the inbox row
first and on purpose.

Fixing it properly means choosing between at-most-once and at-least-once.
Stamping after the send would turn a crash into a double reminder for everyone
claimed in that batch, and two concurrent sweeps into two pushes. The current
order is a deliberate choice, not an oversight, and changing it is a product call
about which failure a gym would rather have. Out of scope for a restructure.

**Two things the tests had to be told.** `class.id` is a uuid, so the ids are
uuid constants with readable names. And `class_participation.studentId` is a USER
id, not a member id, which is why `deliver` can hand it straight to
`getPushTargets`. That is load-bearing and was nowhere asserted before.

`npx tsc -p test/tsconfig.json` clean, `@matops/api` lint green. Note that
`pnpm typecheck` still does not cover this file; item 7.0 is what fixes that.

**5.3 One cron auth helper** - done 2026-08-25. `packages/api/src/cron-auth.ts`,
plus `packages/api/test/cron-auth.test.ts` (6 cases, passing) and a `./cron-auth`
entry in the package exports. Both routes now call it.

It went to `packages/api`, not to `packages/domain` and not to
`apps/nextjs/src/lib`. Domain is product rules by the ADR 95 test, and "does this
bearer token match" is not one. `apps/nextjs` has no test runner, and an
untested auth guard is the thing this item exists to stop. `packages/api` already
owns the server seam these routes call into, and it has PGlite and vitest.

`cronVerdict` returns a verdict, not a `Response`. The route maps it. That keeps
the function pure, so the test can state the branch that matters in one line:
**no secret plus production is a refusal, no secret plus dev is fine.** That
branch was written twice and tested zero times, on the two endpoints that run
cross-academy on the base connection outside the tenant seam.

The test also pins the near misses that a hand-rolled compare gets wrong:
lowercase `bearer`, a trailing space, and the bare secret with no `Bearer` prefix.
All 401. And an empty-string secret counts as no secret, which is what the
existing truthiness check already did and is now stated.

Behaviour is unchanged. The old block and the new one agree case for case.

**One stale line fixed while there.** The remind route's docblock said the dues
sweep would "push + email them". No gym message goes out by email (v3.8, ADR 77),
and item 5.1 had just finished writing that down in the transport package. The
line now says push.

Files: `packages/api/src/cron-auth.ts`, `packages/api/test/cron-auth.test.ts`,
`packages/api/package.json`, both `apps/nextjs/src/app/api/cron/*/route.ts`.
`@matops/api` and `@matops/nextjs` both typecheck and lint green.

## GATE 5 — passed

2026-08-25. `main` had not moved, so Phase 5 opened with nothing to rebase.

- `pnpm typecheck` 17/17.
- `pnpm lint` 15/15.
- `pnpm test --force` **707 passed, 0 failed** (domain 380, api 185, db 110,
  validators 29, notifications 3). Up 17 from 690 at GATE 4, all new:
  11 on the sweeps, 6 on the cron guard. No test was deleted this phase.

Docs, per `delivery.md` §4:

- ADR [97](issues/97-the-notification-path-gets-a-test.md) written, `docs/map.md`
  row added, `docs/architecture.md` §0 retitled to "phases 1-5" with three new
  bullets, `docs/roadmap.md` slice 5.4 updated, `CHANGELOG.md` entry prepended.
- **No `docs/spec.md` change.** Nothing user-visible moved. Phase 5 added tests,
  one defaulted parameter, and one shared guard whose behaviour is identical case
  for case with the two copies it replaced.

### What Phase 5 was really about

Three items, no defects found. That is the honest headline, and it is not the
same as "nothing was wrong". The reminder path had **zero tests** on the one part
of the backend that runs with nobody watching. A resolver that breaks gets a bug
report the same day. A sweep that breaks is silent, and the first sign is a
member who did not show up.

The 11 cases found nothing broken today. What they buy is that the next edit to
that SQL cannot quietly stop reminding a gym.

Two things the tests had to be told, both load-bearing and neither asserted
anywhere before: `class.id` is a uuid, and `class_participation.student_id` is a
**user** id, not a member id. The second is why `deliver` can hand it straight to
`getPushTargets`.

### Two of the item's own claims did not survive checking

- The "dead Resend adapter" is not dead. `sendEmail` has one caller and it is the
  sign-in magic link. Kept, with its purpose written down.
- The stale `class.ts:414` comment was already gone. Phase 2 item 2.5 took it
  with the function it described.

### Left open on purpose

**The claim-then-send gap is described, not closed.** `claimDueReminderClasses`
stamps `reminder_sent_at` before the send, so a crash in between loses that
reminder for good. The test with the exploding sender proves what survives: the
inbox row is written first, so a push outage costs the push and not the message.

Closing it means choosing at-least-once, and that means a crash mid-batch
re-reminds everyone in it, and two concurrent sweeps push twice. Which failure a
gym would rather have is a product call, not a restructure. It is written down in
ADR 97 now instead of being an accident nobody had noticed.

### Carried forward

- Migration `0027` is written and **not applied to Neon**. Needs
  `pnpm -F @matops/db migrate` on the next deploy.
- `next build` needs one run from the main checkout before this branch merges.
  This worktree has no `.env`.
- The Expo money format change from Phase 3 still wants a device check
  (`docs/mobile-device-test.md`).
- Still open from Phase 4, and still the human's call: the Monday-first grid
  versus the Sunday-aligned `weekBucket` that feeds "weeks trained". Changing it
  moves every historical figure.

**Next.** Compact, then restart the loop. **Phase 6 needs a decision before any
code.** Its items fold procedures together and change cache rules on both
clients, and the `frontend-performance-plan` branch is doing its own work in the
same files. Either that branch lands on `main` first, or Phase 6 is skipped and
the loop goes straight to Phase 7, which touches only `packages/api/test`. Say
which.

### Phase 6

Run on the `release/pilot-prep` branch, not on the backend worktree. Phase 6 is
about round trips and cache rules, which is exactly what the frontend arc
changed, so writing it anywhere else would mean merging it twice.

**6.1 `stats.dashboard`** - done 2026-08-25. `stats.gym`, `stats.drifting` and
`stats.revenue` are gone, replaced by one `dashboard` procedure. Their bodies
lifted to `readGymInsights`, `readDrifting` and `readRevenue` in the same file.

Staff tier, not owner. `gym` was staff-visible and the other two were owner-only,
so the folded procedure takes the loosest tier and returns `drifting` and
`revenue` as `null` for an instructor, whose reads are then skipped. That is the
shape `gym` already used for `newMembers`, so it is not a new idea.

**The item's stated benefit did not survive the merge, and I measured it rather
than assuming.** It claimed "the non-streaming batch stops waiting on the slowest
of three". The batch is not non-streaming any more (ADR 89) and wave 0 had
already measured that procedures inside one batch run concurrently. Warm
dashboard render, five runs each: **0.79-0.96s before, 0.87-0.89s after.** No
wall-clock change, and I am not going to claim one.

What did change is real but different from what was written down:

- **Three tenant transactions become one.** Each was a pooled connection out of
  twenty, so a dashboard load used to cost three. This is the actual win, and it
  is about connection pressure under concurrent users, not latency.
- **Two `academyTimeZone` calls become one.** It is not cached, and it costs
  **two** queries when the academy row has no `time_zone` set, because it falls
  through to the most-common template zone.
- **Two `rosterOf` calls become one.** `gym` read the roster for `newMembers`,
  `drifting` read it again.

Roughly seven queries across three transactions become five in one.

The one thing given up: the three panels used to hydrate independently, so
insights could paint before drifting. Now they arrive together. They are the
lower half of the dashboard and the primary content (`class.week`,
`membership.members`) is untouched and still separate, so I took the trade. Said
out loud here because it is the only place the frontend arc and this phase pull
in opposite directions.

Files: `packages/api/src/router/stats.ts`, `apps/nextjs/src/app/(app)/page.tsx`,
`apps/nextjs/src/app/_components/dashboard-screen.tsx`,
`packages/api/test/tenant-seam.test.ts`, `packages/domain/test/freshness.test.ts`.
The seam test now asserts all three owner-only figures are null for an
instructor, where it used to check only `newMembers`. 13 and 8 tests pass.
`@matops/api` and `@matops/nextjs` typecheck and lint green.

**6.2 `membership.memberDetail`** - REJECTED 2026-08-25. The item's premise is
false, and doing it would make the page slower.

It claims "ten opened member rows go from 30 procedures to 10". Opening a member
row fires **one** procedure today, not three. `member-detail.tsx:141-143` renders
`RankTab` and `NotesTab` only when their tab is selected:

```
{tab === "rank" ? <RankTab .../> : tab === "notes" ? <NotesTab .../> : ...}
```

So `rank.forMember` and `note.forMember` fire when a staff member clicks Rank or
Notes, and never otherwise. The members page prefetches neither
(`(app)/members/page.tsx` prefetches `membership.members`, plus `dropIn.list` and
`membership.archived` for an owner).

Folding them into a `memberDetail` procedure would turn ten cheap opens into ten
opens that each also read the rank ledger and the staff notes, for tabs most
people never click. Ten procedures doing three times the work is not an
improvement on ten procedures.

The rank and note reads are already lazy, which is the thing the item wanted.
Nothing to do.

**6.3 Fold the coach breakdown into `stats.coaches`** - REJECTED 2026-08-25.
It trades a query nobody usually makes for a payload everybody pays.

The item is right that `stats.coach` re-runs `loadCoachContext`, the same loader
`stats.coaches` just ran. That part is real waste.

But the fold is not free the way the item assumes. `coachBreakdown` returns
`recent`, which is **every class that coach led in the window**, unbounded within
it. For a month window and a coach teaching five classes a week that is about
twenty class summaries. Ten coaches is two hundred, on a roster response that
carries a few aggregate rows today. Call it a tenfold payload increase on every
Coaches page load.

Against that: expanding a card is user-initiated, lazy, and **only one card can
be open at a time** (`coaches-screen.tsx:361`, `openId` is a single value, and
`:241` renders the body only when `open`). The page load is far more frequent
than the expand.

So the fold would make the common path worse to improve the rare one. ADR 88 in
the frontend arc had already priced payload honestly for the dashboard; the same
arithmetic says no here.

Considered and dropped: folding only the small parts (`byWeekday` is seven
numbers, `byWeek` a handful, `byClass` is grouped) and leaving `recent` lazy.
That splits one panel's data across two procedures and two loading states to save
one on-demand query. Not worth the seam.

**6.4 Kill the mobile waterfalls** - done 2026-08-25. Half of it was already
done by the merge, and the item is only about mobile now.

**Already true after the merge.** The `academy.current` staleTime is handled:
ADR 87's freshness table gives the `academy` namespace five minutes and BOTH
clients read it through `staleTime: (query) => staleTimeForQueryKey(...)`
(`apps/expo/src/utils/api.tsx:15`, `apps/nextjs/src/trpc/query-client.ts:13`).
The item asked to copy a hardcoded 5-minute override from `app-shell.tsx:38`;
that override no longer exists, and the value now comes from one shared table.

**Also already true on the web.** ADR 88's server prefetch fixed both hoists
there: `(app)/training/page.tsx` prefetches `booking.mine` and `stats.me` side by
side, and `(app)/class/[id]/page.tsx` prefetches `class.attendees`.

**Still real on mobile**, which has no server prefetch, and both were confirmed
by reading the render tree rather than assuming:

- `(tabs)/training.tsx:143` renders `MyTrainingCard` inside the
  `mine.isPending ? skeleton : (...)` branch, and that card owns the `stats.me`
  query. So the stats read could not start until bookings had landed.
- `class/[id].tsx:187` renders `WhoIsIn` below the `q.isPending` gate, and that
  component owns the `class.attendees` query. Same shape.

Fixed by starting each second query in the parent, above the gate. TanStack keys
both to the same entry, so the child subscribes to the in-flight query instead of
making a second one. The child keeps its own loading and error states, which is
what it was built for, and neither component's interface changed.

Each new call carries a two-line comment, which is the exception the comment rule
allows. A `useQuery` whose return value is discarded reads as dead code, and the
next person to tidy it would put the waterfall straight back.

Considered and dropped: hoisting `MyTrainingCard` out of the pending branch so it
renders beside the skeleton. That works too, but it moves the card above the
next-class card while bookings load and makes the layout jump.

Files: `apps/expo/src/app/(tabs)/training.tsx`,
`apps/expo/src/app/class/[id].tsx`. `@matops/expo` typecheck and lint green.
**Not verified on a device** — no simulator here, and this is behaviour a static
gate cannot see. Goes on `docs/mobile-device-test.md` with the rest.

**6.5 One invalidation rule per aggregate** - done 2026-08-25, and the bug it
named is real. `packages/domain/src/invalidation.ts`, 6 tests, written before the
callers switched.

`invalidatedBy(aggregate)` returns the tRPC namespaces a mutation dirties.
**Every aggregate includes `stats`**, and a test asserts that, because that is
the bug: no booking and no attendance mark refreshed the gym's figures, so
dashboard insights, who is drifting and a student's own training stats all sat
stale after the thing that changed them.

**The merge had quietly made this worse.** ADR 87 gives the `stats` namespace a
two-minute `staleTime`, up from the old 30-second default. So the stale window
went from half a minute to two minutes. Neither change is wrong alone.

Wired at three call sites: `use-booking.ts` and `class-roster.tsx` on the web,
`book-control.tsx` on mobile (which had the same two lines twice). Each client
gets a five-line `useInvalidate()` that turns a namespace into a query filter, so
the table itself stays pure and shared.

**The key shape was verified, not assumed**, because the whole fix depends on it.
`getQueryKeyInternal` in `@trpc/tanstack-react-query` builds `[["class"]]` for a
path filter with no input, which is exactly what the helper builds. It also
prepends `[prefix]` when one is configured, and neither client configures one.

**One deliberate optimisation preserved.** `class-roster.tsx` defers the `class`
invalidation to an effect cleanup, so tapping through a register does not re-run
the booking-count subqueries on every tap. `stats` joins that deferred cleanup
rather than the per-tap path, for the same reason.

Scope: the named bug and the aggregates around it. The other ~30 `invalidateQueries`
call sites still name their own paths and were left alone. Rewriting all of them
is a large mechanical change with no bug behind it, and the table is now there for
whoever touches one next.

Files: `packages/domain/src/{invalidation.ts,index.ts}`,
`packages/domain/test/invalidation.test.ts`,
`apps/nextjs/src/trpc/invalidate.ts`, `apps/expo/src/utils/invalidate.ts`,
`use-booking.ts`, `class-roster.tsx`, `book-control.tsx`. Both clients typecheck
and lint green.

## GATE 6 — passed

2026-08-25, on `release/pilot-prep`.

- `pnpm typecheck` 17/17.
- `pnpm lint` 15/15.
- `pnpm test` **733 passed, 0 failed** (domain 406, api 185, db 110,
  validators 29, notifications 3). Up 6 from 727.
- `next build` passes, 23 routes still prerender with Cache Components on.
- Dev server against live Neon: all 11 screens 200, no server error, dashboard
  renders real data.

Docs: ADR [98](issues/98-fewer-round-trips-and-one-invalidation-rule.md),
`docs/map.md` row, `docs/architecture.md` §0 retitled to "phases 1-6" with three
bullets, `docs/roadmap.md` slice 5.4, `CHANGELOG.md`. No `docs/spec.md` change:
nothing user-visible moved, the cache fix makes existing behaviour true sooner.

### The phase in one line

**Three of five items were wrong or already done.** 6.1 and 6.5 shipped, 6.4
shipped at half its size, 6.2 and 6.3 are `- [!]` with the evidence.

That is not a complaint about the plan. The plan was written from a read at one
commit, before the frontend arc existed, and it said to re-check against that
branch first. Doing so is what turned up that ADR 87 already shared the
freshness table across both clients and ADR 88 had already parallelised the web's
two waterfalls.

**The one real defect was in the cache rules, not the round trips.** No booking
and no attendance mark invalidated `stats`. And the merge had widened the window
it was wrong for, from 30 seconds to two minutes, because ADR 87 gave `stats` a
two-minute `staleTime`. Two correct changes making a third thing worse is exactly
what an integration branch is for.

**6.1 is the item I would flag to a reviewer.** It shipped, and I measured that
it does not make the dashboard faster. It reduces three tenant transactions to
one, which matters for connection pressure under concurrent users and not for
the number a stopwatch shows. The cost is that the three lower panels now arrive
together instead of independently. If a reviewer disagrees with that trade, it
reverts cleanly.

### Carried forward

- Migration `0027` still **not applied to Neon**.
- **`CRON_SECRET` is unset.** Unprotected in dev, 500 in production, so the daily
  dues reminder would silently never run.
- The two mobile fixes are **not verified on a device**, along with everything
  else on `docs/mobile-device-test.md`.
- Still the human's call from Phase 4: Monday-first grid versus the
  Sunday-aligned `weekBucket` behind "weeks trained".

**Next.** Phase 7, coverage. 46 of 104 procedures have no test, and 7.0 fixes the
gate that let a broken test pass.

