DROP INDEX "membership_purchase_one_unresolved";--> statement-breakpoint
DROP INDEX "membership_purchase_one_unresolved_person";--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "curriculum_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "referrals_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_purchase_one_unresolved" ON "membership_purchase" USING btree ("organization_id","user_id") WHERE status in ('pending','claimed','rejected','resolution') and version not like 'legacy-dues-v1:%';--> statement-breakpoint
CREATE UNIQUE INDEX "membership_purchase_one_unresolved_person" ON "membership_purchase" USING btree ("organization_id","person_id") WHERE person_id is not null and status in ('pending','claimed','rejected','resolution') and version not like 'legacy-dues-v1:%';--> statement-breakpoint
ALTER TABLE "access_assignment" ADD CONSTRAINT "access_assignment_has_subject" CHECK (user_id is not null or person_id is not null);--> statement-breakpoint
ALTER TABLE "access_assignment_change" ADD CONSTRAINT "access_assignment_change_has_subject" CHECK (user_id is not null or person_id is not null);--> statement-breakpoint
ALTER TABLE "membership_purchase" ADD CONSTRAINT "membership_purchase_has_subject" CHECK (user_id is not null or person_id is not null);--> statement-breakpoint
ALTER TABLE "entity_membership" ADD CONSTRAINT "entity_membership_has_subject" CHECK (user_id is not null or person_id is not null);--> statement-breakpoint
ALTER TABLE "class_participation" ADD CONSTRAINT "class_participation_has_subject" CHECK (student_id is not null or person_id is not null);
