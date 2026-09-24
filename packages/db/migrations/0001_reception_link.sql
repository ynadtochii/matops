CREATE TABLE "reception_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "reception_link_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "reception_link" ADD CONSTRAINT "reception_link_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_link" ADD CONSTRAINT "reception_link_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reception_link_one_live_per_branch" ON "reception_link" USING btree ("academy_id") WHERE revoked_at is null;--> statement-breakpoint
CREATE INDEX "reception_link_by_academy" ON "reception_link" USING btree ("academy_id","created_at");--> statement-breakpoint
ALTER TABLE "reception_link" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reception_link_isolation" ON "reception_link" USING (academy_id = current_setting('app.academy_id', true)) WITH CHECK (academy_id = current_setting('app.academy_id', true));--> statement-breakpoint
REVOKE ALL ON "reception_link" FROM matops_debug_ro;--> statement-breakpoint
ALTER TABLE "class_participation" ADD COLUMN "check_in_source" text;--> statement-breakpoint
ALTER TABLE "class_participation" ADD CONSTRAINT "class_participation_check_in_source_supported" CHECK (check_in_source is null or check_in_source in ('reception_self','staff'));
