CREATE TABLE "card_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"stripe_session_id" text NOT NULL,
	"assignment_id" uuid,
	"month" date,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"outcome" text NOT NULL,
	"reason" text,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_payment_stripeSessionId_unique" UNIQUE("stripe_session_id"),
	CONSTRAINT "card_payment_outcome_supported" CHECK (outcome in ('confirmed','paid_twice','needs_review'))
);
--> statement-breakpoint
CREATE TABLE "stripe_hook" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"secret_ciphertext" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_event_at" timestamp with time zone,
	CONSTRAINT "stripe_hook_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "card_payment" ADD CONSTRAINT "card_payment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_hook" ADD CONSTRAINT "stripe_hook_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_payment_by_outcome" ON "card_payment" USING btree ("organization_id","outcome","created_at");--> statement-breakpoint
REVOKE ALL ON "stripe_hook" FROM matops_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "card_payment" TO matops_app;--> statement-breakpoint
ALTER TABLE "card_payment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "card_payment_isolation" ON "card_payment" USING ("organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("organization_id" = current_setting('app.organization_id', true));
