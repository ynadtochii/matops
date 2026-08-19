-- Custom SQL migration file, put your code below! --

-- Narrow the restricted RLS role's reach over the Better Auth tables (ADR 60).
-- 0001 granted DML on ALL tables so new TENANT tables would be covered without
-- editing it. That also handed matops_app full write access to the identity
-- tables, none of which carry an RLS policy — so a future SQL-injection bug in a
-- request handler would become account takeover rather than a scoped data leak.
--
-- Request handlers only ever READ identity: the routers left-join `user` for a
-- display name on the RLS-scoped transaction. Every identity WRITE goes through
-- the base connection (the table owner) in `packages/db/src/membership.ts`,
-- `invite.ts` and the Better Auth server API, never through matops_app.
REVOKE INSERT, UPDATE, DELETE ON "user", "organization", "member"
  FROM matops_app;
--> statement-breakpoint

-- Credential + token tables. Nothing under the tenant seam reads these, and a
-- leaked session row is a live session. No access at all.
REVOKE ALL ON "session", "account", "verification", "invitation", "academy_invite"
  FROM matops_app;
