# 28 — Invite links: a custom shareable table, not Better Auth invitations

Type: build-decision (Phase 1)
Status: resolved
Refines: [20](20-instructor-permissions-and-approval-gate.md), [14](14-better-auth-approval-feasibility.md)

## Question

Slice 1.2 needs **shareable, per-role, rotatable** invite links (spec O4: "one
active link per role"). Better Auth's Organization plugin already has an
`invitation` table and a `createInvitation` API. Do we use it, or model our own?

## Answer

**Model our own `academy_invite` table.** Better Auth invitations are the wrong
shape for our flow:

- They are **email-bound and single-use** — `acceptInvitation` consumes one
  invitation for one email and makes that member **active immediately**. That
  bypasses our **uniform pending gate** ([20](20-instructor-permissions-and-approval-gate.md)):
  a forwarded instructor link would hand out active staff access.
- The spec wants a **link you share** (in a WhatsApp group, on a poster), not an
  email you send to a known address — one live link per role, rotatable.

`academy_invite(id, academy_id, role, token, created_by, created_at, revoked_at)`:

- **No RLS on the table.** The join screen resolves a token with **no session and
  no active academy**, so `invite.resolve` is a `publicProcedure` on the base
  connection — it cannot run inside the tenant transaction. Owner-side reads
  (`invite.list`) filter by `academy_id` explicitly. This mirrors the Better Auth
  tables, which also carry no academy RLS policy ([12](12-tenant-isolation-mechanism.md)).
  The table holds no tenant secret — only an academy id, a role, and an opaque
  token.
- **One live link per role** is enforced by a partial unique index
  `UNIQUE(academy_id, role) WHERE revoked_at IS NULL`. **Rotate** = revoke the
  live row + insert a new one in one transaction; the old token stops resolving.
- The token is a server-generated URL-safe random string, never client-supplied.
- Roles are limited to **student | instructor** (`isInvitableRole`, pure) — never
  `owner`; a co-owner is **promoted** from the roster, not invited.

The Better Auth `invitation` table stays in the schema (the plugin owns it) but is
unused in v1. **Refines** ticket 20's "invite links, per-role" into the concrete
mechanism.
