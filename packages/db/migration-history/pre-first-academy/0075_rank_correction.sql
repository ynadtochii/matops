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
	"corrected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rank_correction_academy_id_entity_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."entity"("id"),
	CONSTRAINT "rank_correction_membership" FOREIGN KEY ("academy_id", "member_id") REFERENCES "public"."entity_membership"("entity_id", "id")
);
CREATE INDEX "rc_by_member" ON "rank_correction" USING btree ("academy_id", "member_id");
ALTER TABLE "rank_correction" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "rank_correction" USING (academy_id = current_setting('app.current_academy', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "rank_correction" TO matops_app;
