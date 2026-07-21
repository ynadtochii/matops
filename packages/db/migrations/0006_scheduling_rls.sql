-- Custom SQL migration file, put your code below! --

-- Tenant isolation for the scheduling domain (Phase 2). Every scheduling table
-- follows the exact ENABLE RLS + policy pattern proven on `tenant_probe` in
-- migration 0001 (see docs/architecture.md §5, docs/issues/12).
--
-- DML grants: matops_app already receives SELECT/INSERT/UPDATE/DELETE on new
-- tables via the ALTER DEFAULT PRIVILEGES in 0001. We re-grant explicitly per
-- table (as 0001 did for tenant_probe) so the seam is self-evident and never
-- depends on default-privilege ordering.

-- class_template (slice 2.1). `class` + its policy arrive in a later migration
-- alongside the materialization slice (2.2).
GRANT SELECT, INSERT, UPDATE, DELETE ON "class_template" TO matops_app;
--> statement-breakpoint
ALTER TABLE "class_template" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- A row is visible/writable only when its academy_id equals the transaction's
-- app.academy_id GUC. current_setting(..., true) = missing_ok → an unset GUC
-- yields NULL → the comparison is false → the query FAILS CLOSED (no leak).
CREATE POLICY "class_template_isolation" ON "class_template"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));