ALTER TABLE "class_template" ADD COLUMN "capacity_policy" text DEFAULT 'soft' NOT NULL;
--> statement-breakpoint
ALTER TABLE "class" ADD COLUMN "capacity_policy" text DEFAULT 'soft' NOT NULL;
--> statement-breakpoint
ALTER TABLE "class_template" ADD CONSTRAINT "ct_capacity_policy_supported" CHECK (capacity_policy in ('soft','strict'));
--> statement-breakpoint
ALTER TABLE "class" ADD CONSTRAINT "cl_capacity_policy_supported" CHECK (capacity_policy in ('soft','strict'));
--> statement-breakpoint

-- Activation is tracked PER BRANCH so an existing academy is never locked by a
-- deploy: null means the legacy branch dues gate still decides there, and a
-- timestamp means the shared membership gate does (ADR 126). Nothing sets this
-- for an existing academy; that is the reconciliation the rollout section
-- describes, run once per branch with the owner watching.
ALTER TABLE "entity" ADD COLUMN "membership_enforced_at" timestamp with time zone;
