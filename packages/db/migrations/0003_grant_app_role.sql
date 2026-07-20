-- Custom SQL migration file, put your code below! --

-- Let the runtime connection role `SET LOCAL ROLE matops_app` (the tenant seam,
-- packages/db/src/tenant.ts). On a managed Postgres like Neon the connection role
-- (e.g. neondb_owner) is NOT a superuser, so it can only `SET ROLE` to a role it
-- is a MEMBER of. The migration runner created matops_app and therefore has admin
-- on it, so it can grant membership to itself here.
--
-- (A superuser could SET ROLE without this — which is why the PGlite leak test,
-- running as the bootstrap superuser, did not need it. See docs/issues/12.)
GRANT matops_app TO current_user;
