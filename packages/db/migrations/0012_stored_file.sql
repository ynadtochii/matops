CREATE TABLE "stored_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"uploaded_by" text,
	"kind" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stored_file_objectKey_unique" UNIQUE("object_key"),
	CONSTRAINT "stored_file_kind_supported" CHECK (kind in ('avatar','academy_icon','payment_receipt')),
	CONSTRAINT "stored_file_status_supported" CHECK (status in ('pending','ready')),
	CONSTRAINT "stored_file_size_positive" CHECK (size_bytes > 0)
);
--> statement-breakpoint
ALTER TABLE "membership_month" ADD COLUMN "proof_file_id" uuid;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "icon_file_id" uuid;--> statement-breakpoint
ALTER TABLE "entity_membership" ADD COLUMN "avatar_file_id" uuid;--> statement-breakpoint
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stored_file_by_academy" ON "stored_file" USING btree ("academy_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "stored_file_by_uploader" ON "stored_file" USING btree ("academy_id","uploaded_by","status");--> statement-breakpoint
ALTER TABLE "membership_month" ADD CONSTRAINT "membership_month_proof_file_id_stored_file_id_fk" FOREIGN KEY ("proof_file_id") REFERENCES "public"."stored_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity" ADD CONSTRAINT "entity_icon_file_id_stored_file_id_fk" FOREIGN KEY ("icon_file_id") REFERENCES "public"."stored_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_membership" ADD CONSTRAINT "entity_membership_avatar_file_id_stored_file_id_fk" FOREIGN KEY ("avatar_file_id") REFERENCES "public"."stored_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "stored_file" TO matops_app;--> statement-breakpoint
ALTER TABLE "stored_file" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "stored_file_isolation" ON "stored_file" USING ("academy_id" = current_setting('app.academy_id', true)) WITH CHECK ("academy_id" = current_setting('app.academy_id', true));
