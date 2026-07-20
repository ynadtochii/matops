# Better Auth Organization Plugin — "self-join via invite link → owner approves" flow

**Ticket:** Validate the identity model for matops (grappling-academy SaaS).
**Date:** 2026-07-20
**Scope:** Better Auth `organization` plugin, current line (v1.3.x → v1.6.x). All findings below are from primary sources — the live docs and the `main`-branch source in the GitHub repo — not memory.

---

## Verdict

**Use the plugin's `member` row + a custom `status: 'pending' | 'active'` `additionalField`. Do NOT roll your own membership table.** The plugin gives you member-creation-without-invitation (`addMember`), custom fields on `member` that are settable at creation, per-invitation roles, expiry, and a shareable invite URL. All the plumbing you want exists.

**BUT there is one load-bearing catch you MUST design around:** the plugin has **no concept of member status anywhere in its access path.** `hasPermission`, `setActive`/`activeOrganizationId`, `listMembers`, and `getFullOrganization` all treat *"a member row exists"* as *"this user is an active member."* A `member` row with `status: 'pending'` **and a real role will silently pass every access check** unless *you* gate on `status` yourself. Status is inert metadata to the plugin. Own that gate and the model is clean; forget it and pending users get full access.

This is the single biggest risk (details in §2 and §5).

---

## The recommended flow (concrete)

Design: instructors/students self-join an academy via a link the owner shares, land in `pending`, and the owner approves them into `active`.

1. **Owner generates a share link.** Create an invitation server-side and get its URL without emailing it:
   - `auth.api.createInvitation({ body: { email, role: 'student' | 'instructor', organizationId } })` — invitations are **per-email**, carry a **role**, and have an **`expiresAt`** (default 48h, `invitationExpiresIn`).
   - `getInvitationURL` returns the accept URL without triggering `sendInvitationEmail`, so you can hand it out over WhatsApp/QR/etc. (docs). *Caveat: it is still bound to the email you passed and single-use.* A truly reusable, email-agnostic, multi-use join code is **not** a first-party feature (see §3) — you'd use a community plugin or model the "reusable link" yourself.
2. **Recommended alternative that fits "self-join" better:** skip invitations entirely and use **`addMember`** from your own server route after the person authenticates. `addMember({ userId, role, organizationId })` creates a member **directly, with no invitation**, and — critically — **spreads request/hook custom fields into the row**, so you set `status: 'pending'` at creation:
   ```ts
   // addMember spreads additionalFields from the body, then applies beforeAddMember's returned data
   let memberData = {
     organizationId, userId, role: parseRoles(role),
     createdAt: new Date(),
     ...additionalFields,               // <- your { status: 'pending' } rides in here
   };
   if (response?.data) memberData = { ...memberData, ...response.data }; // beforeAddMember override
   await adapter.createMember(memberData);
   ```
   (source: `routes/crud-members.ts`, `main`.) You can also force `status: 'pending'` centrally in the `beforeAddMember` hook so no caller can bypass it.
3. **Owner approves.** Flip the field: `updateMemberRole` won't touch a custom field, so update `status` via your own mutation (a small server action doing `adapter.updateMember` / a Drizzle update on the `member` row, or a dedicated endpoint). Set `status: 'active'`.
4. **Enforce status everywhere access is decided** (the catch): wrap `hasPermission`, guard `setActive`, and filter `listMembers` by `status = 'active'`. See §2/§5.

---

## Research answers

### Q1 — Custom fields on `member`, and non-active creation without an invitation. YES.

- **Custom fields:** since v1.3, `member` (and `organization`, `invitation`, `team`) accept `additionalFields`:
  ```ts
  organization({
    schema: { member: { additionalFields: {
      status: { type: "string", input: true, required: false }
    } } }
  })
  ```
  Use `inferOrgAdditionalFields` on the client for typing. (docs: Organization plugin; v1.3 blog.)
- **Create a pending member without an accepted invitation:** YES, two ways.
  - `addMember` (server-only API) bypasses invitations entirely and, per source, **spreads body additionalFields into the inserted row and applies `beforeAddMember`'s returned `data`** — so `status: 'pending'` is settable at creation (`routes/crud-members.ts`).
  - Or create the row through your own Drizzle write against the `member` table.
- **Note on the doc-signature vs. source:** the published `addMember`/`inviteMember` type signatures list only `userId/role/organizationId/teamId`, so a quick read of the docs suggests custom fields *aren't* settable. The **source contradicts the doc signature** — `addMember` does spread extra body fields. Safest, version-proof approach: set `status` in the `beforeAddMember` hook rather than relying on body pass-through.

### Q2 — Does anything assume members are active? YES — everything, implicitly. This is the trap.

The plugin has **no `status` column of its own** and **never checks one.** Access is purely *"row exists + role"*:

- **`acceptInvitation`** creates the member with **no status field at all**:
  ```ts
  await adapter.createMember({ organizationId, userId, role: acceptedI.role, createdAt: new Date() });
  ```
  (`routes/crud-invites.ts`). "Active" is implicit = the row's existence.
- **`hasPermission`** is **role-based only** — it resolves the member's role and computes permissions from role statements; **no status gate** (`has-permission.ts` + the permission route).
- **`setActive` / `activeOrganizationId`** verifies **membership existence only**:
  ```ts
  const isMember = await adapter.checkMembership({ userId, organizationId });
  if (!isMember) throw FORBIDDEN(USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION);
  ```
  **No status check** (`routes/crud-org.ts`). A `pending` member can switch into the org and get `activeOrganizationId` set.
- **`listMembers` / `getFullOrganization`** return all member rows; they filter by org, not status.

**Consequence:** a `pending` member that also carries a role (`student`/`instructor`) is, to the plugin, a full member. Your `status` field is decorative until you enforce it. **Mitigation:** either (a) create pending members with **no role** (role assigned only on approval) so `hasPermission` grants nothing meaningful, and/or (b) add a shared server guard that loads the caller's member and rejects `status !== 'active'` before any protected action. Prefer (b), or both — relying on "no role" alone is fragile because `setActive` still succeeds.

### Q3 — Invite-link flow: per-email, role-bearing, expiring, single-use.

- **Per-email, not a shareable pool.** `createInvitation` stores an `email` and `acceptInvitation` enforces `invitation.email === session.user.email` (`crud-invites.ts`). One invite = one intended person.
- **Role per invite:** YES — `role` accepts `string | string[]`, so a single invite grants `student` or `instructor` (or multiple).
- **Expiry:** YES — `expiresAt`, default `60*60*48` (48h), configurable via `invitationExpiresIn`; accept checks `expiresAt < now`.
- **One-active-code / re-invite:** re-inviting an already-accepted member is rejected; `resend: true` / `cancelPendingInvitationsOnReInvite` manage duplicate pending invites. No multi-use counter.
- **Shareable URL:** `getInvitationURL` yields the accept link without sending email — but it's still the same single-use, email-bound token. **A reusable, email-agnostic, N-use "join code"/QR link is not a first-party feature.** Options: community plugin `better-auth-invitation-only` (multi-use codes, configurable max uses) or model your own reusable-link table that, on click, calls `addMember(...status:'pending')`.

### Q4 — Fallback: keep Better Auth for auth + org identity, model membership/role/status in our own Drizzle table.

**Feasible but a net downgrade for matops. Not recommended.**

- **What you keep:** Better Auth auth (sessions, social/email), the `organization` (= academy) entity, and `activeOrganizationId` on the session.
- **What breaks / you re-implement:**
  - **Permission helpers gone.** `hasPermission`, `checkRolePermission`, access-control roles/statements all read the plugin's `member.role`. Off the plugin's `member` table, you own RBAC end-to-end.
  - **Active-org switching breaks.** `setActive` calls `checkMembership` against the plugin's `member` table. Custom membership ⇒ `setActive` says "not a member" ⇒ you also re-implement active-org selection (or keep a shim `member` row purely to satisfy `checkMembership`, which is ugly).
  - **`listMembers`/`getFullOrganization`/invitations** all operate on the plugin's `member`/`invitation` tables — you lose them and rebuild the admin surface.
  - **`inviteMember` / `acceptInvitation`** no longer feed your table; you rebuild invites too.
- **Is it cleaner?** Only if matops needs membership semantics the plugin can't express (e.g. one user with genuinely different capabilities across belts/programs, historical membership records, complex approval state machines). For a straightforward owner/instructor/student + pending/active model, **the custom table costs you every plugin helper and buys almost nothing** the `additionalFields + status guard` approach doesn't already give you.

**Recommendation:** stay on the plugin's `member` table with `status` as an `additionalField`; add the status-enforcement guard. Revisit a custom table only if membership semantics outgrow the plugin.

---

## Known pitfalls to watch (from GitHub issues)

- **`additionalFields` + TypeScript inference regressions.** Issue #5122 — defining org/member `additionalFields` broke type inference so `createOrganization` "does not exist on type InferAPI…". Issue #5234 — "organization's additionalFields doesn't seem to work for me." Net: `additionalFields` on org models has had rough edges across versions. **Pin the Better Auth version, add an integration test** that (1) creates a pending member, (2) asserts the `status` column persists, (3) asserts a pending member is *denied* by your guard, and (4) asserts approval flips to active. Verify against the exact version you install before committing to the design.

## Primary sources

- Organization plugin (members, invitations, hooks, permissions, setActive): https://www.better-auth.com/docs/plugins/organization
- Source (main) — plugin docs mdx: https://github.com/better-auth/better-auth/blob/main/docs/content/docs/plugins/organization.mdx
- Source — `addMember` spreads additionalFields + beforeAddMember: `packages/better-auth/src/plugins/organization/routes/crud-members.ts` (main)
- Source — `acceptInvitation` creates member with no status; per-email/expiry: `packages/better-auth/src/plugins/organization/routes/crud-invites.ts` (main)
- Source — `setActive` uses `checkMembership`, no status: `packages/better-auth/src/plugins/organization/routes/crud-org.ts` (main)
- Source — `hasPermission` is role-based, no status: `packages/better-auth/src/plugins/organization/has-permission.ts` (main)
- v1.3 blog (additionalFields introduced): https://github.com/better-auth/better-auth/blob/main/docs/content/blogs/1-3.mdx
- Issue #5122 (additionalFields break org API/types): https://github.com/better-auth/better-auth/issues/5122
- Issue #5234 (additionalFields not working): https://github.com/better-auth/better-auth/issues/5234
- Community multi-use invite plugin: https://github.com/vcode-sh/better-auth-invitation-only
