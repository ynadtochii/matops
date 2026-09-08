CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"event_key" text NOT NULL,
	"recipient_key" text NOT NULL,
	"channel" text NOT NULL,
	"recipient_address" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drop_in_visit" ADD COLUMN "cancel_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drop_in_visit" ADD COLUMN "booked_class_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_outbox_event_recipient_channel" ON "notification_outbox" USING btree ("event_key","recipient_key","channel");--> statement-breakpoint
CREATE INDEX "notification_outbox_due" ON "notification_outbox" USING btree ("status","next_attempt_at","created_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_by_academy" ON "notification_outbox" USING btree ("academy_id","status","created_at");--> statement-breakpoint
ALTER TABLE "notification_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notification_outbox_isolation" ON "notification_outbox"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "notification_outbox" TO matops_app;
