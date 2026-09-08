-- Isolation for the organization/entity foundation (ADR 124 §3, §4).
--
-- `entity` and `entity_membership` are ORGANIZATION-shared: they match on
-- `app.organization_id` only, so the overview can enumerate an organization's
-- entities in an organization transaction and an entity transaction can still
-- join to them. Neither holds product data.
--
-- `academy_profile` is ENTITY-scoped and stays exact, matching the entity id in
-- `app.academy_id` the same way every BJJ table does.
ALTER TABLE "entity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "entity_isolation" ON "entity"
  USING ("organization_id" = current_setting('app.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
ALTER TABLE "entity_membership" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "entity_membership_isolation" ON "entity_membership"
  USING ("organization_id" = current_setting('app.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
ALTER TABLE "academy_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "academy_profile_isolation" ON "academy_profile"
  USING ("entity_id" = current_setting('app.academy_id', true))
  WITH CHECK ("entity_id" = current_setting('app.academy_id', true));
