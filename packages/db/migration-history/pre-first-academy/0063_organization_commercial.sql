-- What a gym has agreed to pay, and where that agreement stands (ADR 128).
--
-- Nothing here charges anybody. There is no card on file and no invoice in this
-- codebase: money is a conversation and a bank transfer, and these columns are
-- the note of what was said, so a pilot that quietly never ends is visible
-- rather than assumed.
--
-- The price is an integer in the currency's minor unit beside an ISO-4217 code,
-- the same shape every other amount in this schema uses. Both are null until a
-- price is agreed, and the check keeps them null together: an amount with no
-- currency is not a price.
ALTER TABLE "organization" ADD COLUMN "offer" text DEFAULT 'pilot' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "pilot_ends_on" date;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "agreed_price_minor" integer;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "agreed_price_currency" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "billing_contact" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "account_status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_offer_known" CHECK ("offer" IN ('pilot', 'academy', 'facility'));--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_account_status_known" CHECK ("account_status" IN ('active', 'past_due', 'closed'));--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_agreed_price_pair" CHECK (
  ("agreed_price_minor" IS NULL) = ("agreed_price_currency" IS NULL)
  AND ("agreed_price_minor" IS NULL OR ("agreed_price_minor" >= 0 AND char_length("agreed_price_currency") = 3))
);
