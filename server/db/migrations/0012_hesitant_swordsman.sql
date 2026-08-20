ALTER TABLE "foods" ADD COLUMN "nutrition_quality" text DEFAULT 'complete' NOT NULL;--> statement-breakpoint
ALTER TABLE "meals" ADD COLUMN "nutrition_quality" text DEFAULT 'complete' NOT NULL;