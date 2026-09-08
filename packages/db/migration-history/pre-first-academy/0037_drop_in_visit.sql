CREATE TABLE "drop_in_visit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"drop_in_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"booking_status" "booking_status" DEFAULT 'none' NOT NULL,
	"attendance_status" "attendance_status" DEFAULT 'unmarked' NOT NULL,
	"cancel_token" text,
	"booked_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"attended_at" timestamp with time zone,
	"marked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drop_in_visit" ADD CONSTRAINT "drop_in_visit_drop_in_id_drop_in_id_fk" FOREIGN KEY ("drop_in_id") REFERENCES "public"."drop_in"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_in_visit" ADD CONSTRAINT "drop_in_visit_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dv_uniq_lead_class" ON "drop_in_visit" USING btree ("drop_in_id","class_id");--> statement-breakpoint
CREATE INDEX "dv_by_academy_class" ON "drop_in_visit" USING btree ("academy_id","class_id");--> statement-breakpoint
CREATE INDEX "dv_by_lead" ON "drop_in_visit" USING btree ("drop_in_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dv_uniq_cancel_token" ON "drop_in_visit" USING btree ("cancel_token");--> statement-breakpoint

-- Backfill: every lead that still points at a class becomes one visit on that
-- class. Today a drop-in is present by construction (no attendance axis
-- existed), so the row is recorded as a walk-in that turned up.
INSERT INTO "drop_in_visit"
  ("academy_id", "drop_in_id", "class_id", "booking_status", "attendance_status", "attended_at", "created_at")
SELECT d."academy_id", d."id", d."class_id", 'none', 'present', d."last_visit_at", d."last_visit_at"
FROM "drop_in" d
WHERE d."class_id" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "drop_in" DROP CONSTRAINT "drop_in_class_id_class_id_fk";--> statement-breakpoint
DROP INDEX "di_by_academy_class";--> statement-breakpoint
ALTER TABLE "drop_in" DROP COLUMN "class_id";--> statement-breakpoint
ALTER TABLE "drop_in" DROP COLUMN "visit_count";--> statement-breakpoint

-- Tenant isolation for `drop_in_visit`, the same policy every domain table
-- carries (0013 for `drop_in`). The PUBLIC booking endpoints write on the
-- trusted base connection, an enumerated tenant-seam exception with the
-- drop-in submit as its precedent (docs/issues/12, 25, 115).
GRANT SELECT, INSERT, UPDATE, DELETE ON "drop_in_visit" TO matops_app;--> statement-breakpoint
ALTER TABLE "drop_in_visit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "drop_in_visit_isolation" ON "drop_in_visit"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));
