# 49 · Web login routing — land in your academy, don't push "create"

*(Web UX; fulfils the A3 "seamless owner onboarding" intent + the S1/S2 sign-in
spine on the web. No domain rule change, no migration, no token change.)*

## Context

A fresh Better Auth session starts with **no active organization**
(`activeOrganizationId = null`). The web shell (`AppShell`) treated "no active
academy" as one thing: it showed the **Onboarding ("Start a gym")** screen to
**everyone** on every login — the create-a-gym form first, with an optional
"open an academy you belong to" list underneath.

That is wrong for the common case. Creating a gym is a **rare, one-time** action
for a small set of owners. Most sign-ins are a returning owner, instructor, or
student who just wants to land back in their gym. Pushing "Start a gym" at all of
them is noise, and a returning member had to hunt for the small list below the
create form. There was also **no way on the web** for a brand-new member to join
a gym by its code — the 6-digit join existed only on mobile, even though the
backend (`academy.findByCode` + `membership.joinByCode`) already supported it.

## Decision

Split the single "no active academy" screen into **two entry points** driven by
intent, and route by membership on login.

**1. Login routes you by how many academies you belong to (the gate).**
A new client `AcademyGate` (`apps/nextjs/src/app/_components/academy-gate.tsx`)
renders only when the session has no active academy. It reads a new query,
`academy.memberships` — every academy the caller has a **live** tie to (status
`pending` or `active`, any role; drops `removed`/`suspended`) — and branches:
- **0** → **Join your gym** by its 6-digit code (`JoinByCode`, new). The new-user
  path. They confirm the gym, add name + phone, and join as a **pending student**
  (`membership.joinByCode`, `CODE_JOIN_ROLE`), the same gate as the invite link.
- **1** → **open it automatically** (`academy.setActive` on mount) and land in the
  console — no click, the common case.
- **2+** → **pick which one** (a short list → `academy.setActive`).

`academy.memberships` is deliberately broader than `academy.listMine` (the
**web-lens** switcher, owner/instructor only): the gate must also see a student
membership, so a returning student is not re-asked for a code. The switcher keeps
its web-lens semantics (ADR 18) unchanged.

**2. "Start a gym" is its own deliberate entry, off the landing page.**
- The sign-in page gains a quiet **"Running a gym? Start a gym"** link → `/start`.
- `/start` (new route, outside the `(app)` group) shows **sign-in** when signed
  out (returning to `/start` after auth via `callbackURL`), and the **create
  form** (`CreateAcademy`, extracted from the old Onboarding) when signed in.
  Creating makes you the active owner at once (the `afterCreateOrganization`
  hook), so it drops you straight into `/`.

The old `Onboarding` component is removed; its create half became `CreateAcademy`
and its "open one you belong to" half became the gate's pick step.

## Why not a server-side session hook

Better Auth could set `activeOrganizationId` at session creation via a
`databaseHook`. Rejected for v1: the "2+ academies → ask which" case still needs a
UI, and a single academy is cheap to open client-side. Keeping the decision in one
small client component (the gate) is easier to read and change than splitting it
between an auth hook and the shell. Revisit if the open-on-login flash matters.

## Notes / edge cases

- **Fail-closed on load errors stays.** ADR 47 already made a failed
  `academy.current` show a retry, not misroute to onboarding; the gate keeps that
  (its own `academy.memberships` load has a retry state).
- **Removed/suspended-only user** → `academy.memberships` is empty → they see
  "Join your gym", and re-joining by code re-opens the membership to pending
  (`createPendingMembership`), which is the intended recovery.
- **New owner** flows through `/start` (create), **new student** through the gate
  (join by code); the two never collide.

## As-built status (2026-07-23)

- Web only. Green: repo-wide typecheck 17/17 · lint 15/15 · tests 50 · `next build`
  (the `/start` route builds). No mobile change. A real-browser click-through of
  the 0 / 1 / 2+ branches wants a manual pass.
