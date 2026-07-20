# 14 — Better Auth Organization: pending-approval feasibility

Type: research
Status: resolved
Blocked by: —

## Question

**Refines [02](02-auth-stack.md) / [08](08-mvp-domain-model.md).** The identity model assumes we model academy = Better Auth `organization`, membership = `member` with a custom `status: 'pending' | 'active'`, and build the self-join-then-owner-approves flow on top. This was **never validated** — the auth research checked Better Auth generally, not this specific pattern. Better Auth's Organization plugin is built around invitation-*accept* → active member; a "pending, awaiting approval" member may fight its APIs.

Research (Better Auth docs + source, as of 2026-07):
1. Can a `member` carry a custom status via `additionalFields`, and can we create a member in a non-active state without an accepted invitation?
2. Does anything in the plugin assume members are active (access checks, `hasPermission`, listing, active-organization switching)?
3. What does the **invite-link** flow actually look like (shareable link vs per-email invitation), and can one invite grant a specific role (student vs instructor)?
4. Fallback if it fights us: keep Better Auth for authN + org identity, but model **membership/role/status in our own Drizzle table** — cost/benefit.

Output: a clear verdict — "Better Auth member+status works, here's how" OR "roll our own membership table, here's why" — with the invite/approve flow spelled out. Resolve via a `/research` subagent.

## Answer

Full report: [research/better-auth-approval.md](../research/better-auth-approval.md).

**Verdict: keep Better Auth's `member` table with a custom `status` field — do NOT roll our own membership table.** Since org plugin v1.3, `additionalFields` on `member` are supported, so `status: 'pending' | 'active'` is legal. A member can be created **pending, without an accepted invitation**: the `addMember` server API bypasses invitations and spreads custom body fields into the row; a `beforeAddMember` hook forces `status: 'pending'`. Per-invitation roles, 48h expiry, and a shareable `getInvitationURL` all exist.

**Flow:** owner shares link → new user authenticates → server route calls `addMember({ userId, role, organizationId })` with `status:'pending'` → owner approves by patching the row to `'active'`.

**⚠ Design-critical risk:** the plugin has **no notion of member status in its access path**. `hasPermission` is role-only; `setActive` gates on membership *existence* only; `acceptInvitation` sets no status; `listMembers` doesn't filter. **A `pending` member carrying a role silently passes every access check.** Status is inert metadata unless WE enforce it.

**Required mitigation (feeds [12](12-tenant-isolation-mechanism.md) + [20](20-instructor-permissions-and-approval-gate.md)):** add a shared server guard in the tRPC tenant middleware that rejects `status !== 'active'` — AND/OR assign the role only at approval (a pending member holds no role, so even a missed guard grants nothing). The latter is the safer default. Pin the Better Auth version and add an integration test (`additionalFields` type-inference bugs: GitHub #5122, #5234).

## ⚠ Refined by the low-friction wave (session 11)
Pending members are no longer fully blocked. A new **`enrolledProcedure`** tier lets a pending member read their academy's schedule + provisionally book/cancel + self check-in ([23](23-pending-capability-never-block.md)). The **`student` role is still granted only at approval** (the security property here is preserved) — approval upgrades provisional → confirmed + roster membership.
