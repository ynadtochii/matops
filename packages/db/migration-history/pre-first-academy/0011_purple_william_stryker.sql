CREATE TYPE "public"."booking_status" AS ENUM('booked', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."booking_tier" AS ENUM('confirmed', 'provisional');--> statement-breakpoint
CREATE TABLE "class_participation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"class_id" uuid NOT NULL,
	"student_id" text NOT NULL,
	"booking_status" "booking_status" DEFAULT 'booked' NOT NULL,
	"booking_tier" "booking_tier" NOT NULL,
	"booked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_participation" ADD CONSTRAINT "class_participation_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cp_uniq_class_student" ON "class_participation" USING btree ("class_id","student_id");--> statement-breakpoint
CREATE INDEX "cp_by_academy_class" ON "class_participation" USING btree ("academy_id","class_id");--> statement-breakpoint
CREATE INDEX "cp_by_academy_student" ON "class_participation" USING btree ("academy_id","student_id");--> statement-breakpoint

-- Tenant isolation for `class_participation` (slice 3.1). Same ENABLE RLS +
-- academy policy as class (0008) / class_template (0006) / tenant_probe (0001).
-- Request handlers use the matops_app role; the policy scopes every row to the
-- caller's active academy (docs/issues/12). Booking runs on the RLS tx, so a
-- student can only ever book/cancel within their own academy.
GRANT SELECT, INSERT, UPDATE, DELETE ON "class_participation" TO matops_app;--> statement-breakpoint
ALTER TABLE "class_participation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "class_participation_isolation" ON "class_participation"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));