ALTER TABLE "access_assignment" DROP CONSTRAINT "access_assignment_start_is_a_month";--> statement-breakpoint
ALTER TABLE "access_assignment" DROP CONSTRAINT "access_assignment_starts_on_in_month";--> statement-breakpoint
ALTER TABLE "access_assignment" DROP CONSTRAINT "access_assignment_end_is_a_month";--> statement-breakpoint
ALTER TABLE "access_assignment_change" DROP CONSTRAINT "access_assignment_change_is_a_month";--> statement-breakpoint
ALTER TABLE "membership_month" DROP CONSTRAINT "membership_month_is_a_month";--> statement-breakpoint
ALTER TABLE "membership_purchase" DROP CONSTRAINT "membership_purchase_is_a_month";