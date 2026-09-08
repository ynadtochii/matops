ALTER TABLE "curriculum_block" ALTER COLUMN "template_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "curriculum_block" DROP COLUMN "theme";--> statement-breakpoint
ALTER TABLE "curriculum_block" DROP COLUMN "notes";