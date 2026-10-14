CREATE TABLE "desk_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"token" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "desk_link_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "desk_link" ADD CONSTRAINT "desk_link_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "desk_link_one_live" ON "desk_link" USING btree ("academy_id") WHERE "desk_link"."revoked_at" is null;--> statement-breakpoint
REVOKE ALL ON "desk_link" FROM matops_app;