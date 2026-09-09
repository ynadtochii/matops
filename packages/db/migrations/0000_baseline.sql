CREATE TYPE "public"."referral_action" AS ENUM('assigned', 'corrected', 'cleared');;--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('unmarked', 'present', 'absent');;--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('booked', 'cancelled', 'none');;--> statement-breakpoint
CREATE TYPE "public"."booking_tier" AS ENUM('confirmed', 'provisional');;--> statement-breakpoint
CREATE TYPE "public"."class_status" AS ENUM('scheduled', 'cancelled');;--> statement-breakpoint
CREATE TYPE "public"."discipline" AS ENUM('bjj', 'nogi', 'judo', 'mma', 'other');;--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('link', 'web', 'wall_qr', 'staff', 'api');;--> statement-breakpoint
CREATE TYPE "public"."lead_stage" AS ENUM('new', 'contacted', 'invited', 'joined', 'ghosted');;--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('active', 'paused');;--> statement-breakpoint
CREATE TABLE "_health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note" text DEFAULT 'ok' NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);;--> statement-breakpoint
CREATE TABLE "access_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"person_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"assigning_entity_id" text,
	"start_month" date NOT NULL,
	"starts_on" date NOT NULL,
	"end_month" date,
	"status" text DEFAULT 'active' NOT NULL,
	"assigned_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_assignment_status_supported" CHECK (status in ('active','suspended','cancelled')),
	CONSTRAINT "access_assignment_start_is_a_month" CHECK (date_trunc('month', start_month) = start_month),
	CONSTRAINT "access_assignment_starts_on_in_month" CHECK (date_trunc('month', starts_on) = start_month),
	CONSTRAINT "access_assignment_end_is_a_month" CHECK (end_month is null or date_trunc('month', end_month) = end_month),
	CONSTRAINT "access_assignment_period_ordered" CHECK (end_month is null or end_month > start_month)
);;--> statement-breakpoint
CREATE TABLE "access_assignment_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"person_id" uuid NOT NULL,
	"source_assignment_id" uuid NOT NULL,
	"target_assignment_id" uuid NOT NULL,
	"effective_month" date NOT NULL,
	"previous_source_end_month" date,
	"scheduled_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_by" text,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "access_assignment_change_is_a_month" CHECK (date_trunc('month', effective_month) = effective_month),
	CONSTRAINT "access_assignment_change_two_rows" CHECK (source_assignment_id <> target_assignment_id)
);;--> statement-breakpoint
CREATE TABLE "access_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_minor" integer,
	"currency" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_plan_price_complete" CHECK ((price_minor is null) = (currency is null)),
	CONSTRAINT "access_plan_price_sane" CHECK (price_minor is null or (price_minor >= 0 and char_length(currency) = 3))
);;--> statement-breakpoint
CREATE TABLE "access_plan_entity" (
	"organization_id" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"entity_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);;--> statement-breakpoint
CREATE TABLE "access_plan_price" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"effective_month" date NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"recorded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_plan_price_is_a_month" CHECK (date_trunc('month', effective_month) = effective_month),
	CONSTRAINT "access_plan_price_sane" CHECK (price_minor >= 0 and char_length(currency) = 3)
);;--> statement-breakpoint
CREATE TABLE "membership_access_hold" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"person_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"membership_month_id" uuid NOT NULL,
	"entity_id" text NOT NULL,
	"rejected_by" text,
	"rejection_reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" text,
	"resolution_reason" text,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "membership_access_hold_resolution_complete" CHECK ((resolved_at is null and resolved_by is null and resolution_reason is null) or (resolved_at is not null and resolution_reason is not null))
);;--> statement-breakpoint
CREATE TABLE "membership_month" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"assignment_id" uuid NOT NULL,
	"month" date NOT NULL,
	"status" text DEFAULT 'unpaid' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"claimed_by" text,
	"reported_at" timestamp with time zone,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"price_minor" integer,
	"currency" text,
	"deadline" timestamp with time zone,
	"calendar_time_zone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_month_is_a_month" CHECK (date_trunc('month', month) = month),
	CONSTRAINT "membership_month_status_supported" CHECK (status in ('unpaid','reported','confirmed','rejected')),
	CONSTRAINT "membership_month_price_complete" CHECK ((price_minor is null) = (currency is null)),
	CONSTRAINT "membership_month_price_sane" CHECK (price_minor is null or (price_minor >= 0 and char_length(currency) = 3))
);;--> statement-breakpoint
CREATE TABLE "membership_month_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"assignment_id" uuid NOT NULL,
	"month" date NOT NULL,
	"event" text DEFAULT 'corrected' NOT NULL,
	"before_status" text,
	"after_status" text DEFAULT 'unpaid' NOT NULL,
	"reason" text,
	"price_minor" integer,
	"currency" text,
	"deadline" timestamp with time zone,
	"calendar_time_zone" text,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);;--> statement-breakpoint
CREATE TABLE "membership_policy" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"grace_days" integer DEFAULT 7 NOT NULL,
	"calendar_time_zone" text,
	"bank_details" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_policy_grace_sane" CHECK (grace_days >= 0 AND grace_days <= 28)
);;--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);;--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);;--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
);;--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	"deleted_at" timestamp with time zone,
	"general_branches_enabled" boolean DEFAULT true NOT NULL,
	"curriculum_enabled" boolean DEFAULT false NOT NULL,
	"referrals_enabled" boolean DEFAULT false NOT NULL,
	"offer" text DEFAULT 'pilot' NOT NULL,
	"pilot_ends_on" date,
	"agreed_price_minor" integer,
	"agreed_price_currency" text,
	"billing_contact" text,
	"account_status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);;--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);;--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"phone" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);;--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);;--> statement-breakpoint
CREATE TABLE "curriculum_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"track_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"notes" text,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"weeks" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);;--> statement-breakpoint
CREATE TABLE "curriculum_block_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"theme" text NOT NULL,
	"notes" text,
	"category" text,
	"default_weeks" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);;--> statement-breakpoint
CREATE TABLE "curriculum_track" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);;--> statement-breakpoint
CREATE TABLE "academy_profile" (
	"entity_id" text PRIMARY KEY NOT NULL,
	"curriculum_for_students" boolean DEFAULT false NOT NULL,
	"public_booking_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);;--> statement-breakpoint
CREATE TABLE "entity" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"time_zone" text,
	"country" text,
	"address" text,
	"map_url" text,
	"booking_window_days" integer DEFAULT 7 NOT NULL,
	"schedule_revision" integer DEFAULT 0 NOT NULL,
	"public_code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"membership_enforced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "entity_publicCode_unique" UNIQUE("public_code"),
	CONSTRAINT "entity_type_supported" CHECK (type in ('bjj_academy','general_space')),
	CONSTRAINT "entity_booking_window_days_valid" CHECK ("entity"."booking_window_days" between 1 and 90),
	CONSTRAINT "entity_schedule_revision_valid" CHECK ("entity"."schedule_revision" >= 0)
);;--> statement-breakpoint
CREATE TABLE "entity_membership" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"user_id" text,
	"person_id" uuid,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_role" text,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_membership_has_subject" CHECK (user_id is not null or person_id is not null)
);;--> statement-breakpoint
CREATE TABLE "academy_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"role" text NOT NULL,
	"token" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "academy_invite_token_unique" UNIQUE("token")
);;--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"sent_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);;--> statement-breakpoint
CREATE TABLE "notification_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"academy_id" text NOT NULL,
	"lease_owner" text NOT NULL,
	"outcome" text DEFAULT 'sending' NOT NULL,
	"provider_id" text,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);;--> statement-breakpoint
CREATE TABLE "notification_notice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"event_key" text NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"template_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);;--> statement-breakpoint
CREATE TABLE "notification_recipient" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notice_id" uuid NOT NULL,
	"academy_id" text NOT NULL,
	"recipient_key" text NOT NULL,
	"user_id" text,
	"person_id" uuid,
	"visit_id" uuid,
	"email" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"lease_owner" text,
	"lease_mode" text,
	"lease_expires_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);;--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"account_user_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);;--> statement-breakpoint
CREATE TABLE "product_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"actor_role" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_event_kind_known" CHECK ("product_event"."kind" IN ('milestone', 'activity'))
);;--> statement-breakpoint
CREATE TABLE "push_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"device_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_token_token_unique" UNIQUE("token")
);;--> statement-breakpoint
CREATE TABLE "member_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"member_id" text NOT NULL,
	"body" text NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);;--> statement-breakpoint
CREATE TABLE "member_rank" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"member_id" text NOT NULL,
	"discipline" text NOT NULL,
	"belt" text NOT NULL,
	"stripes" integer DEFAULT 0 NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);;--> statement-breakpoint
CREATE TABLE "rank_correction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"member_id" text NOT NULL,
	"discipline" text NOT NULL,
	"from_belt" text NOT NULL,
	"from_stripes" integer NOT NULL,
	"to_belt" text,
	"to_stripes" integer,
	"reason" text NOT NULL,
	"corrected_by" text NOT NULL,
	"corrected_at" timestamp with time zone DEFAULT now() NOT NULL
);;--> statement-breakpoint
CREATE TABLE "rank_promotion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"member_id" text NOT NULL,
	"discipline" text NOT NULL,
	"from_belt" text,
	"from_stripes" integer,
	"to_belt" text NOT NULL,
	"to_stripes" integer NOT NULL,
	"promoted_by" text NOT NULL,
	"promoted_at" timestamp with time zone DEFAULT now() NOT NULL
);;--> statement-breakpoint
CREATE TABLE "member_referral" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"student_member_id" text NOT NULL,
	"referrer_member_id" text,
	"assigned_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mref_no_self_referral" CHECK ("member_referral"."referrer_member_id" IS NULL OR "member_referral"."student_member_id" <> "member_referral"."referrer_member_id")
);;--> statement-breakpoint
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
);;--> statement-breakpoint
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
);;--> statement-breakpoint
CREATE TABLE "class" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"template_id" uuid,
	"instructor_id" text,
	"title" text NOT NULL,
	"description" text,
	"discipline" "discipline",
	"starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"capacity" integer NOT NULL,
	"capacity_policy" text DEFAULT 'soft' NOT NULL,
	"booking_count" integer DEFAULT 0 NOT NULL,
	"public_bookable" boolean DEFAULT false NOT NULL,
	"status" "class_status" DEFAULT 'scheduled' NOT NULL,
	"attendance_reviewed_at" timestamp with time zone,
	"attendance_reviewed_by" text,
	"attendance_review_fingerprint" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cl_description_bounded" CHECK (char_length(description) <= 500),
	CONSTRAINT "cl_capacity_policy_supported" CHECK (capacity_policy in ('soft','strict'))
);;--> statement-breakpoint
CREATE TABLE "class_participation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"class_id" uuid NOT NULL,
	"student_id" text,
	"person_organization_id" text,
	"person_id" uuid,
	"booking_status" "booking_status" DEFAULT 'booked' NOT NULL,
	"booking_tier" "booking_tier" NOT NULL,
	"booked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"attendance_status" "attendance_status" DEFAULT 'unmarked' NOT NULL,
	"attended_at" timestamp with time zone,
	"marked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_participation_has_subject" CHECK (student_id is not null or person_id is not null),
	CONSTRAINT "class_participation_person_complete" CHECK ((person_organization_id is null) = (person_id is null))
);;--> statement-breakpoint
CREATE TABLE "class_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"instructor_id" text,
	"title" text NOT NULL,
	"description" text,
	"discipline" "discipline",
	"curriculum_track_id" uuid,
	"days_of_week" integer[] NOT NULL,
	"starts_at_minutes" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"time_zone" text NOT NULL,
	"capacity" integer NOT NULL,
	"capacity_policy" text DEFAULT 'soft' NOT NULL,
	"public_bookable" boolean DEFAULT false NOT NULL,
	"status" "template_status" DEFAULT 'active' NOT NULL,
	"deleted_at" timestamp with time zone,
	"generated_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ct_description_bounded" CHECK (char_length(description) <= 500),
	CONSTRAINT "ct_capacity_policy_supported" CHECK (capacity_policy in ('soft','strict'))
);;--> statement-breakpoint
CREATE TABLE "drop_in" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"consent" boolean NOT NULL,
	"stage" "lead_stage" DEFAULT 'new' NOT NULL,
	"source" "lead_source" DEFAULT 'wall_qr' NOT NULL,
	"contacted_at" timestamp with time zone,
	"converted_user_id" text,
	"first_visit_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_visit_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);;--> statement-breakpoint
CREATE TABLE "drop_in_visit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"drop_in_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"booking_status" "booking_status" DEFAULT 'none' NOT NULL,
	"attendance_status" "attendance_status" DEFAULT 'unmarked' NOT NULL,
	"cancel_token" text,
	"cancel_token_expires_at" timestamp with time zone,
	"booked_class_starts_at" timestamp with time zone,
	"booked_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"attended_at" timestamp with time zone,
	"marked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);;--> statement-breakpoint
CREATE UNIQUE INDEX "access_assignment_one_per_plan_person_start" ON "access_assignment" USING btree ("plan_id","person_id","start_month") WHERE status <> 'cancelled';;--> statement-breakpoint
CREATE UNIQUE INDEX "access_assignment_org_id" ON "access_assignment" USING btree ("organization_id","id");;--> statement-breakpoint
CREATE INDEX "access_assignment_by_person" ON "access_assignment" USING btree ("person_id");;--> statement-breakpoint
CREATE INDEX "access_assignment_by_org_status" ON "access_assignment" USING btree ("organization_id","status");;--> statement-breakpoint
CREATE INDEX "access_assignment_by_person_period" ON "access_assignment" USING btree ("person_id","start_month");;--> statement-breakpoint
CREATE UNIQUE INDEX "access_assignment_change_one_live_per_source" ON "access_assignment_change" USING btree ("source_assignment_id") WHERE cancelled_at is null;;--> statement-breakpoint
CREATE INDEX "access_assignment_change_by_org_month" ON "access_assignment_change" USING btree ("organization_id","effective_month");;--> statement-breakpoint
CREATE INDEX "access_assignment_change_by_person" ON "access_assignment_change" USING btree ("person_id");;--> statement-breakpoint
CREATE UNIQUE INDEX "access_plan_org_id" ON "access_plan" USING btree ("organization_id","id");;--> statement-breakpoint
CREATE INDEX "access_plan_by_org" ON "access_plan" USING btree ("organization_id");;--> statement-breakpoint
CREATE UNIQUE INDEX "access_plan_entity_pk" ON "access_plan_entity" USING btree ("plan_id","entity_id");;--> statement-breakpoint
CREATE INDEX "access_plan_entity_by_entity" ON "access_plan_entity" USING btree ("entity_id");;--> statement-breakpoint
CREATE UNIQUE INDEX "access_plan_price_one_per_month" ON "access_plan_price" USING btree ("plan_id","effective_month");;--> statement-breakpoint
CREATE INDEX "access_plan_price_by_org" ON "access_plan_price" USING btree ("organization_id");;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_access_hold_one_open_source" ON "membership_access_hold" USING btree ("membership_month_id","entity_id") WHERE resolved_at is null;;--> statement-breakpoint
CREATE INDEX "membership_access_hold_open_person_entity" ON "membership_access_hold" USING btree ("organization_id","person_id","entity_id","resolved_at");;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_month_org_id" ON "membership_month" USING btree ("organization_id","id");;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_month_one_per_month" ON "membership_month" USING btree ("assignment_id","month");;--> statement-breakpoint
CREATE INDEX "membership_month_by_org_month" ON "membership_month" USING btree ("organization_id","month");;--> statement-breakpoint
CREATE INDEX "membership_month_audit_by_assignment" ON "membership_month_audit" USING btree ("assignment_id","month");;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");;--> statement-breakpoint
CREATE UNIQUE INDEX "member_by_org_user" ON "member" USING btree ("organization_id","user_id");;--> statement-breakpoint
CREATE INDEX "member_by_user" ON "member" USING btree ("user_id");;--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");;--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");;--> statement-breakpoint
CREATE INDEX "curriculum_block_by_academy_start" ON "curriculum_block" USING btree ("academy_id","starts_on");;--> statement-breakpoint
CREATE INDEX "curriculum_block_by_template" ON "curriculum_block" USING btree ("academy_id","template_id");;--> statement-breakpoint
CREATE INDEX "curriculum_block_by_track" ON "curriculum_block" USING btree ("academy_id","track_id","starts_on");;--> statement-breakpoint
CREATE INDEX "curriculum_block_by_slot" ON "curriculum_block" USING btree ("academy_id","slot_id");;--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_block_one_theme_per_slot" ON "curriculum_block" USING btree ("slot_id","template_id");;--> statement-breakpoint
CREATE INDEX "curriculum_template_by_academy" ON "curriculum_block_template" USING btree ("academy_id");;--> statement-breakpoint
CREATE INDEX "curriculum_track_by_academy" ON "curriculum_track" USING btree ("academy_id");;--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_track_one_default" ON "curriculum_track" USING btree ("academy_id") WHERE is_default;;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_org_id" ON "entity" USING btree ("organization_id","id");;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_org_slug" ON "entity" USING btree ("organization_id","slug");;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_one_default_per_org" ON "entity" USING btree ("organization_id") WHERE is_default and deleted_at is null;;--> statement-breakpoint
CREATE INDEX "entity_by_org" ON "entity" USING btree ("organization_id");;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_membership_one_per_user" ON "entity_membership" USING btree ("entity_id","user_id");;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_membership_one_per_person" ON "entity_membership" USING btree ("entity_id","person_id");;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_membership_entity_id" ON "entity_membership" USING btree ("entity_id","id");;--> statement-breakpoint
CREATE INDEX "entity_membership_by_user" ON "entity_membership" USING btree ("user_id");;--> statement-breakpoint
CREATE INDEX "entity_membership_by_person" ON "entity_membership" USING btree ("person_id");;--> statement-breakpoint
CREATE INDEX "entity_membership_by_entity_status" ON "entity_membership" USING btree ("entity_id","status");;--> statement-breakpoint
CREATE UNIQUE INDEX "academy_invite_one_active_per_role" ON "academy_invite" USING btree ("academy_id","role") WHERE "academy_invite"."revoked_at" is null;;--> statement-breakpoint
CREATE INDEX "notif_by_academy_user" ON "notification" USING btree ("academy_id","user_id","created_at");;--> statement-breakpoint
CREATE INDEX "notification_attempt_by_recipient" ON "notification_attempt" USING btree ("recipient_id","started_at");;--> statement-breakpoint
CREATE INDEX "notification_attempt_by_academy" ON "notification_attempt" USING btree ("academy_id","started_at");;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_notice_event" ON "notification_notice" USING btree ("academy_id","event_key");;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_notice_academy_id" ON "notification_notice" USING btree ("academy_id","id");;--> statement-breakpoint
CREATE INDEX "notification_notice_by_academy" ON "notification_notice" USING btree ("academy_id","created_at");;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_recipient_notice_key" ON "notification_recipient" USING btree ("notice_id","recipient_key");;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_recipient_academy_id" ON "notification_recipient" USING btree ("academy_id","id");;--> statement-breakpoint
CREATE INDEX "notification_recipient_claim" ON "notification_recipient" USING btree ("notice_id","status","lease_expires_at","created_at");;--> statement-breakpoint
CREATE INDEX "notification_recipient_by_user" ON "notification_recipient" USING btree ("academy_id","user_id");;--> statement-breakpoint
CREATE INDEX "notification_recipient_by_person" ON "notification_recipient" USING btree ("academy_id","person_id");;--> statement-breakpoint
CREATE INDEX "notification_recipient_by_visit" ON "notification_recipient" USING btree ("academy_id","visit_id");;--> statement-breakpoint
CREATE UNIQUE INDEX "person_org_id" ON "person" USING btree ("organization_id","id");;--> statement-breakpoint
CREATE UNIQUE INDEX "person_one_per_account" ON "person" USING btree ("organization_id","account_user_id");;--> statement-breakpoint
CREATE INDEX "person_by_org_name" ON "person" USING btree ("organization_id","name");;--> statement-breakpoint
CREATE INDEX "product_event_by_time" ON "product_event" USING btree ("occurred_at");;--> statement-breakpoint
CREATE INDEX "product_event_by_org_time" ON "product_event" USING btree ("organization_id","occurred_at");;--> statement-breakpoint
CREATE UNIQUE INDEX "product_event_milestone_once" ON "product_event" USING btree ("organization_id",coalesce("entity_id", ''),"name") WHERE "product_event"."kind" = 'milestone';;--> statement-breakpoint
CREATE INDEX "pt_by_user" ON "push_token" USING btree ("user_id");;--> statement-breakpoint
CREATE INDEX "mn_by_member" ON "member_note" USING btree ("academy_id","member_id");;--> statement-breakpoint
CREATE UNIQUE INDEX "mr_uniq_member_discipline" ON "member_rank" USING btree ("academy_id","member_id","discipline");;--> statement-breakpoint
CREATE INDEX "rc_by_member" ON "rank_correction" USING btree ("academy_id","member_id");;--> statement-breakpoint
CREATE INDEX "rp_by_member" ON "rank_promotion" USING btree ("academy_id","member_id");;--> statement-breakpoint
CREATE UNIQUE INDEX "mref_uniq_academy_student" ON "member_referral" USING btree ("academy_id","student_member_id");;--> statement-breakpoint
CREATE INDEX "mref_by_academy_referrer" ON "member_referral" USING btree ("academy_id","referrer_member_id");;--> statement-breakpoint
CREATE INDEX "mref_audit_by_academy_student" ON "member_referral_audit" USING btree ("academy_id","student_member_id","occurred_at");;--> statement-breakpoint
CREATE INDEX "attendance_correction_by_class" ON "attendance_correction" USING btree ("academy_id","class_id","created_at");;--> statement-breakpoint
CREATE INDEX "cl_by_academy_start" ON "class" USING btree ("academy_id","starts_at");;--> statement-breakpoint
CREATE INDEX "cl_by_academy_status_start" ON "class" USING btree ("academy_id","status","starts_at");;--> statement-breakpoint
CREATE INDEX "cl_by_template" ON "class" USING btree ("template_id");;--> statement-breakpoint
CREATE UNIQUE INDEX "cl_uniq_template_start" ON "class" USING btree ("template_id","starts_at");;--> statement-breakpoint
CREATE UNIQUE INDEX "cp_uniq_class_student" ON "class_participation" USING btree ("class_id","student_id");;--> statement-breakpoint
CREATE UNIQUE INDEX "cp_uniq_class_person" ON "class_participation" USING btree ("class_id","person_id") WHERE person_id is not null;;--> statement-breakpoint
CREATE INDEX "cp_by_academy_class" ON "class_participation" USING btree ("academy_id","class_id");;--> statement-breakpoint
CREATE INDEX "cp_by_academy_student" ON "class_participation" USING btree ("academy_id","student_id");;--> statement-breakpoint
CREATE INDEX "cp_by_academy_person" ON "class_participation" USING btree ("academy_id","person_id");;--> statement-breakpoint
CREATE INDEX "ct_by_academy" ON "class_template" USING btree ("academy_id");;--> statement-breakpoint
CREATE INDEX "ct_by_academy_status" ON "class_template" USING btree ("academy_id","status");;--> statement-breakpoint
CREATE INDEX "ct_sweep_stale" ON "class_template" USING btree ("status","generated_until") WHERE deleted_at IS NULL;;--> statement-breakpoint
CREATE UNIQUE INDEX "di_uniq_academy_phone" ON "drop_in" USING btree ("academy_id","phone");;--> statement-breakpoint
CREATE UNIQUE INDEX "dv_uniq_lead_class" ON "drop_in_visit" USING btree ("drop_in_id","class_id");;--> statement-breakpoint
CREATE INDEX "dv_by_academy_class" ON "drop_in_visit" USING btree ("academy_id","class_id");;--> statement-breakpoint
CREATE INDEX "dv_by_lead" ON "drop_in_visit" USING btree ("drop_in_id");;--> statement-breakpoint
CREATE UNIQUE INDEX "dv_uniq_cancel_token" ON "drop_in_visit" USING btree ("cancel_token");;--> statement-breakpoint
ALTER TABLE "access_assignment" ADD CONSTRAINT "access_assignment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "access_assignment" ADD CONSTRAINT "access_assignment_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "access_assignment" ADD CONSTRAINT "access_assignment_plan_same_org" FOREIGN KEY ("organization_id","plan_id") REFERENCES "public"."access_plan"("organization_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "access_assignment" ADD CONSTRAINT "access_assignment_entity_same_org" FOREIGN KEY ("organization_id","assigning_entity_id") REFERENCES "public"."entity"("organization_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "access_assignment" ADD CONSTRAINT "access_assignment_person_same_org" FOREIGN KEY ("organization_id","person_id") REFERENCES "public"."person"("organization_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "access_assignment_change" ADD CONSTRAINT "access_assignment_change_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "access_assignment_change" ADD CONSTRAINT "access_assignment_change_scheduled_by_user_id_fk" FOREIGN KEY ("scheduled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "access_assignment_change" ADD CONSTRAINT "access_assignment_change_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "access_assignment_change" ADD CONSTRAINT "access_assignment_change_source_same_org" FOREIGN KEY ("organization_id","source_assignment_id") REFERENCES "public"."access_assignment"("organization_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "access_assignment_change" ADD CONSTRAINT "access_assignment_change_target_same_org" FOREIGN KEY ("organization_id","target_assignment_id") REFERENCES "public"."access_assignment"("organization_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "access_assignment_change" ADD CONSTRAINT "access_assignment_change_person_same_org" FOREIGN KEY ("organization_id","person_id") REFERENCES "public"."person"("organization_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "access_plan" ADD CONSTRAINT "access_plan_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "access_plan_entity" ADD CONSTRAINT "access_plan_entity_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "access_plan_entity" ADD CONSTRAINT "access_plan_entity_plan_same_org" FOREIGN KEY ("organization_id","plan_id") REFERENCES "public"."access_plan"("organization_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "access_plan_entity" ADD CONSTRAINT "access_plan_entity_entity_same_org" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entity"("organization_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "access_plan_price" ADD CONSTRAINT "access_plan_price_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "access_plan_price" ADD CONSTRAINT "access_plan_price_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "access_plan_price" ADD CONSTRAINT "access_plan_price_plan_same_org" FOREIGN KEY ("organization_id","plan_id") REFERENCES "public"."access_plan"("organization_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "membership_access_hold" ADD CONSTRAINT "membership_access_hold_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "membership_access_hold" ADD CONSTRAINT "membership_access_hold_rejected_by_user_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "membership_access_hold" ADD CONSTRAINT "membership_access_hold_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "membership_access_hold" ADD CONSTRAINT "membership_access_hold_person_same_org" FOREIGN KEY ("organization_id","person_id") REFERENCES "public"."person"("organization_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "membership_access_hold" ADD CONSTRAINT "membership_access_hold_assignment_same_org" FOREIGN KEY ("organization_id","assignment_id") REFERENCES "public"."access_assignment"("organization_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "membership_access_hold" ADD CONSTRAINT "membership_access_hold_month_same_org" FOREIGN KEY ("organization_id","membership_month_id") REFERENCES "public"."membership_month"("organization_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "membership_access_hold" ADD CONSTRAINT "membership_access_hold_entity_same_org" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entity"("organization_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "membership_month" ADD CONSTRAINT "membership_month_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "membership_month" ADD CONSTRAINT "membership_month_claimed_by_user_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "membership_month" ADD CONSTRAINT "membership_month_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "membership_month" ADD CONSTRAINT "membership_month_assignment_same_org" FOREIGN KEY ("organization_id","assignment_id") REFERENCES "public"."access_assignment"("organization_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "membership_month_audit" ADD CONSTRAINT "membership_month_audit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "membership_month_audit" ADD CONSTRAINT "membership_month_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "membership_policy" ADD CONSTRAINT "membership_policy_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "curriculum_block" ADD CONSTRAINT "curriculum_block_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "curriculum_block_template" ADD CONSTRAINT "curriculum_block_template_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "curriculum_track" ADD CONSTRAINT "curriculum_track_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "academy_profile" ADD CONSTRAINT "academy_profile_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "entity" ADD CONSTRAINT "entity_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "entity_membership" ADD CONSTRAINT "entity_membership_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "entity_membership" ADD CONSTRAINT "entity_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "entity_membership" ADD CONSTRAINT "entity_membership_entity_same_org" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entity"("organization_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "entity_membership" ADD CONSTRAINT "entity_membership_person_same_org" FOREIGN KEY ("organization_id","person_id") REFERENCES "public"."person"("organization_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "academy_invite" ADD CONSTRAINT "academy_invite_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "notification_attempt" ADD CONSTRAINT "notification_attempt_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "notification_attempt" ADD CONSTRAINT "notification_attempt_recipient_academy_fk" FOREIGN KEY ("academy_id","recipient_id") REFERENCES "public"."notification_recipient"("academy_id","id") ON DELETE cascade ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "notification_notice" ADD CONSTRAINT "notification_notice_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "notification_recipient" ADD CONSTRAINT "notification_recipient_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "notification_recipient" ADD CONSTRAINT "notification_recipient_notice_academy_fk" FOREIGN KEY ("academy_id","notice_id") REFERENCES "public"."notification_notice"("academy_id","id") ON DELETE cascade ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_account_user_id_user_id_fk" FOREIGN KEY ("account_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_account_same_org" FOREIGN KEY ("organization_id","account_user_id") REFERENCES "public"."member"("organization_id","user_id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "product_event" ADD CONSTRAINT "product_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "product_event" ADD CONSTRAINT "product_event_entity_same_org" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entity"("organization_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "push_token" ADD CONSTRAINT "push_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "member_note" ADD CONSTRAINT "member_note_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "member_note" ADD CONSTRAINT "member_note_membership" FOREIGN KEY ("academy_id","member_id") REFERENCES "public"."entity_membership"("entity_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "member_rank" ADD CONSTRAINT "member_rank_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "member_rank" ADD CONSTRAINT "member_rank_membership" FOREIGN KEY ("academy_id","member_id") REFERENCES "public"."entity_membership"("entity_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "rank_correction" ADD CONSTRAINT "rank_correction_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "rank_correction" ADD CONSTRAINT "rank_correction_membership" FOREIGN KEY ("academy_id","member_id") REFERENCES "public"."entity_membership"("entity_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "rank_promotion" ADD CONSTRAINT "rank_promotion_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "rank_promotion" ADD CONSTRAINT "rank_promotion_membership" FOREIGN KEY ("academy_id","member_id") REFERENCES "public"."entity_membership"("entity_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "member_referral" ADD CONSTRAINT "member_referral_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "member_referral" ADD CONSTRAINT "member_referral_student_membership" FOREIGN KEY ("academy_id","student_member_id") REFERENCES "public"."entity_membership"("entity_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "member_referral" ADD CONSTRAINT "member_referral_referrer_membership" FOREIGN KEY ("academy_id","referrer_member_id") REFERENCES "public"."entity_membership"("entity_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "member_referral_audit" ADD CONSTRAINT "member_referral_audit_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "member_referral_audit" ADD CONSTRAINT "member_referral_audit_student_membership" FOREIGN KEY ("academy_id","student_member_id") REFERENCES "public"."entity_membership"("entity_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "member_referral_audit" ADD CONSTRAINT "member_referral_audit_old_referrer_membership" FOREIGN KEY ("academy_id","old_referrer_member_id") REFERENCES "public"."entity_membership"("entity_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "member_referral_audit" ADD CONSTRAINT "member_referral_audit_new_referrer_membership" FOREIGN KEY ("academy_id","new_referrer_member_id") REFERENCES "public"."entity_membership"("entity_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "attendance_correction" ADD CONSTRAINT "attendance_correction_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "attendance_correction" ADD CONSTRAINT "attendance_correction_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "attendance_correction" ADD CONSTRAINT "attendance_correction_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "class" ADD CONSTRAINT "class_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "class" ADD CONSTRAINT "class_template_id_class_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."class_template"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "class_participation" ADD CONSTRAINT "class_participation_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "class_participation" ADD CONSTRAINT "class_participation_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "class_participation" ADD CONSTRAINT "class_participation_person_same_org" FOREIGN KEY ("person_organization_id","person_id") REFERENCES "public"."person"("organization_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "class_template" ADD CONSTRAINT "class_template_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "drop_in" ADD CONSTRAINT "drop_in_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "drop_in_visit" ADD CONSTRAINT "drop_in_visit_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "drop_in_visit" ADD CONSTRAINT "drop_in_visit_drop_in_id_drop_in_id_fk" FOREIGN KEY ("drop_in_id") REFERENCES "public"."drop_in"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "drop_in_visit" ADD CONSTRAINT "drop_in_visit_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
CREATE TABLE "tenant_probe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"payload" text NOT NULL
);;;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'matops_app') THEN
		CREATE ROLE matops_app NOLOGIN;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'matops_debug_ro') THEN
		CREATE ROLE matops_debug_ro NOLOGIN;
	END IF;
END
$$;;;--> statement-breakpoint
GRANT matops_app TO current_user;;;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO matops_app;;;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO matops_app;;;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO matops_app;;;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON "user", "organization", "member" FROM matops_app;;;--> statement-breakpoint
REVOKE ALL ON "session", "account", "verification", "invitation", "academy_invite", "push_token", "_health" FROM matops_app;;;--> statement-breakpoint
ALTER TABLE "entity" ENABLE ROW LEVEL SECURITY;;;--> statement-breakpoint
CREATE POLICY "entity_isolation" ON "entity" USING ("organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("organization_id" = current_setting('app.organization_id', true));;;--> statement-breakpoint
ALTER TABLE "entity_membership" ENABLE ROW LEVEL SECURITY;;;--> statement-breakpoint
CREATE POLICY "entity_membership_isolation" ON "entity_membership" USING ("organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("organization_id" = current_setting('app.organization_id', true));;;--> statement-breakpoint
ALTER TABLE "person" ENABLE ROW LEVEL SECURITY;;;--> statement-breakpoint
CREATE POLICY "person_isolation" ON "person" USING ("organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("organization_id" = current_setting('app.organization_id', true));;;--> statement-breakpoint
ALTER TABLE "product_event" ENABLE ROW LEVEL SECURITY;;;--> statement-breakpoint
CREATE POLICY "product_event_isolation" ON "product_event" USING ("organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("organization_id" = current_setting('app.organization_id', true));;;--> statement-breakpoint
ALTER TABLE "academy_profile" ENABLE ROW LEVEL SECURITY;;;--> statement-breakpoint
CREATE POLICY "academy_profile_isolation" ON "academy_profile" USING ("entity_id" = current_setting('app.academy_id', true)) WITH CHECK ("entity_id" = current_setting('app.academy_id', true));;;--> statement-breakpoint
ALTER TABLE "tenant_probe" ENABLE ROW LEVEL SECURITY;;;--> statement-breakpoint
CREATE POLICY "tenant_probe_isolation" ON "tenant_probe" USING ("academy_id" = current_setting('app.academy_id', true)) WITH CHECK ("academy_id" = current_setting('app.academy_id', true));;;--> statement-breakpoint
DO $$
DECLARE
	table_name text;
BEGIN
	FOREACH table_name IN ARRAY ARRAY[
		'access_assignment', 'access_assignment_change', 'access_plan', 'access_plan_entity',
		'access_plan_price', 'membership_access_hold', 'membership_month',
		'membership_month_audit', 'membership_policy'
	]
	LOOP
		EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
		EXECUTE format('CREATE POLICY %I ON %I USING (organization_id = current_setting(''app.organization_id'', true)) WITH CHECK (organization_id = current_setting(''app.organization_id'', true))', table_name || '_isolation', table_name);
	END LOOP;
	FOREACH table_name IN ARRAY ARRAY[
		'attendance_correction', 'class', 'class_participation', 'class_template',
		'curriculum_block', 'curriculum_block_template', 'curriculum_track', 'drop_in',
		'drop_in_visit', 'member_note', 'member_rank', 'member_referral',
		'member_referral_audit', 'notification', 'notification_attempt',
		'notification_notice', 'notification_recipient', 'rank_correction', 'rank_promotion'
	]
	LOOP
		EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
		EXECUTE format('CREATE POLICY %I ON %I USING (academy_id = current_setting(''app.academy_id'', true)) WITH CHECK (academy_id = current_setting(''app.academy_id'', true))', table_name || '_isolation', table_name);
	END LOOP;
END
$$;;;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO matops_debug_ro;;;--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA public TO matops_debug_ro;;;--> statement-breakpoint
REVOKE ALL ON "session", "account", "verification", "invitation", "academy_invite", "push_token", "drop_in", "notification_recipient", "notification_attempt" FROM matops_debug_ro;;;
