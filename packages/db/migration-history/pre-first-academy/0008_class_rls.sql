-- Custom SQL migration file, put your code below! --

-- Tenant isolation for the concrete `class` table (slice 2.2). Same ENABLE RLS +
-- academy policy as class_template (0006) / tenant_probe (0001). See §5, issue 12.
--
-- Note: the daily materialization cron writes classes CROSS-academy under the
-- trusted base connection role (the table owner), which bypasses RLS by design
-- (docs/issues/16). We deliberately do NOT force RLS on the owner — request
-- handlers use the matops_app role, for which this policy applies.
GRANT SELECT, INSERT, UPDATE, DELETE ON "class" TO matops_app;
--> statement-breakpoint
ALTER TABLE "class" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "class_isolation" ON "class"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));