ALTER TABLE "class_template" ALTER COLUMN "instructor_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "class" ALTER COLUMN "instructor_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "class_template" ADD COLUMN "description" text;
--> statement-breakpoint
ALTER TABLE "class" ADD COLUMN "description" text;
--> statement-breakpoint
ALTER TABLE "class_template" ADD CONSTRAINT "ct_description_bounded" CHECK (char_length(description) <= 500);
--> statement-breakpoint
ALTER TABLE "class" ADD CONSTRAINT "cl_description_bounded" CHECK (char_length(description) <= 500);
