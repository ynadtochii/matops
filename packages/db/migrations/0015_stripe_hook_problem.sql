ALTER TABLE "stripe_hook" ADD COLUMN "last_problem" text;--> statement-breakpoint
ALTER TABLE "stripe_hook" ADD COLUMN "last_problem_at" timestamp with time zone;