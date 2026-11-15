ALTER TABLE "access_assignment" DROP CONSTRAINT "access_assignment_start_is_a_month";--> statement-breakpoint
ALTER TABLE "access_assignment" DROP CONSTRAINT "access_assignment_starts_on_in_month";--> statement-breakpoint
ALTER TABLE "access_assignment" DROP CONSTRAINT "access_assignment_end_is_a_month";--> statement-breakpoint
ALTER TABLE "access_assignment_change" DROP CONSTRAINT "access_assignment_change_is_a_month";--> statement-breakpoint
ALTER TABLE "membership_month" DROP CONSTRAINT "membership_month_is_a_month";--> statement-breakpoint
ALTER TABLE "membership_purchase" DROP CONSTRAINT "membership_purchase_is_a_month";--> statement-breakpoint
ALTER TABLE "access_assignment" ADD COLUMN "period_anchor" date;--> statement-breakpoint
ALTER TABLE "access_assignment" ADD COLUMN "period_anchor_from" date;--> statement-breakpoint
ALTER TABLE "access_assignment" ADD CONSTRAINT "access_assignment_anchor_complete" CHECK ((period_anchor is null) = (period_anchor_from is null));--> statement-breakpoint
ALTER TABLE "access_assignment" ADD CONSTRAINT "access_assignment_anchor_ordered" CHECK (period_anchor is null or (period_anchor_from >= start_month and period_anchor > period_anchor_from));