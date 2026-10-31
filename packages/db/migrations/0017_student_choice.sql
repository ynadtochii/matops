ALTER TABLE "access_plan" ADD COLUMN "staff_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_month" ADD COLUMN "payment_method_id" uuid;--> statement-breakpoint
ALTER TABLE "membership_month" ADD COLUMN "cash_paid_to" text;--> statement-breakpoint
ALTER TABLE "membership_month" ADD COLUMN "cash_paid_to_name" text;--> statement-breakpoint
ALTER TABLE "membership_month" ADD COLUMN "payment_note" text;--> statement-breakpoint
ALTER TABLE "membership_month" ADD CONSTRAINT "membership_month_payment_method_id_payment_method_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_method"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_month" ADD CONSTRAINT "membership_month_cash_paid_to_user_id_fk" FOREIGN KEY ("cash_paid_to") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;