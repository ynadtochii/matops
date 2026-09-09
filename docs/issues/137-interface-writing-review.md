# 137. Interface writing review: one word per thing, and an error that names a way out

**Status:** accepted
**Date:** 2026-09-09
**Follows:** [136](136-interface-review-fixes.md), the same review's copy half.
**Extends:** `branchWords()` (v7.6, `docs/architecture.md` §Words), by fixing the
org-level noun the module never held.

## Context

A writing pass over every user-facing string in both clients: `_components`
(20k lines of TSX), the public routes, `apps/expo`, every `TRPCError` message in
`packages/api`, and the message builders in `packages/domain`.

Two failures ran through most of the findings.

**The product used seven words for two things.** `gym`, `academy`, `branch`,
`organization`, `space`, `room`, `mat`. `branchWords()` already existed as the
single vocabulary source, and its own comment says the database's words must
never reach a screen, but only two files imported it. Everywhere else a screen
invented the noun. The sharpest case: the owner's settings screen called the
six digits a student types an **Academy code**, while both student clients told
that student to enter a **Gym ID**. One number, two names, on the two sides of
a handoff that happens out loud.

**Some errors named a state and stopped.** `No membership of yours covers X.`
told a student they were blocked and left them there. `This class is outside
your attendance editing window.` showed an instructor a wall, when
`attendanceWriteAccess` lets an owner past it with a reason.

## Decision

### 1. Two nouns, fixed

**gym** is the whole business (the organization row). **branch** is one place,
or the typed word from `branchWords()` where the screen knows the type
(`academy` / `space`). `organization` never reaches a screen: the sidebar group,
its two nav items, the settings page and its rename toast all say *gym* now.

`branchWords()` is the source wherever a screen already holds the entity type.
It gained no org-level field: the gym word is constant, so a per-branch-type
record is the wrong home for it.

### 2. The six digits are a **join code**

Owner screen, both student clients, the validator message and the two lookup
errors. `Gym ID` and `Academy code` are gone.

### 3. Every blocked state names the way out

`accessReason` is the one place all six now live, and the two duplicate copies
of the pending-approval sentence (in `payments-gate` and in the web's
`use-booking`) call it instead of re-writing it. `BOOKING_LOCKED` moved to
`@matops/domain` so the fallback is one string, not three.

### 4. Field errors sit under their field

Five call sites raised a **toast** for form validation. They render a
`FieldError` with `aria-invalid` and focus now, which is what ADR 120 already
settled for the public forms.

### 5. A deadline the reader cannot misread

The grace-days explainer hard-coded *September* and said *midnight* without a
side. It is month-neutral and says `00:00 on the next day` with the zone.

### 6. Voice

`Couldn't <x>. Try again.` is the house error shape (ADR 136 set it on the web;
the Expo app and 20 server messages join it here). Buttons are verb-first
(`Change price`, `Choose branches`, `Require payment to book`). Settings
describe their ON state. The em dash is gone from user-facing copy.

## Consequences

No migration, no procedure signature changed. Two assertions in
`tenant-seam.test.ts` matched a message by regex and moved with it: the
no-gym error, and the paused-member one, which now asserts `/paused.*restore/`
so it checks the reversibility the test name promises rather than the word
`suspended`. `accessReason`'s own tests check substrings and length, and every
other router test asserts a TRPC code.

**Suite green after the change:** 1446 tests across 125 files (domain 637,
api 556, db 209, validators 41, notifications 3).

## Out

Renaming `academy_id` and the `academy*` component filenames to match the new
vocabulary (818 hits, ADR 124's out-list already holds it). Translating any of
it. The em dash in code comments.
