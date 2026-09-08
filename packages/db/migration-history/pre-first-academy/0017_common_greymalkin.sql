CREATE TABLE "member_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" text NOT NULL,
	"member_id" text NOT NULL,
	"body" text NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
);
--> statement-breakpoint
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
);
--> statement-breakpoint
CREATE INDEX "mn_by_member" ON "member_note" USING btree ("academy_id","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mr_uniq_member_discipline" ON "member_rank" USING btree ("academy_id","member_id","discipline");--> statement-breakpoint
CREATE INDEX "rp_by_member" ON "rank_promotion" USING btree ("academy_id","member_id");--> statement-breakpoint

-- Tenant isolation for member rank + staff notes (v1.4, docs/issues/41). Same
-- policy as the other domain tables (0015/0013/0011/0008): the matops_app request
-- role only ever sees its own academy's rows. `member_note` gets the same standard
-- grant + academy scope; it has no extra DB restriction because it is never read
-- by a student-facing procedure (only staffProcedure ones), so a member never sees it.
GRANT SELECT, INSERT, UPDATE, DELETE ON "member_rank" TO matops_app;--> statement-breakpoint
ALTER TABLE "member_rank" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "member_rank_isolation" ON "member_rank"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "rank_promotion" TO matops_app;--> statement-breakpoint
ALTER TABLE "rank_promotion" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rank_promotion_isolation" ON "rank_promotion"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "member_note" TO matops_app;--> statement-breakpoint
ALTER TABLE "member_note" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "member_note_isolation" ON "member_note"
  USING ("academy_id" = current_setting('app.academy_id', true))
  WITH CHECK ("academy_id" = current_setting('app.academy_id', true));