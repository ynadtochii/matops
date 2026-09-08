CREATE TABLE "drop_in" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"class_id" uuid,
	"consent" boolean NOT NULL,
	"visit_count" integer DEFAULT 1 NOT NULL,
	"first_visit_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_visit_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drop_in" ADD CONSTRAINT "drop_in_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "di_uniq_academy_phone" ON "drop_in" USING btree ("academy_id","phone");--> statement-breakpoint
CREATE INDEX "di_by_academy_class" ON "drop_in" USING btree ("academy_id","class_id");--> statement-breakpoint

-- Tenant isolation for OWNER reads of `drop_in` (slice 3.5). Same policy as the
-- other domain tables (0011/0008): the matops_app request role only sees its own
-- academy's leads. The PUBLIC drop-in submit writes on the trusted base
-- connection (table owner, bypasses RLS by design — we never FORCE it), an
-- enumerated exception to the tenant seam (docs/issues/12, 25).
GRANT SELECT, INSERT, UPDATE, DELETE ON "drop_in" TO matops_app;--> statement-breakpoint
ALTER TABLE "drop_in" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "drop_in_isolation" ON "drop_in"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));