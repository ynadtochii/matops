# 64 · The instructor link grants the instructor role

_(Spec **O4** / **O6** / **O10**, **§4** uniform approval. Amends the idempotent branch of `createPendingMembership` (docs/issues/[14](14-invite-links.md), [20](20-pending-membership.md)) and replaces `membership.demote` from ADR [50](50-settings-staff-management.md). No schema and no migration.)_

## Context

Three separate defects sat on the same seam: the role a person is invited with, and the role they end up holding.

**An invited coach could end up a student.** Opening the instructor link while already a member of that gym hit the idempotent branch of `createPendingMembership`, which returned early and kept the **old** `invitedRole`. A pending student who was then sent the instructor link stayed a pending student, and approval granted "student". The owner had no way to see that the person had asked to be a coach.

**Joining twice claimed a success that did not happen.** An already **active** member who opened any invite link was told "You're in, pending approval" while nothing was written. The message was false in both directions: they were already in, and nothing was pending.

**Approving a coach looked like approving a student.** A pending instructor queued next to pending students in the Members requests tab. Approving them grants the schedule and attendance tools, which is a staffing decision, but the row read exactly like a student joining.

**And there was no way back.** `membership.demote` only stepped an owner down to instructor. Anyone who joined by academy code or by the student link was a student for good; no procedure could make them a coach, and no procedure could undo it.

## Decision

**Newest link wins, but only while pending.** A **pending** row now takes the `invitedRole` of the link just opened. The intent has not been acted on yet, so the freshest one is the true one. An **active** row is still left untouched: changing an approved member's role is the owner's call through `membership.setRole`, never a link's. The status is still granted only at approval, so a link on its own still grants nothing (§4).

**The join screen says what happened.** `membership.join` already returned `{ status, alreadyMember }`; the client now reads it and tells an already-active member to ask an owner for a role change instead of promising an approval that is not coming.

**Coach requests get their own queue.** One pure rule, `isPendingCoach` (pending **and** `invitedRole === "instructor"`), splits the list in all three places it appears: the Members requests tab becomes the student queue, pending coaches wait at the top of Coaches (owner-only), and the O1 dashboard carries "Pending approvals" and "Coach requests" as two items pointing at the two screens.

**`demote` becomes `setRole`.** Same `ownerProcedure`, same locked never-ownerless transaction (`setMemberRoleIfNotLastOwner`), now taking the target role instead of hard-coding `"instructor"`. Input is `InviteRoleSchema`, so it can set `student` or `instructor` and **cannot** grant `owner` — making a co-owner stays `membership.promote`. The member detail Overview gains a student ↔ instructor picker; Coaches → Staff calls the same procedure for "step down to instructor".

## Consequences

The never-ownerless guard now runs on a wider set of calls than it was written for. It holds: `canRemoveOrDemote` returns true for any target that is not an active owner, so student ↔ instructor changes pass through it unchanged, and stepping the last owner down is still refused.

An owner can set the role of a member who is still **pending**. The write lands, but it is inert: every staff gate is `isActiveMember && role`, and `approveMembership` then overwrites `role` from `invitedRole`. Not worth a guard, worth knowing.

`membership.demote` is gone from the router. `architecture.md` §0 and its slice note were updated in the same change; anything else naming it is stale.

Newest-link-wins is a small trust shift. Someone already pending as a student who gets hold of an instructor link can move themselves into the coach queue. They still cannot join without an owner approving, and the owner sees them in the coach queue with "wants to join as instructor" on the card, so the decision is explicit rather than silent. The alternative, keeping the stale role, was silently wrong in the common case.
