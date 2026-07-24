# 50 · Staff management in Settings — see the staff, add an instructor, quiet owner changes

*(Web UX + one thin API/DB slice. No migration, no token change. Reuses the
existing invite-link and never-ownerless machinery.)*

## Context

Owner-level people management lived on the **Roster** (O4): one long list mixing
students, instructors, and owners, with a **prominent "Make owner" button on every
member row** and no way to step an owner back **down**.

Two things were wrong for how gyms actually work:
- **Making an owner is rare.** A loud per-row button oversold an uncommon action.
  An academy usually has one owner, sometimes a few co-owners — all with full
  rights — set up once and rarely touched.
- **There was no home for "the staff".** Adding an instructor already worked
  through the per-role **invite link**, but the link and the staff list were not
  together, and there was no single place to answer "who runs this gym?".

## Decision

Add a **Staff** section to **Settings** (O6) and move owner promotion there;
demotion (owner → instructor) is new.

**1. Settings → Staff lists the whole staff and onboards instructors.**
- New lean read `membership.staff` (owner-only): active **owners + instructors**
  only (`memberId`, `name`, `email`, `role`) — no dues/visit joins (that's the
  roster's job). Backed by the existing `listMembersOf`, filtered in the router.
- The **instructor invite link** moves into this section ("Add an instructor").
  The reusable card was extracted to `invite-link-card.tsx`; the old `Invites`
  section keeps only the **student** link, retitled "How students join".

**2. Owner changes are quiet, not loud.**
- Each staff row has a per-person **⋯ menu** (`DropdownMenu`), not a button:
  instructor → **"Make co-owner"** (`membership.promote`, unchanged); owner →
  **"Step down to instructor"** (`membership.demote`, new).
- Confirmation runs through a **controlled `AlertDialog`** driven by the menu —
  `ConfirmDialog`'s own trigger can't be nested in a dropdown item (the menu
  closing unmounts it before it opens), so the row owns the dialog's open state.

**3. Never ownerless holds for demotion too (§4).**
- New DB helper `setMemberRoleIfNotLastOwner(academyId, memberId, role)` — the
  sibling of `setMemberStatusIfNotLastOwner`: same one locked transaction
  (`FOR UPDATE` on the academy's member rows), same pure `canRemoveOrDemote`
  re-check, but writes `role` instead of `status`. Two owners stepping each other
  down at once can't both pass and strand the gym.
- The router wraps it in `setRoleOrRejectLastOwner`, mirroring the status path;
  the last active owner's "Step down" is also greyed client-side (server still
  enforces it). `canRemoveOrDemote` already covered demote — no domain-rule change.

**4. Roster loses the "Make owner" button.** O4 keeps approve / suspend / remove;
owner role changes are Settings-only now.

## Why not keep it on the Roster

The roster is the day-to-day member screen — approve joins, mark drift, chase
overdue dues. Owner promotion is a rare admin act that belongs with the other
rare admin acts (rename, bank details, venue QR) in Settings, where its low
frequency justifies a quiet menu instead of a button on every row.

## Notes / edge cases

- **Owners are never invited.** Owner is only reachable by promoting an existing
  active member — unchanged (`INVITABLE_ROLES = student | instructor`).
- **`invite.list` deduping.** Both the student and instructor `InviteLinkCard`s
  read `invite.list`; React Query dedupes the shared query key, so no double fetch.
- **Demote target = instructor** (not student): stepping an owner down leaves them
  as staff (schedule + attendance), which matches intent; a full removal is still
  the roster's remove/suspend.

## As-built status (2026-07-23)

- Web + one API/DB slice. Green: repo-wide typecheck 17/17 · lint 15/15 · tests
  (domain `membership.test.ts` now covers demote-of-last-owner blocked / allowed) ·
  `next build`. No mobile change (staff management is owner-only, web-only). A
  real-browser pass of promote / step-down and the last-owner guard wants a manual
  click-through.
