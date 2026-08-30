ALTER TABLE "curriculum_block" ADD COLUMN "slot_id" uuid;--> statement-breakpoint
UPDATE "curriculum_block" SET "slot_id" = "id";--> statement-breakpoint
ALTER TABLE "curriculum_block" ALTER COLUMN "slot_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "curriculum_block_by_slot" ON "curriculum_block" USING btree ("academy_id","slot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_block_one_theme_per_slot" ON "curriculum_block" USING btree ("slot_id","template_id");
