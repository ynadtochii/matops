ALTER TABLE "entity" DROP CONSTRAINT "entity_type_supported";
--> statement-breakpoint
ALTER TABLE "entity" ADD CONSTRAINT "entity_type_supported" CHECK (type in ('bjj_academy','general_space'));
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "general_branches_enabled" boolean DEFAULT false NOT NULL;
