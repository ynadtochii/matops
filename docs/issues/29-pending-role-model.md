# 29 — Pending members hold no academy role (the `invitedRole` field)

Type: build-decision (Phase 1)
Status: resolved
Refines: [14](14-better-auth-approval-feasibility.md), [20](20-instructor-permissions-and-approval-gate.md)

## Question

ADR [14](14-better-auth-approval-feasibility.md) settled that the real academy
role is granted **only at approval** — a pending member must hold no role, so it
passes no access check even if a status guard is missed. But Better Auth's
`member.role` is `NOT NULL` and the *intended* role (student vs instructor) must
be remembered from the invite so approval can grant the right one. Where does the
intended role live while pending?

## Answer

**Add a server-controlled `invitedRole` field to the `member` row; keep `role` at
the harmless Better Auth default (`member`) until approval.**

- On self-join, `createPendingMembership` inserts the row with
  `status = "pending"`, `role = "member"`, and `invitedRole = <the invite's role>`.
  `"member"` is **not** one of our academy roles (`owner` / `instructor` /
  `student`), so `isStaff` / `isOwner` and every role check return false — the
  pending member holds no privilege even if a `status` guard is ever missed. This
  is the by-construction property ADR 14 asked for.
- **Approval** (`approveMembership`, pure) writes `role := invitedRole`,
  `status := "active"`. A missing `invitedRole` falls back to `student`.
- `invitedRole` is `input: false` on the Better Auth `additionalFields` — clients
  cannot set it; the server assigns it from the resolved invite ([28](28-invite-link-model.md)).
- **Client-is-the-lens** ([18](18-multi-academy-ux.md)) uses it too:
  `isWebLensMembership` counts a *pending instructor* (role `member`,
  `invitedRole = instructor`) into the web lens, so a coach waiting for approval
  sees the academy on the web while still holding no tools.

Also: the academy creator is the exception — the `afterCreateOrganization` hook
sets that owner membership `active` at once (seamless onboarding, [20](20-instructor-permissions-and-approval-gate.md)),
so onboarding never routes through the pending path.

**Refines** ticket 14's "grant the role only at approval" into the concrete
column + transition.
