-- A membership plan carries a price (ADR 128, spec FP6).
--
-- The amount is an integer in the currency's MINOR unit beside its ISO-4217
-- code, which is how `membership_plan` has stored money since ADR 40. Never a
-- float, and never an amount without the currency that gives it meaning.
--
-- Both columns are NULLABLE and move together. A plan an owner has made and not
-- yet priced is a real state during setup, so the checklist can name it and
-- activation readiness can refuse to let it reach a member; a NOT NULL default
-- of zero would say "free" instead, which is a different plan.
--
-- Structure only. Existing plans keep a null price until somebody sets one.
ALTER TABLE "access_plan" ADD COLUMN "price_minor" integer;
--> statement-breakpoint
ALTER TABLE "access_plan" ADD COLUMN "currency" text;
--> statement-breakpoint
ALTER TABLE "access_plan" ADD CONSTRAINT "access_plan_price_complete" CHECK ((price_minor is null) = (currency is null));
--> statement-breakpoint
ALTER TABLE "access_plan" ADD CONSTRAINT "access_plan_price_sane" CHECK (price_minor is null or (price_minor >= 0 and char_length(currency) = 3));
