# Goal

Close the remaining pivot review gaps before merging `dev` into `main`.

## Context

PR #4 is a hard cutover on an empty production database. Migration `0047` stays in this release. The old application does not need to remain compatible.

## Decisions

- Keep migration `0047` unchanged. It is structural only and contains no data writes or backfill.
- Make `academy.rename` write through the entity-scoped transaction.
- Make `academy.current` apply the same live-membership and active-organization rules as entity procedures while preserving its nullable gate response.
- Serialize academy closure by locking the shared organization row before checking for a live sibling.
- Keep `softDeleteAcademy` on the base connection because it also updates `organization`.
- Remove repository-standard violations introduced by the pivot branch.

## Implementation Steps

1. [x] Fix `academy.rename`, `academy.current`, and concurrent academy deletion.
2. [x] Add focused regression cases without comments in test files.
3. [x] Fix Add academy validation and its accessible error state.
4. [x] Reconcile pivot documentation and clean new test comments.
5. [x] Leave earlier commits and the PR body unchanged.
6. [x] Run `git diff --check`, `pnpm lint`, and `pnpm typecheck`.

## Current Step

Implementation complete. Targeted tests remain with the user.

## Test Plan

- Add coverage for scoped rename, inactive memberships, active-organization mismatch, and concurrent closure.
- Do not run tests in the agent session. Provide targeted commands for the user.

## Rollout

- Keep migrations `0042`-`0047` in PR #4.
- Reconfirm production is empty before merging.
- Resolve the Vercel account block and complete manual web and mobile checks.

## Open Questions

- None.
