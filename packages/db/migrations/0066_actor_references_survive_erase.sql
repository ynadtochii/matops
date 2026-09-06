-- Erasing a person must not be blocked by other people's records (ADR 129).
--
-- Every actor column here says WHO did something to somebody else's row: who
-- assigned a membership, who ticked a month, who scheduled a plan change. They
-- are all nullable already, but they were created with ON DELETE NO ACTION, so
-- purging a former manager fails on the final `DELETE FROM "user"` after the
-- earlier steps have committed. `SET NULL` forgets who did it and keeps the
-- record of what was done, which is the same choice the referral history makes.
ALTER TABLE "access_assignment" DROP CONSTRAINT "access_assignment_assigned_by_user_id_fk";--> statement-breakpoint
ALTER TABLE "access_assignment" ADD CONSTRAINT "access_assignment_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "access_assignment_change" DROP CONSTRAINT "access_assignment_change_scheduled_by_user_id_fk";--> statement-breakpoint
ALTER TABLE "access_assignment_change" ADD CONSTRAINT "access_assignment_change_scheduled_by_user_id_fk" FOREIGN KEY ("scheduled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "access_assignment_change" DROP CONSTRAINT "access_assignment_change_cancelled_by_user_id_fk";--> statement-breakpoint
ALTER TABLE "access_assignment_change" ADD CONSTRAINT "access_assignment_change_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "access_plan_price" DROP CONSTRAINT "access_plan_price_recorded_by_user_id_fk";--> statement-breakpoint
ALTER TABLE "access_plan_price" ADD CONSTRAINT "access_plan_price_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "membership_month" DROP CONSTRAINT "membership_month_recorded_by_user_id_fk";--> statement-breakpoint
ALTER TABLE "membership_month" ADD CONSTRAINT "membership_month_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "membership_month_audit" DROP CONSTRAINT "membership_month_audit_actor_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "membership_month_audit" ADD CONSTRAINT "membership_month_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
