ALTER TABLE "daily_metrics" RENAME COLUMN "metric" TO "definition_id";--> statement-breakpoint
ALTER TABLE "derived_observations" RENAME COLUMN "metric" TO "definition_id";--> statement-breakpoint
DROP INDEX "derived_observation_metric_observed_idx";--> statement-breakpoint
DROP INDEX "daily_metric_identity_idx";--> statement-breakpoint
CREATE INDEX "derived_observation_definition_observed_idx" ON "derived_observations" USING btree ("definition_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_metric_identity_idx" ON "daily_metrics" USING btree ("user_id","date","definition_id");--> statement-breakpoint
UPDATE "observations"
SET "attributes" = ("attributes" - 'journalDetail') ||
    jsonb_build_object('description', "attributes"->'journalDetail')
WHERE "attributes" ? 'journalDetail';--> statement-breakpoint
UPDATE "observations"
SET "attributes" = ("attributes" - 'primaryMetric') ||
    jsonb_build_object('primaryDefinitionId', "attributes"->'primaryMetric')
WHERE "attributes" ? 'primaryMetric';
--> statement-breakpoint
UPDATE "retention_rules" SET "category" = 'checkins' WHERE "category" = 'journal';
