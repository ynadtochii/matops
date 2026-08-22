# 74 — The web shell owns the academy, the access table, and the booking call

**Status:** accepted · **Date:** 2026-08-22 · **Area:** web client (`apps/nextjs`), `@matops/domain` · **Extends:** [38](38-app-navigation-shells.md), [73](73-student-web-parity.md)

## Context

An architecture pass over the web app, after v3.2 put the student and the owner
in the same shell. No screen was wrong. The gaps between them were thin, and
four of the five problems below are things two clients now do twice.

- **Thirteen screens fetched the active academy and re-decided what to do while
  it loaded.** `AppShell` resolves `academy.current` and refuses to render a
  child until the value is a real membership. Every child asked again anyway,
  and wrote its own `isPending → skeleton`, `isError → error`, `!data → null`
  triple. React Query deduped the request, so this cost nothing at runtime. It
  cost a reader: `dashboard-screen.tsx` tested `c ? isOwner(c) : false` for a
  `c` that cannot be null by the time the screen mounts.
- **Book and cancel were copied into three screens, and two of them were
  wrong.** The student schedule invalidated the `class` path only; My classes
  invalidated `class` and `booking`. Nothing said which was correct, so a
  booking made on one screen could leave the other showing stale data. The
  phone app had solved this once, in `book-control.tsx`.
- **Only the sidebar knew which pages a role has.** ADR 73 closed this for
  `/payments` by branching inside the screen, and left the rest: an instructor
  who typed `/members` still rendered the owner screen and watched its queries
  get refused. The comment above `AppShell` claimed every screen kept a
  server-side role guard, which no route under `(app)/` ever had.
- **Twenty-four `Intl.DateTimeFormat` instances lived in fourteen screens**,
  while `@matops/domain` already exported `timeFmt` and the Expo app already
  had one `utils/format.ts`. Two files imported the shared clock and then
  declared an identical local one.
- **Two rules existed once per client.** The `Map`-based group-by-local-day
  loop was byte-for-byte the same in the staff schedule, the student schedule
  and the Expo schedule, and the web had reimplemented the day key inline
  rather than call Expo's. The dues status words were written out in both
  clients. ADR 73 says the two clients call the same pure rules; these three
  were the exceptions.

## Decision

**Five seams, no new behavior except the last one.**

- **The academy is context, not a query.** `_components/academy.tsx` holds a
  provider and `useAcademy()`. `AppShell` wraps its children once; every screen
  under it gets a non-null membership and no branch. `useAcademy()` throws if
  it is called outside the shell, which is a bug in wiring, not a state a user
  can reach. Screens that need a role still call the same `isOwner` / `isStaff`
  from `@matops/domain`.
- **`_components/use-booking.ts` owns book and cancel.** One invalidation set
  (`class` for the spots-left counts, `booking` for the student's own list),
  one pair of toasts, and a `busyFor(classId)` so a row disables only itself.
  The three screens call it.
- **`_components/routes.ts` holds one access table.** Owner-only: `/members`,
  `/referrals`, `/settings`. Staff-only: `/schedule`, `/coaches`,
  `/attendance`. Everything else is open to any member and branches by role
  inside the screen, which is the shape ADR 73 chose and this does not reopen.
  The sidebar asks the table what to show; the shell asks it whether to render
  the routed screen at all, and shows `NoAccessState` when the answer is no.
- **`~/lib/format.ts` holds every date and time the web prints.** It re-exports
  the cross-client rules from `@matops/domain` and adds the web's own shapes,
  the same arrangement `apps/expo/src/utils/format.ts` has had since v1.8.
- **`dayKey`, `groupByDay` and `PAYMENT_STATUS_LABEL` move to
  `@matops/domain`,** with tests for the first two. Grouping by local day is
  the only real logic on the student schedule, and it sat in the one layer with
  no test runner.

### Why the guard is in the shell and not the routes

A route-level check would have to be a server component asking who you are,
which is a second session read per page load, on a page whose data is already
loading client-side. The shell already knows the membership and the pathname.
One test in one place covers every route, including the two (`/attendance`,
`/profile`) that have no nav item and would have been forgotten.

### What this does not change

**Nothing on the server.** No procedure, no tier, no schema, no migration. The
`ownerProcedure` / `staffProcedure` tiers remain the only access control that
matters; `routes.ts` decides what a person is *offered*, which is a courtesy.

**No screen was redesigned.** The one visible difference is that typing the URL
of a page your role does not have now says so, instead of painting a screen of
failed queries.

**The role branch inside `/` and `/payments` stays.** ADR 73 chose it and it is
still right: those two paths belong to both roles and differ in content, not in
access.

## Consequences

- A screen can no longer render outside `AppShell`. Every consumer already
  entered through an `(app)/*` page, and `useAcademy()` throws loudly rather
  than silently degrading if that changes.
- The web and the phone now share the day bucketing and the dues words, so a
  change to either lands on both clients at once. That is the point, and it
  also means a change to either is a cross-client change.
- 24 `Intl.DateTimeFormat` instances across 14 screens are now 12 in one file,
  plus the poster's own locale-pinned one, which stays local on purpose. The
  thirteen loading / failed / none triples around `academy.current` are gone,
  and with them the branches for states the shell had already handled.
- `apps/nextjs` still has no test runner. What moved into `@matops/domain` is
  now tested; what stayed in the components is still only checked by
  `typecheck`, `lint` and `next build`. Full suite after the change: 456 green.
