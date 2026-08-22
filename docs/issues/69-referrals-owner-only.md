# 69 · Referrals go owner-only

_(Role split, spec **O9** / **O1**. Supersedes the role rule in ADR [52](52-internal-referral-tracking.md) ("Owners and instructors may make the one initial assignment") and the staff-visibility line in ADR [56](56-referrer-first-referrals.md). No schema, migration, or data change.)_

## Context

O9 shipped as a staff screen. An instructor could open the Referrals ledger, see every member who had brought students in, and read what those students had paid this month and lifetime. They could record an initial attribution but never change one, so the screen carried a second, read-only shape: locked chips, a "credit removed · owner only" row, and a hidden "Already recorded" group.

Two problems came out of that.

The first is the data. O9 joins current attribution to confirmed payment claims, so the screen shows money per person. ADR 38 and ADR 52 both say instructors never see money, and `stats.revenue` is owner-only for exactly this reason. O9 was the one place a coach could read it, one member at a time.

The second is the screen itself. Half the components existed only to render the state where a coach can look but not touch. A ledger nobody may correct is a report, and this report belongs to the person who owns the roster.

## Decision

O9 is owner-only, at the API and in the shell.

- `referral.dashboard` and `referral.assign` move from `staffProcedure` to `ownerProcedure`. `correct` and `history` were already owner-only.
- `dashboard` no longer returns `isOwner`, and every instructor-only branch in the screen goes with it: the locked chips, the "credit removed · owner only" row, the "only an owner can change it" hint under the board, and the read-only variant of an uncredited row.
- The nav item is hidden for non-owners, as the other owner screens already are.

The same audit found one more figure wider than its spec rule, fixed in the same change: `stats.gym` is staff-tier and always returned `newMembersThisMonth` / `newMembersLastMonth`, which spec O1 (D.4) marks owner-only. The dashboard hid them in the client, which is not a guard. The two fields become one `newMembers` object, null for an instructor, and the member read behind them is skipped rather than computed and thrown away.

## Consequences

An instructor who was recording referrals loses that. The owner records them instead, which matches who may correct one: attribution was already permanent for a coach, so the flow they lose is the one where a typo could not be undone by the person who made it.

`stats.gym` changes shape for every caller. The web dashboard is the only consumer, and it now renders the stat on the presence of `newMembers` rather than on a client-side role check.

Both tiers are covered in `packages/api/test/tenant-seam.test.ts`, so a future widening fails a test rather than a review.
