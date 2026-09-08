-- What happened in the product, with nobody's name in it (ADR 128).
--
-- One row per thing worth counting: a gym was created, a branch got its first
-- schedule, a student booked. The row names the gym, the branch, the role of
-- whoever acted and nothing else. There is no user id, no email, no phone and
-- no amount, so the table cannot become a second copy of the roster.
--
-- Two kinds, because the questions are different. A `milestone` happens once,
-- so the partial unique index makes a second write a no-op and "first booking"
-- keeps the date it really happened. An `activity` row repeats, which is what
-- a weekly count of gyms with real student use is made of.
--
-- No `matops_app` grants: the events are ours, not the gym's, and no screen
-- reads them. Migration 0001's default privileges would have granted all four,
-- so they are revoked here. RLS is on with no policy, which denies every role
-- that is not the table owner even if a grant were added later by mistake.
CREATE TABLE "product_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"actor_role" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_event_kind_known" CHECK ("kind" IN ('milestone', 'activity')),
	CONSTRAINT "product_event_actor_role_known" CHECK ("actor_role" IS NULL OR "actor_role" IN ('owner', 'manager', 'instructor', 'student', 'system')),
	CONSTRAINT "product_event_name_shape" CHECK ("name" ~ '^[a-z][a-z0-9_]{2,59}$')
);
--> statement-breakpoint
ALTER TABLE "product_event" ADD CONSTRAINT "product_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_event" ADD CONSTRAINT "product_event_entity_same_org" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entity"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "product_event_one_milestone" ON "product_event" USING btree ("organization_id","name",COALESCE("entity_id",'')) WHERE "kind" = 'milestone';
--> statement-breakpoint
CREATE INDEX "product_event_by_time" ON "product_event" USING btree ("occurred_at");
--> statement-breakpoint
CREATE INDEX "product_event_by_org_time" ON "product_event" USING btree ("organization_id","occurred_at");
--> statement-breakpoint
ALTER TABLE "product_event" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON "product_event" FROM matops_app;
--> statement-breakpoint
GRANT SELECT ON "product_event" TO matops_debug_ro;
