DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'matops_debug_ro') THEN
    CREATE ROLE matops_debug_ro NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO matops_debug_ro;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA public TO matops_debug_ro;
--> statement-breakpoint

REVOKE ALL ON "session", "account", "verification", "invitation", "academy_invite", "push_token"
  FROM matops_debug_ro;
--> statement-breakpoint

REVOKE SELECT ON "academy_profile" FROM matops_debug_ro;
--> statement-breakpoint
GRANT SELECT (
  "entity_id",
  "curriculum_for_students",
  "public_booking_enabled",
  "public_api_origins",
  "created_at",
  "updated_at"
) ON "academy_profile" TO matops_debug_ro;
--> statement-breakpoint

REVOKE SELECT ON "drop_in_visit" FROM matops_debug_ro;
--> statement-breakpoint
GRANT SELECT (
  "id",
  "academy_id",
  "drop_in_id",
  "class_id",
  "booking_status",
  "attendance_status",
  "booked_at",
  "cancelled_at",
  "attended_at",
  "marked_by",
  "created_at",
  "updated_at"
) ON "drop_in_visit" TO matops_debug_ro;
--> statement-breakpoint

REVOKE SELECT ON "payment_claim" FROM matops_debug_ro;
--> statement-breakpoint
GRANT SELECT (
  "id",
  "academy_id",
  "member_id",
  "plan_id",
  "amount_minor",
  "currency",
  "period",
  "status",
  "claimed_at",
  "confirmed_by",
  "confirmed_at",
  "created_at",
  "updated_at"
) ON "payment_claim" TO matops_debug_ro;
