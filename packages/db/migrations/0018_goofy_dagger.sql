CREATE TYPE "public"."referral_action" AS ENUM('assigned', 'corrected', 'cleared');--> statement-breakpoint
CREATE TABLE "member_referral" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"student_member_id" text NOT NULL,
	"referrer_member_id" text,
	"assigned_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mref_no_self_referral" CHECK ("member_referral"."referrer_member_id" IS NULL OR "member_referral"."student_member_id" <> "member_referral"."referrer_member_id")
);
--> statement-breakpoint
CREATE TABLE "member_referral_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"student_member_id" text NOT NULL,
	"old_referrer_member_id" text,
	"new_referrer_member_id" text,
	"action" "referral_action" NOT NULL,
	"actor_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mref_audit_no_self_referral" CHECK ("member_referral_audit"."new_referrer_member_id" IS NULL OR "member_referral_audit"."student_member_id" <> "member_referral_audit"."new_referrer_member_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mref_uniq_academy_student" ON "member_referral" USING btree ("academy_id","student_member_id");--> statement-breakpoint
CREATE INDEX "mref_by_academy_referrer" ON "member_referral" USING btree ("academy_id","referrer_member_id");--> statement-breakpoint
CREATE INDEX "mref_audit_by_academy_student" ON "member_referral_audit" USING btree ("academy_id","student_member_id","occurred_at");--> statement-breakpoint

-- Internal referral tracking (O9, ADR 52). Both current attribution and its
-- append-only audit history are academy-scoped through the standard request
-- role + tenant GUC seam.
GRANT SELECT, INSERT, UPDATE, DELETE ON "member_referral" TO matops_app;--> statement-breakpoint
ALTER TABLE "member_referral" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "member_referral_isolation" ON "member_referral"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));--> statement-breakpoint

GRANT SELECT, INSERT ON "member_referral_audit" TO matops_app;--> statement-breakpoint
ALTER TABLE "member_referral_audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "member_referral_audit_isolation" ON "member_referral_audit"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));
