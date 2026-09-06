# 127 — The owner level

**Status:** accepted · **Date:** 2026-09-04 · **Area:** `packages/db` (migrations `0057`-`0058`), `packages/domain` (the claim rule, the staff filter, the announcement fan-out), `packages/validators`, `packages/api` (organization procedures, activation), `apps/nextjs`, `apps/expo`. **Amends:** [126](126-a-branch-is-not-always-a-mat.md) §3, where bank details stayed per branch and moving a branch onto the new gate was "not authorized by this note". **Relates to:** [124](124-the-organization-owns-typed-entities.md) (the tenant model and the organization read pattern), [40](40-manual-transfer-payments.md) (the legacy branch dues and the "I paid" claim it already has), [82](82-membership-booking-gate.md) (the legacy gate), [63](63-settings-split-by-job.md) (settings live with the job they belong to).

The run file is
[owner-dashboard-plan.md](../owner-dashboard-plan.md) and the step by step
detail is [owner-dashboard-detailed-plan.md](../owner-dashboard-detailed-plan.md).
Product rules are OD1 to OD7 in [spec.md](../spec.md). This note fixes the
names, the invariants and the decisions the owner settled, before any code is
written.

## Why

ADR 126 gave the organization real content: plans that cover several branches,
one membership record per person, a month tracker, a directory and an overview.
It gave that content no home. Three pages sit at the organization level and
nothing frames them: `/overview`, `/people` and `/memberships` each draw their
own logo and their own column, and the only way between them is two buttons
somebody hand-placed on the overview.

Three things are missing rather than merely unframed.

The gym's bank account is stored once **per branch**, on
`payment_settings.bank_details`. A shared membership covering a mat and a gym is
one payment into one account, so that row now answers a question that has two
answers and no right one. The member on a shared membership is shown neither:
`accessPlan.mine` returns a warning with no account to pay into, and the only
screen that shows bank details is the legacy dues path a member on shared
memberships never reaches.

A member on shared memberships cannot say they paid. The legacy path has had
that since ADR 40: transfer the money, press **I paid**, the owner confirms.
The new path has the owner ticking a month and the member with no way to prompt
them.

Activation is a script. `entity.membership_enforced_at` decides which of the two
gates a branch runs on and nothing in the product writes it. ADR 126 §3 said
moving an existing BJJ branch "is not authorized by this note" and meant it. The
work has been done since, by hand, with psql, on the pilot gym.

## 1. One shell, not a second app

A route group, `(app)/(organization)/`, holds `overview`, `people`,
`memberships`, `staff` and `settings`. A route group adds no path segment, so
every URL and every existing link is unchanged. Its layout draws the same frame
the branch screens use, with a different item list.

The frame is extracted once and used twice, rather than copied. It already
carries the badge rendering, the five-tab overflow menu, the safe-area padding
for an installed PWA and the sidebar footer. A second copy would drift within a
wave, and the two would then disagree about what a badge looks like.

A non-owner sees **Overview** and nothing else, which is the branch list they
already get. The nav is convenience, not security: every organization procedure
authorizes the owner before it enumerates a single entity, which is the rule
ADR 124 set so a non-owner never learns that a sibling branch exists.

The entity selector marks **All branches** as current when the path is not under
`/entities/`, so the frame always says where you are.

## 2. One bank account

`membership_policy` gains `bank_details`. That table is already the
organization's own settings record, holding the grace days and the calendar time
zone, and for the same reason: a membership covering three branches has to be
one answer, not three.

**Every reader reads that row.** Both the shared standing and the legacy
`payments.myDues` show the organization's account. The legacy branch dues keep
their own gate, their own plans and their own claims, and only their bank
details move. A gym that is half switched over must not be able to print two
accounts.

The per-member reference stays **derived, never stored**, which is what ADR 40
chose and what makes it survive a rename. It is `paymentReference(name, id)`
with the assignment id rather than the member id: the same function, because the
job is the same job, matching a line on a bank statement to a person in seconds.

The branch editor, `payments.updateRequisites` and `payment-requisites.tsx` go.
`payment_settings.bank_details` is then dead and is dropped **one deploy later**,
because a migration lands while the old code is still serving and that code still
selects the column.

## 3. A member says "I paid"

`membership_month` gains `claimed_at`. A member marks the month they are being
judged on as sent. The owner confirms it, which marks the month paid and clears
the claim, or rejects it, which clears the claim and changes nothing else, so
they can claim again.

**The server picks the month, never the caller.** It is `monthOf(now)` in the
organization's calendar zone, which is the same month the member is being shown,
join month included. A claim that could name a month would need a rule about
which months are claimable, and that rule would be a second opinion about
something `membershipStanding` already decides.

**Claiming twice is one claim.** A second press finds the flag and reports that
nothing changed. A double click, a retry and a stale screen all land on the same
state, which is the same property `markMonth` was given for the same reason.

**No amount is stored.** The tracker records that somebody said they paid, not
money. An amount here would be a number the gym never verified, sitting next to
figures it did, and the overview already refuses to report a tick as revenue.

**A rejection writes no audit row.** `membership_month_audit` is the history of
the paid flag, and a rejection does not change it. Reading that table must keep
answering "what was corrected, and by whom", not "what did somebody claim".

The claim is an `enrolledProcedure` filtered to the caller's own assignment. RLS
scopes the table to the organization, so two members of one gym can see each
other's rows through the policy alone. The reader is what keeps them apart,
which is the same conclusion ADR 126 §8 reached about `forUser`.

## 4. Activation is a procedure with a preview

`entity.setMembershipEnforced` takes an entity id and on or off, owner only,
organization-scoped, and refuses an entity of another organization **before any
read**. `entity.activationPreview` answers the only question worth asking first:
who stops being able to book.

The preview is the branch's active members that no active membership covers. It
is not a new rule. `loadRosterStanding` already computes `covered` per person
from `coveringAssignments`, the same pure function the gate itself runs, so the
preview and the gate cannot disagree. Every active member counts, whatever their
role: booking runs the gate for anybody who books and gives staff no bypass.

**Off is allowed.** It hands the branch back to the legacy dues gate and is
ADR 126 §7's rollback, made reachable. Nothing about the memberships covering the
branch is deleted by switching either way.

**Turning it on twice keeps the first timestamp**, the same idempotence
`updateBookingGate` has.

## 5. An activated branch has no Payments screen

ADR 126 left this half done, and the v7.4 click-through found it: an activated
branch still showed an owner Payments item, a page of plans the server had
stopped reading, and a bank details form. The plans list and the link were fixed
then. The rest goes now.

At an activated branch the owner has **no Payments item at all**. Its plans,
dues and claims are not this branch's business any more: they belong to the
organization, and Memberships is where they live. The student item is labelled
**Membership** and shows the standing, the account and the claim, rather than a
dues line they do not owe.

A branch still on the legacy gate is untouched, and its Payments screen gains one
line saying its bank details now live in Settings.

The dues reminder sweep skips an activated branch. The guard goes in the
**claim**, not the resolve: the claim stamps the reminder period and the resolve
drops the row, so a filter in the resolve would burn the period and a branch
switched back later would silently never be reminded. That is the same reasoning
the existing membership join in that query already carries.

## 6. Staff and announcements are organization reads

Both follow the shape ADR 124 fixed and ADR 126 reused: authorize the owner
first, read each entity inside its own exact scope, one transaction each, and
combine with a pure function afterwards. There is no organization-wide query over
the tenant tables and no relaxed policy. It is slower than one big read, and that
is the point, because the alternative is a mode where one query sees two
branches at once.

**Staff is a lens on the directory, not a second read.**
`stats.organizationMembers` already returns one row per person with a role per
branch. It needs one field, `invitedRole`, so a pending coach can be told from a
pending student, and one pure filter beside `combineDirectory`. No new
procedure and no new table.

**Acting stays at the branch.** Approving, promoting and setting a role are on
that branch's Coaches page, reached from the badge. That is GB5's rule applied to
staff: the organization level shows, the branch level acts, and there is never a
second editable copy of anybody.

**One announcement, several branches.** A person at two branches gets **one inbox
row per branch**, because the feed is per branch and a message they cannot find
where they are looking is a message they did not get. They get **one push**,
because a phone buzzing twice for one announcement is the gym shouting. That
split is a pure rule with a test, and it does not go through `deliver`, which
pushes once per row.

`announceAll` is **owner only**, where the per-branch `announce` is staff. An
instructor runs one mat and posting to every branch is not that job.

## 7. What this does not authorize

Logo upload. There is no file storage in the stack, and adding one for an icon
is a new dependency, a new bucket and a new deletion path.

Deleting an organization. The branch danger zone stays the only destructive
door, and closing the last branch already closes the gym.

Any money movement. No processor, no collection, no reconciliation. The claim is
a message, not a payment.

Referrals across branches, a leads roll-up, a shared curriculum library, an
organization-level invite list, and moving a member or a class between branches.

**Curriculum stays per branch**, settled by the owner rather than deferred. A
plan for a mat is a plan for that mat's week.

## 8. Rollout

Two migrations, `0057` and `0058`, one added column each, both additive and
structure only. Neither needs a policy or a grant: both tables already carry
their `*_isolation` policy on `app.organization_id` and all four `matops_app`
grants, and a new column inherits them.

Copying the existing per-branch account onto the organization row is a **hand-run
fill** under `packages/db/scripts` with a dry run first, not a migration, because
it is right once on one database. It copies the default branch's account and a
second run writes nothing.

**No feature flag.** Every slice is additive until the branch Payments screen is
retired, and that retirement changes only branches an owner has switched on
themselves. There is no half-built state a member can reach.

Rollback of a switched branch is the same switch turned off, which restores the
legacy gate. Rollback of the shell is a revert, since no data moved for it. The
one irreversible step is `0059`, the drop of `payment_settings.bank_details`,
which ships a deploy after everything else and only once the fill has run.

## 9. Outcome, appended 2026-09-04

Built, in the order this note set, with a log entry per step in
[the run file](../owner-dashboard-plan.md). What is worth carrying back here,
because it differs from what the sections above assumed:

**Three pieces of work turned out to be already written.** The activation
preview needed no new rule: `loadRosterStanding` already answers `covered` per
person from the same `membershipAccess` the gate runs. The staff directory
needed no new grouping and no new procedure: `combineDirectory` and
`stats.organizationMembers` already return one row per person with a role per
branch, and only `invitedRole` was missing, which the roster read was selecting
and the directory read was dropping. And the membership reference needed no new
function: `paymentReference` is the same job with the assignment id in place of
the member id. Section 6's shape held; the amount of new code it needed did not.

**The claim names no month.** Section 3 said the server picks it. That turned
out to remove a whole rule rather than merely one input: with the month derived
from `monthOf(now)`, there is nothing to decide about which months are
claimable, and the pure rule shrank to `canClaimMonth({ paid, claimedAt })`.

**`payments.getRequisites` could not be deleted**, as the caller inventory
found: `booking-gate.tsx` reads it for the legacy gate's own fields. It kept its
name and lost only `bankDetails`, which leaves the name a little wrong and the
diff a lot smaller.

**The policy write became a replace.** Adding the account to `setPolicy` means
grace, the zone and the account are written together, so the Settings screen
carries ONE form with one Save. Two forms writing that procedure would blank
each other's field, which is the kind of bug a partial-update shape invites.

**Verified on dev:** migrations `0057` and `0058` applied (58 of 58), the fill
run once with a dry run and a second time writing nothing, and 1441 tests green
across five packages. **Not verified:** nobody has clicked through it, and the
Expo changes are static-gates-green only, as every mobile wave since v1.8 has
been. `0059` drops `payment_settings.bank_details` one deploy later.
