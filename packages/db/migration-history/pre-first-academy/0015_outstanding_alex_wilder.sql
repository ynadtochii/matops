CREATE TYPE "public"."payment_claim_status" AS ENUM('pending', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."payment_cycle" AS ENUM('monthly');--> statement-breakpoint
CREATE TABLE "member_dues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"member_id" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"next_due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"name" text NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"cycle" "payment_cycle" DEFAULT 'monthly' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_claim" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"member_id" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"period" text NOT NULL,
	"status" "payment_claim_status" DEFAULT 'pending' NOT NULL,
	"proof_url" text,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_settings" (
	"academy_id" text PRIMARY KEY NOT NULL,
	"bank_details" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_dues" ADD CONSTRAINT "member_dues_plan_id_membership_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_claim" ADD CONSTRAINT "payment_claim_plan_id_membership_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "md_uniq_academy_member" ON "member_dues" USING btree ("academy_id","member_id");--> statement-breakpoint
CREATE INDEX "mp_by_academy" ON "membership_plan" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "pc_by_academy_member" ON "payment_claim" USING btree ("academy_id","member_id");--> statement-breakpoint
CREATE INDEX "pc_by_academy_status" ON "payment_claim" USING btree ("academy_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "pc_uniq_open_claim" ON "payment_claim" USING btree ("academy_id","member_id","period") WHERE status = 'pending';--> statement-breakpoint

-- Tenant isolation for the manual-transfer payments tables (slice P.1,
-- docs/issues/40). Same policy as the other domain tables (0013/0011/0008): the
-- matops_app request role only ever sees its own academy's rows. Reads that must
-- join Better Auth's `member` table (roster dues status, P.2) run on the trusted
-- base connection with an explicit academy pin, like `membership.ts`/`dropin.ts`
-- — an enumerated tenant-seam exception (docs/issues/12).
GRANT SELECT, INSERT, UPDATE, DELETE ON "membership_plan" TO matops_app;--> statement-breakpoint
ALTER TABLE "membership_plan" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "membership_plan_isolation" ON "membership_plan"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "member_dues" TO matops_app;--> statement-breakpoint
ALTER TABLE "member_dues" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "member_dues_isolation" ON "member_dues"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "payment_claim" TO matops_app;--> statement-breakpoint
ALTER TABLE "payment_claim" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "payment_claim_isolation" ON "payment_claim"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "payment_settings" TO matops_app;--> statement-breakpoint
ALTER TABLE "payment_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "payment_settings_isolation" ON "payment_settings"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));