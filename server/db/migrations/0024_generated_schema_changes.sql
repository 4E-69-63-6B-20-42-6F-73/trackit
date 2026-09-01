UPDATE "observations" SET "excluded" = true WHERE "state" = 'excluded';--> statement-breakpoint
UPDATE "observations"
SET "deleted_at" = COALESCE("deleted_at", "updated_at")
WHERE "state" = 'deleted' AND "deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "goals" DROP COLUMN "target_value";--> statement-breakpoint
ALTER TABLE "observations" DROP COLUMN "state";--> statement-breakpoint
ALTER TABLE "preferences" DROP COLUMN "goals";
