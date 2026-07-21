-- Academy public code (docs/issues/32): the plain 6-digit number an owner shares
-- so a student can find + join the gym in the mobile app. Add nullable, backfill
-- existing academies with unique random codes, then lock down NOT NULL + UNIQUE.
ALTER TABLE "organization" ADD COLUMN "public_code" text;--> statement-breakpoint
DO $$
DECLARE
	r record;
	c text;
BEGIN
	FOR r IN SELECT id FROM "organization" WHERE "public_code" IS NULL LOOP
		LOOP
			c := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
			EXIT WHEN NOT EXISTS (SELECT 1 FROM "organization" WHERE "public_code" = c);
		END LOOP;
		UPDATE "organization" SET "public_code" = c WHERE id = r.id;
	END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "public_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_public_code_unique" UNIQUE("public_code");
