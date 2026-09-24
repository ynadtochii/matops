ALTER TABLE "reception_link" DROP CONSTRAINT "reception_link_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "reception_link" ADD CONSTRAINT "reception_link_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;