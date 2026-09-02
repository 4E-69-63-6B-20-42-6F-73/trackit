UPDATE "observations" SET "excluded" = true WHERE "state" = 'excluded';--> statement-breakpoint
UPDATE "observations"
SET "deleted_at" = COALESCE("deleted_at", "updated_at")
WHERE "state" = 'deleted' AND "deleted_at" IS NULL;--> statement-breakpoint
UPDATE "preferences"
SET "metric_preferences" = CASE
    WHEN "units" = 'imperial' THEN '{"height":{"displayUnit":"in"},"weight":{"displayUnit":"lb"},"water":{"displayUnit":"fl oz"}}'::jsonb || COALESCE("metric_preferences", '{}'::jsonb)
    ELSE COALESCE("metric_preferences", '{}'::jsonb)
END;--> statement-breakpoint
ALTER TABLE "goals" RENAME COLUMN "metric" TO "definition_id";--> statement-breakpoint
ALTER TABLE "saved_trend_views" RENAME COLUMN "metric" TO "definition_id";--> statement-breakpoint
ALTER TABLE "saved_trend_views" RENAME COLUMN "comparison_metric" TO "comparison_definition_id";--> statement-breakpoint
ALTER TABLE "goals" DROP COLUMN "target_value";--> statement-breakpoint
ALTER TABLE "observations" DROP COLUMN "state";--> statement-breakpoint
ALTER TABLE "preferences" ALTER COLUMN "metric_preferences" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "preferences" ALTER COLUMN "metric_preferences" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "preferences" DROP COLUMN "goals";--> statement-breakpoint
ALTER TABLE "preferences" DROP COLUMN "units";
