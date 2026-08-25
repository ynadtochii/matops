# 94 — One copy of each query

**Status:** accepted · **Date:** 2026-08-25 · **Area:** `packages/api` · **Extends:** [60](60-backend-review-fixes.md), [62](62-coach-workload-coverage.md), [93](93-safety-pass-before-the-pilot.md)

## Context

Phase 2 of `docs/backend-architecture-epic.md`. The routers had grown copies of
the same read. Not near-copies: the same `select` with the same joins, typed out
again in the next file. Thirteen roster reads, four payment-settings reads, four
dues-plus-plan joins, five "this class, not deleted" predicates, two byte-equal
booking counters.

This pass moves code only. No new layer, no repository over Drizzle, no service
class. The style is the one `packages/api/src/members.ts` and `payments-gate.ts`
already set: a plain function in `packages/api/src`, taking the executor as an
argument.

The rule for extracting was three or more copies, with two exceptions noted
below.

## Decision

### Four new modules, all flat functions

`members.ts` gained `rosterOf`, `nameByUser`, `nameByMember` and
`requireMembership`. Three new files sit beside it: `payments-read.ts`,
`classes.ts` and `messages.ts`.

- **`rosterOf(ctx)`** is the one entry to the academy roster. No router imports
  `listMembersOf` from `@matops/db` any more.
- **`nameByUser(rows)` / `nameByMember(rows)`** replace five hand-built Maps. The
  key differed between them, `user.id` in three and `member.id` in two, off the
  same roster rows. A mismatch there is silent: `.get()` returns `undefined` and
  the screen shows the fallback name.
- **`payments-read.ts`** holds `readPaymentSettings`, `readAllDuesWithPlan`,
  `readDuesWithPlan` and `readOpenClaim`.
- **`classes.ts`** holds `requireClassFacts`, `liveClass`, `claimSeat` and
  `releaseSeats`.
- **`messages.ts`** holds the five user-facing strings that had more than one
  home.

### One miss behaviour for "is this user in this academy"

`requireMembership` answers NOT_FOUND, never FORBIDDEN, and returns the
membership row on a hit. `academy.setActive` said FORBIDDEN and now says
NOT_FOUND: the academy id comes from the caller, so the answer must not
distinguish "exists but not yours" from "does not exist".

`resolveActiveMembership` in `trpc.ts` keeps FORBIDDEN and was **not** collapsed
into it. It asks a different question: the caller's own membership in the academy
their session already points at. There is no foreign id to protect, and the
answer means "signed in, not entitled here", which is what FORBIDDEN says.

`requireMember` in `members.ts` also stays separate. It resolves a **member id**,
not a user id.

The message stays a call-site parameter. "You are not a member of that academy"
and "That person is not a member of this academy" are sentences about different
people. The helper fixes the code, which is the part a new caller can get wrong.

### The defect this turned up

`payments.getRequisites` defaulted `graceDays` to a literal `7`.
`loadGateSettings` defaulted it to `DEFAULT_GRACE_DAYS`. Two numbers that agree
today, in the two places that must never disagree: the screen where an owner
reads the grace period and the gate that enforces it (ADR 82). Editing the domain
constant alone would have desynced them with nothing failing.

`readPaymentSettings` now answers both, applying the defaults itself.

`packages/db/src/payments-schema.ts:151` still carries the same literal as the
column default. Pointing it at `DEFAULT_GRACE_DAYS` would make `@matops/db`
depend on `@matops/domain` for one number, and the value is already in migration
`0025` on Neon, so the change would be cosmetic. Left alone deliberately.

### What was counted and left alone

- The plan named four copies of the open-claim lookup. Only two are the same
  question. `payments-gate.ts` asks "any open claim at all", with no period.
  `membership.ts` asks which members have one, as a list. Different questions.
- `attendance.list` was on the plan's read-cap list in Phase 1 and is not capped,
  for the reason ADR 93 records.
- `TEMPLATE_NOT_FOUND` was **not** on the plan's list. A count of every message
  literal in the routers found it at four copies, above the bar, so it went in.

### Two extractions below the three-copy bar

Both were kept because the two copies must **agree** with each other, which is a
stronger reason than the count:

- `readOpenClaim`, shared by `payments.mine` and `payments.claim`. If they
  disagree the screen offers a button the mutation then refuses.
- `rejectIfLastOwner`, replacing `setStatusOrRejectLastOwner` and
  `setRoleOrRejectLastOwner` in `membership.ts`. They were the same function with
  one word changed, each carrying its own copy of the message. The new one takes
  the `@matops/db` call as a promise and turns `{ok: false}` into the error, so
  the four call sites now name the db function they run.

### `notifyBooked`

The `class.cancel` mutation had 22 lines that repeated `notifyBookedOfChange`
exactly, differing only in which notify function it queued. Both have the same
signature, so the shared function takes the notifier as a parameter typed
`typeof notifyClassChanged`. `class.ts` is 40 lines shorter.

## Consequences

- `pnpm test` is **617 passing, 0 failing**, from 604 at GATE 1. Thirteen new in
  `packages/api`: 3 name maps, 4 membership miss, 2 class facts, 2 class
  notifications, 1 payment settings default, 1 last-owner role path.
- **`class.cancel` had no test at all.** Nothing asserted that cancelling a class
  reaches the booked student's inbox. `class-notify.test.ts` covers it now, and
  was proved to bite: passing the wrong notifier to the shared function fails the
  cancel case and leaves the other passing.
- **No spec change.** The one behaviour difference, `academy.setActive` returning
  NOT_FOUND instead of FORBIDDEN, is invisible: no client reads the code and the
  message is unchanged. One stale comment in the Expo check-in screen named the
  old code and was corrected.
- `messages.ts` is one file rather than a constant per domain module. These are
  product copy, and the reason they were duplicated is that nobody knew where to
  look for the existing wording.
