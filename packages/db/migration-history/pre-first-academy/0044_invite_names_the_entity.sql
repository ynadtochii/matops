ALTER TABLE "academy_invite" DROP CONSTRAINT "academy_invite_academy_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "academy_invite" ADD CONSTRAINT "academy_invite_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;