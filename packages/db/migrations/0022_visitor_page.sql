ALTER TABLE "entity" ADD COLUMN "visitor_about" text;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "visitor_prices" text;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "visitor_rules" text;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "visitor_first_visit" text;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "visitor_contact" text;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "visitor_show_address" boolean DEFAULT false NOT NULL;