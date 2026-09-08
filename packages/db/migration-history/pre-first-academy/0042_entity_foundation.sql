CREATE TABLE "entity" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"time_zone" text,
	"country" text,
	"address" text,
	"map_url" text,
	"public_code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "entity_publicCode_unique" UNIQUE("public_code"),
	CONSTRAINT "entity_type_supported" CHECK (type in ('bjj_academy'))
);
--> statement-breakpoint
CREATE TABLE "academy_profile" (
	"entity_id" text PRIMARY KEY NOT NULL,
	"curriculum_for_students" boolean DEFAULT false NOT NULL,
	"public_booking_enabled" boolean DEFAULT false NOT NULL,
	"public_api_key" text,
	"public_api_origins" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_profile_publicApiKey_unique" UNIQUE("public_api_key")
);
--> statement-breakpoint
CREATE TABLE "entity_membership" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_role" text,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "entity_org_id" ON "entity" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_org_slug" ON "entity" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_one_default_per_org" ON "entity" USING btree ("organization_id") WHERE is_default and deleted_at is null;--> statement-breakpoint
CREATE INDEX "entity_by_org" ON "entity" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_membership_one_per_user" ON "entity_membership" USING btree ("entity_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_membership_entity_id" ON "entity_membership" USING btree ("entity_id","id");--> statement-breakpoint
CREATE INDEX "entity_membership_by_user" ON "entity_membership" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "entity_membership_by_entity_status" ON "entity_membership" USING btree ("entity_id","status");--> statement-breakpoint
ALTER TABLE "entity" ADD CONSTRAINT "entity_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_profile" ADD CONSTRAINT "academy_profile_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_membership" ADD CONSTRAINT "entity_membership_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_membership" ADD CONSTRAINT "entity_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_membership" ADD CONSTRAINT "entity_membership_entity_same_org" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entity"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DROP INDEX "member_by_org_user";--> statement-breakpoint
CREATE UNIQUE INDEX "member_by_org_user" ON "member" USING btree ("organization_id","user_id");
