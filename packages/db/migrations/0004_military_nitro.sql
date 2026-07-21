CREATE TABLE "academy_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"role" text NOT NULL,
	"token" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "academy_invite_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "invited_role" text;--> statement-breakpoint
ALTER TABLE "academy_invite" ADD CONSTRAINT "academy_invite_academy_id_organization_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academy_invite_one_active_per_role" ON "academy_invite" USING btree ("academy_id","role") WHERE "academy_invite"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");