# 32 — Numeric academy code for mobile join (search-to-join, v1)

Type: build-decision (mobile map v1)
Status: resolved
Refines: [31](31-deep-link-approach.md), [28](28-invite-link-model.md), [29](29-pending-role-model.md); spec S2; architecture §6

## Question

Spec S2 opens the mobile join flow from an **invite link** (a `matops://join/<code>`
deep link, ADR 31). Deep links need a dev build to fire and a token pasted from
somewhere — more moving parts than the mobile v1 needs. What is the simplest join
path a student can use on the phone with no link and no dev build?

## Answer

**Give every academy a plain 6-digit code. The owner shares the number; the
student types it in the app, we look the academy up, they confirm and join as a
pending student.** No deep link, no token, no pasted URL on mobile for v1.

- **Data:** one new column `organization.public_code` — a 6-digit string, NOT
  NULL + UNIQUE (migration `0010`). Assigned at academy creation by the auth
  `afterCreateOrganization` hook (`assignAcademyCode`, crypto-random with a
  collision retry); existing academies are backfilled in the migration. The code
  lives on the academy row because it is 1:1 with the academy — unlike the
  `academy_invite` table (ADR 28), which is many-per-academy with a revoke
  lifecycle.
- **Lookup:** `academy.findByCode` (protected — the mobile flow runs after
  sign-in) resolves a code → `{ academyId, name }` or null, on the base
  connection (the organization table has no academy RLS policy, same as the
  invite resolve, ADR 28).
- **Join:** `membership.joinByCode` creates the same PENDING membership as the
  invite-link `join`, sharing one internal `joinPending` step. The granted role
  is **always `student`** (`CODE_JOIN_ROLE` in `@matops/domain`): the Expo app is
  the student app, so there is no per-role choice on mobile. `invitedRole` still
  carries the role to the approval step (ADR 29) — it is just fixed to `student`.
- **Mobile UI:** the onboarding screen is a two-phase single screen — enter the
  6-digit ID → find the gym → confirm + minimal profile → join → land on the
  schedule with the S3 pending banner.
- **Web:** unchanged. Owners still generate per-role invite links (ADR 28) for
  instructors; the dashboard also shows the academy ID to copy and share. The
  code lives alongside the invite links, it does not replace them.

## Why this split

- **Simplest possible mobile onboarding.** A number a coach reads out loud works
  with no dev build, no store, no domain, no pasted URL. Deep links (ADR 31)
  needed all of that to be smooth.
- **Role is not a mobile concern.** The student app only ever creates students,
  so a single shared number is enough — the per-role invite link only mattered on
  the web, where instructors also join.
- **Additive, low-risk.** The invite table, the invite router, the web invite UI,
  and the `matops://join/<token>` route all stay in place for the next iteration.
  The change is one column + two procedures + one screen.

## Consequences / carried forward

- **The code is a search key, not a secret.** A 6-digit space (900k) is not
  meant to be unguessable — anyone who enumerates a code reaches only the *join*
  screen, and a join is a **pending** membership that grants nothing until an
  owner approves (ADR 29). The blast radius of a guessed code is a spam pending
  row, which the owner rejects. If enumeration ever becomes a real problem, widen
  the code or rate-limit `findByCode`.
- **Deep links return next iteration.** ADR 31 (custom scheme + universal links)
  is deferred, not dropped — the `join/[token]` route and `extractInviteToken`
  stay so old shared links keep resolving. Mobile v1 simply does not promote them.
- **Backfill uniqueness.** Migration `0010` fills existing academies with unique
  random codes in a `DO` loop, then adds the UNIQUE constraint; new academies get
  their code from the auth hook.

**Refines** [31](31-deep-link-approach.md): mobile v1 joins by a numeric academy
code, not a deep link; the deep-link approach returns in a later iteration.
