CREATE TABLE "drop_in_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"token" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "drop_in_link_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drop_in" ADD COLUMN "belt" text;--> statement-breakpoint
ALTER TABLE "drop_in" ADD COLUMN "stripes" integer;--> statement-breakpoint
ALTER TABLE "drop_in" ADD COLUMN "health" text;--> statement-breakpoint
ALTER TABLE "drop_in" ADD COLUMN "email_updates_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drop_in" ADD COLUMN "waiver_id" uuid;--> statement-breakpoint
ALTER TABLE "drop_in" ADD COLUMN "waiver_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drop_in_link" ADD CONSTRAINT "drop_in_link_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drop_in_link_one_live" ON "drop_in_link" USING btree ("academy_id") WHERE "drop_in_link"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "rate_limit_by_reset" ON "rate_limit" USING btree ("reset_at");--> statement-breakpoint
ALTER TABLE "drop_in" ADD CONSTRAINT "drop_in_waiver" FOREIGN KEY ("academy_id","waiver_id") REFERENCES "public"."academy_waiver"("academy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_in" ADD CONSTRAINT "di_health_len" CHECK (char_length("drop_in"."health") <= 1000);--> statement-breakpoint
ALTER TABLE "drop_in" ADD CONSTRAINT "di_stripes_range" CHECK ("drop_in"."stripes" between 0 and 20);--> statement-breakpoint
REVOKE ALL ON "drop_in_link", "rate_limit" FROM matops_app;