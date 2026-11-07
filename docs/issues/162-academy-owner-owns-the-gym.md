# 162: An academy owner owns the gym

**Status:** accepted, 2026-11-07. Amends ADR 124 (the gym role is no longer written only by Better Auth) and ADR 125.

## Problem

A person has two roles: the academy role (`entity_membership.role`) and the gym role (Better Auth `member.role`). Since ADR 124 the gym role was written only when Better Auth created the row. Making a staff member a co-owner from Coaches (`membership.promote`) changed only the academy role.

Memberships, the Students import and export actions, and every gym-level procedure check the gym role (`canRunOrganization`, `runsOrganization`). So a promoted co-owner saw "Owner" and Settings but not Memberships. This happened in production on 2026-11-07.

A co-owner whose gym role is `owner` also could not be suspended or archived, because `requireBranchLifecycleChange` refuses anyone with a gym role.

## Decision

1. **An active owner of any academy of the gym is an owner of the gym.** `writeMembership` (`packages/db/src/membership.ts`), the one write path for academy role and status, updates `member.role` after each write (`syncGymOwner`).
2. **Losing the last academy ownership removes the gym ownership.** When an owner row is suspended, archived or removed and the person owns no other active academy of the gym, `member.role` goes back to `member`. Restore gives it back.
3. **A gym manager is not touched** unless they become an academy owner. Owner ranks above manager.
4. **`requireBranchLifecycleChange` allows a gym owner whose academy role is owner**, because the change also removes their gym role. It still refuses a manager, and a gym owner whose academy row is not an owner row. The last-owner guard is unchanged.
5. **Erase keeps a gym owner's account and gym row.** `purge` reads the gym role before its archive step, so a gym owner is never deleted, but they lose the owner role like any archived owner.

## Data

No migration. `packages/db/scripts/2026-11-07-academy-owner-gym-owner.sql` gives the gym role to every active academy owner who lacks it. Run it once by hand on each database.
