# PR #6 review findings

Reviewed on 2026-09-06. PR: `Dev`, merging `dev` into `main`.

- Head: `1e70c6af5a7afaa0d2d78f401fb9c6ab52cca02b`
- Base and merge base: `edb202ceeeb0a86296dee1192f22fa2853b403a1`
- Assessment: request changes.

Paths and line numbers below refer to the reviewed head.

## Findings

### 1. [P1] Scope membership writes to the selected branch

Location: `packages/api/src/router/entity.ts:221`

`setBranchRole` and `decideAtBranch` select by user ID alone. Database isolation covers the organization, so both can select another branch's membership. Adding someone to branch B can change their role at branch A instead. Filter both queries by `entityId`.

### 2. [P1] Calculate grace from the assignment's effective month

Location: `packages/domain/src/membership-month.ts:99`

A plan change scheduled on September 6 creates October's assignment immediately. Readers pass September 6 as `joinedOn`, so October's deadline becomes September 13. The member starts October already blocked. Apply join-day grace only when that day belongs to the month being charged.

### 3. [P1] Enforce membership access during QR check-in

Location: `packages/api/src/router/checkin.ts:131`

Check-in checks capacity but never calls the new membership gate. An unpaid or uncovered member can book and mark themselves present through this endpoint. Pending members also bypass strict capacity because their provisional bookings never claim a seat.

### 4. [P1] Derive copied capacity rules from the destination branch

Location: `packages/db/src/provision.ts:267`

Branch creation allows copying between branch types. Copying a BJJ schedule into a general space preserves `capacityPolicy: "soft"`. Generated sessions then accept bookings beyond their capacity. Set the policy from the destination type.

### 5. [P1] Exclude legacy branches from membership cancellations

Location: `packages/api/src/membership-sweep.ts:266`

The cancellation sweep never checks `membershipEnforcedAt`. An unpaid shared assignment can therefore cancel bookings at a branch still using legacy dues, even when those dues are paid. This also breaks switching a branch back to its old payment gate.

### 6. [P2] Refresh mounted queries when switching mobile branches

Location: `apps/expo/src/components/branch-switch.tsx:52`

Secure storage changes without triggering a render. `removeQueries()` removes cached queries but does not reset or refetch mounted observers. The schedule can keep showing the previous branch while requests already carry the new branch ID.

### 7. [P2] Check room overlap when changing template duration

Location: `packages/api/src/router/template.ts:237`

Duration changes use the direct update path and bypass the overlap guard. Extending a general-space session from 60 to 90 minutes can overlap the next session. Validate affected occurrences before updating them.

### 8. [P2] Claim a seat for walk-ins with cancelled bookings

Location: `packages/api/src/router/attendance.ts:196`

Any existing participation row skips the capacity check, including a cancelled booking whose seat was released. Staff can admit that person into a full strict session without increasing its count. Check whether the existing row actually holds a seat.

### 9. [P2] Serialize coverage edits before checking their version

Location: `packages/api/src/router/accessPlan.ts:937`

Two requests can read the same version and both pass validation. Their separate coverage edits can produce a branch list neither requested. Lock the plan before reading its version and coverage, or use an atomic version check.

### 10. [P2] Exclude ended assignments from coverage calculations

Location: `packages/api/src/router/accessPlan.ts:448`

Coverage previews and reconciliation check status but ignore assignment periods. Ended assignments retain `status: "active"`. They can hide a real loss of coverage in previews and enrol former holders when an old plan gains a branch.

### 11. [P2] Apply the review limit after identifying affected bookings

Location: `packages/api/src/membership-access.ts:325`

The query limits bookings before checking coverage. If the first 50 bookings remain covered, an uncovered booking after them never appears. The response also reports no more results. Continue scanning until the affected-item limit is reached.

### 12. [P2] Read booking-review status from the correct branch

Location: `packages/api/src/membership-access.ts:353`

The standing query reads memberships across the organization, then selects the first match by user. Someone active at A and suspended at B can receive the wrong review result at either branch. Filter by `input.entityId`.

### 13. [P2] Load complete alternative coverage before cancelling bookings

Location: `packages/api/src/membership-sweep.ts:82`

The sweep uses a limited assignment batch as its complete coverage dataset. A paid alternative assignment outside that batch cannot protect the member's bookings. There is also no cursor, so repeated runs can continually skip later assignments.

### 14. [P2] Provide a way to price an existing plan

Location: `apps/nextjs/src/app/_components/memberships-screen.tsx:379`

Creation offers "Leave empty to price it later", but existing plans only expose coverage and archive controls. Neither client calls `accessPlan.setPrice`. An owner cannot price that plan later or change an existing price.

### 15. [P2] Preserve an explicit "Nobody" instructor selection

Location: `packages/api/src/router/template.ts:176`

Selecting "Nobody" sends `instructorId: undefined`. The update then restores `prev.instructorId`, so saving silently keeps the instructor. Allow an explicit `null` and distinguish it from an omitted field.

### 16. [P2] Use the gym's calendar for default assignment dates

Location: `packages/api/src/router/accessPlan.ts:192`

Default assignment dates use UTC while access readers use the gym's time zone. Just after midnight on October 1 in Lisbon, an assignment can start in September. That also produces an expired September-based grace deadline.

### 17. [P2] Handle staff references when permanently deleting users

Location: `packages/db/migrations/0052_access_plans.sql:53`

New actor fields reference users with `ON DELETE NO ACTION`. Purging a former manager who assigned memberships leaves those references in other people's records. The final user deletion fails after earlier deletion steps have committed. Clear nullable actor references or use an appropriate deletion rule.

## Verification and remaining risks

The access and cancellation defects should be fixed before merging.

- `pnpm lint` passed using cached results.
- `pnpm typecheck` passed using cached results.
- Tests were not run.
- No source files or PR comments were changed during the review.

Regression coverage should include cross-branch writes, month-boundary changes, QR admission, and concurrent coverage edits.
