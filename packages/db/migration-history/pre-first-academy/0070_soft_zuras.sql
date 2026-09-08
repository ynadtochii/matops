CREATE TABLE "attendance_correction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"class_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject_id" text,
	"before_value" text,
	"after_value" text,
	"reason" text NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_correction_kind_supported" CHECK (kind in ('member','visitor','review')),
	CONSTRAINT "attendance_correction_reason_bounded" CHECK (char_length(reason) between 3 and 500)
);
--> statement-breakpoint
ALTER TABLE "access_assignment" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "access_assignment_change" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_purchase" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "class_participation" ALTER COLUMN "student_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_correction" ADD CONSTRAINT "attendance_correction_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_correction" ADD CONSTRAINT "attendance_correction_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_correction" ADD CONSTRAINT "attendance_correction_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_correction_by_class" ON "attendance_correction" USING btree ("academy_id","class_id","created_at");--> statement-breakpoint
ALTER TABLE "attendance_correction" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "attendance_correction_isolation" ON "attendance_correction"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "attendance_correction" TO matops_app;
