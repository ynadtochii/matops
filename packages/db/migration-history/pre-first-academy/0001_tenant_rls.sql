-- Custom SQL migration file, put your code below! --

-- Tenant isolation via Postgres RLS. See docs/issues/12-tenant-isolation-mechanism.md
-- and docs/architecture.md §5.
--
-- Model: the app opens a transaction per request, drops to a restricted role and
-- sets app.academy_id (both transaction-local), and Postgres filters every row.
-- academy_id is TEXT (the Better Auth organization id) — never cast to uuid.

-- 1) Restricted role the request transaction runs as (SET LOCAL ROLE). NOLOGIN:
--    reached via SET ROLE from the connection role, never a direct login. It is
--    NOT a table owner and has no BYPASSRLS, so RLS actually applies to it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'matops_app') THEN
    CREATE ROLE matops_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint

-- 2) Privileges. RLS decides which ROWS are visible; GRANTs decide which TABLES
--    the role may touch at all. Grant DML on existing + future tables so new
--    tenant tables are covered without editing this migration each time.
GRANT USAGE ON SCHEMA public TO matops_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO matops_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO matops_app;
--> statement-breakpoint

-- 3) tenant_probe — the canonical example + permanent regression net for the RLS
--    seam. It carries no product data; the leak test (packages/db/test/rls.test.ts)
--    asserts isolation against it. Every real tenant table (scheduling, Phase 2)
--    follows this exact ENABLE RLS + policy pattern.
CREATE TABLE IF NOT EXISTS "tenant_probe" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "academy_id" text NOT NULL,
  "payload" text NOT NULL
);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_probe" TO matops_app;
--> statement-breakpoint
ALTER TABLE "tenant_probe" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Policy: a row is visible/writable only when its academy_id equals the
-- transaction's app.academy_id. `current_setting(..., true)` = missing_ok, so an
-- unset GUC yields NULL -> the comparison is false -> the query FAILS CLOSED
-- (no rows leak) instead of erroring.
CREATE POLICY "tenant_probe_isolation" ON "tenant_probe"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));
