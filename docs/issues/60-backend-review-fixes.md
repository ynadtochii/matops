# 60. Backend review: a test seam for the API, one base-db door, and the fixes that fell out

**Status:** accepted
**Date:** 2026-08-19
**Supersedes:** nothing. Amends the fail-closed context rule in
[33](33-tenant-seam-hardening.md) and the testing note in
[architecture.md](../architecture.md) §0.

## Context

`packages/api` held roughly 17k lines of orchestration and had **no tests**. A
full backend review (five lenses over 78 files) then found three critical
problems and a set of smaller defects. Both threads land here, because the same
change unlocks them: once the API can be driven in a test, the seam it runs on
has to stop having quiet fallbacks.

The three critical ones:

1. **The auth error hook logged the whole Better Auth context**, which carries
   the app secret as a top-level property. Any unauthenticated bad request to
   `/api/auth/*` wrote the secret to the production log.
2. **A template timing edit hard-DELETEd future classes.** `class_participation`
   and `drop_in` both reference `class.id` with `ON DELETE no action`, so the
   delete fails the moment one student has booked. An owner could never change
   that template's time again.
3. **Every recipient of a class notification went in one Resend `to:` field**, so
   each booked student saw every other student's email address.

## Decision

### One db handle on the context, and no default parameters

`createTRPCContext` takes a single optional `baseDb`. Tests pass a PGlite-backed
handle; production passes nothing. `withTenant`, `getMembership`,
`getMemberById`, `getMemberIdForUser` and `listMembersOf` all take `exec` as a
**required** parameter with no default.

The earlier shape injected three separate functions (`runTenant`,
`loadMembership`) and gave each db helper a `exec = db` default. That is what let
the seam rot silently: a call site that forgot the parameter kept working against
the production pool with no compile error, so a test could pass while the code
under it never touched the test database. A required parameter turns every
missed call site into a build failure.

`ctx.baseDb` is a controlled widening of ADR 33's "no db handle on the base
context". The rule it replaces:

- `ctx.db` is the RLS-scoped transaction. It is the only handle that may read or
  write a tenant table, and non-tenant procedures still do not have it.
- `ctx.baseDb` is the base connection, and exists **only** for the Better Auth
  identity tables (`member`, `user`, `organization`), which carry no RLS policy
  and therefore can never be read through the tenant transaction.

The routers already reached those tables through base-connection helpers, so this
does not widen what a resolver can do. It makes the existing door explicit,
injectable, and testable. The lint rule blocking a raw `@matops/db/client` import
inside `src/router/**` stays.

Migration `0020` backs the rule at the database: `matops_app` loses INSERT,
UPDATE and DELETE on `user`, `organization` and `member`, and loses all access to
`session`, `account`, `verification`, `invitation` and `academy_invite`. Migration
`0001` granted DML on ALL tables so new **tenant** tables would be covered
automatically; the side effect was full write access to the identity tables, none
of which have a policy. Not exploitable today, but it turns any future injection
bug into account takeover.

### Notifications run after COMMIT

`enforceTenant` collects `ctx.afterCommit(task)` callbacks and runs them once the
tenant transaction has committed, and only when the resolver succeeded. Push and
email are network calls; awaiting them inside the transaction held a pooled
Postgres connection open for their whole duration, and a send could outlive a
mutation that then rolled back.

### A template timing edit cancels, it does not delete

Future scheduled instances are set to `cancelled`, then re-materialized with
`reviveCancelled: true`. `materializeTemplate` upserts on
`UNIQUE(template_id, starts_at)` and brings a cancelled row back to `scheduled`
with refreshed content. So an occurrence the new timing still covers survives
with its bookings intact; one the new timing drops stays as a cancelled class the
student can still see, instead of vanishing along with their booking.

### One send per email recipient

`deliver` sends one Resend request per address, concurrently. `bcc` would also
have hidden the addresses, but a per-recipient send keeps the door open for
per-person content and costs nothing at gym scale.

### One academy-membership guard

`requireMember(ctx, memberId)` in `packages/api/src/members.ts` replaces five
copies of the same check. The `member` table has no RLS policy, so this guard is
the only thing scoping a member id to the caller's academy. One copy means one
place to get it right.

## Other fixes in the same pass

- `payments.myDues` and `payments.claim` moved from `enrolledProcedure` to
  `memberProcedure`. `myDues` returns the gym's bank details, and a **pending**
  joiner (anyone who typed a public 6-digit code) could read them. Both mobile
  callers now gate the query on an approved membership rather than showing an
  error.
- `deletePushToken` takes a `userId` and filters on it. The token string is
  client-supplied, so any signed-in user could silence another user's
  notifications.
- `class.update` / `class.cancel` pass a `timeZone` to their notifications.
  Without one `formatWhen` labels the time in UTC, so students were told the
  wrong local hour, and the two paths disagreed with the reminder sweep, which
  gets it right.
- `template.update` falls back to `prev.instructorId`, not the caller. No client
  sends `instructorId` on an edit, so every edit reassigned the template to
  whoever opened the form.
- Both reminder sweeps send concurrently. The claim writes the "reminded" stamp
  *before* sending, so a member the serial loop never reached was marked reminded
  and never messaged.
- `academyName` catches its own errors, so `notify.ts` keeps the "never fails the
  mutation" promise its own doc claims.
- `createDropIn` keeps the stored `class_id` when a repeat submit resolves no
  class, and only bumps `visit_count` for a genuinely different class. A second
  form fill used to erase the visit the lead was recorded against and count a
  visit that did not happen.
- Migration `0019` indexes `member (organization_id, user_id)`. `getMembership`
  runs on every authenticated request against a table that had only its PK.
- `referral.dashboard` drops `metrics`, `referrerSummaries`, `plans`,
  `currentMonth`, `timeZone` and the per-student `plan`/`dues`. Nothing reads
  them: ADR [56](56-referrer-first-referrals.md) moved the aggregation to the
  screen and plan/dues to O4 and O7. Deleting them removes a join and about 60
  lines.
- Type cleanups: `ParticipationRow` / `BulkMarkRow` use the existing
  `AttendanceStatus` / `BookingStatus` / `BookingTier` unions instead of `string`
  with the union in a trailing comment; two `as unknown as` casts became
  `execute<T>()`; `stats.gym` narrows instead of asserting; `createPlan` no longer
  returns `{ id: string | undefined }` for a value that always exists.

## Consequences

- `packages/api/test` is a **third** test home beside `packages/db/test` (RLS and
  DB behaviour, PGlite) and `packages/domain/test` (pure logic, vitest). It sits
  between them: real routers, real middleware, real SQL, against an ephemeral
  Postgres. Nothing is mocked, so a test cannot pass against a double of logic
  production owns.
- **The app secret must be rotated** after this deploys. It was written to the
  log by every bad request the auth routes saw.
- A student booked into a class the owner then moved now sees that class as
  **cancelled** rather than losing it silently. Notifying them is not built here;
  it is the natural next slice.
- `Membership.role` and `.status` stay typed `string`. They look like the same
  cleanup as `ParticipationRow`, but the underlying columns are free text that
  Better Auth also writes (`member`, `admin`), so a closed union there would be a
  claim the data does not support.
