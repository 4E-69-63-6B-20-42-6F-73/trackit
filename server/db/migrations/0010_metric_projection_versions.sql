ALTER TABLE "preferences" ADD COLUMN "metric_resolution_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD COLUMN "resolution_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
CREATE INDEX "observation_active_user_time_idx" ON "observations" USING btree ("user_id", "observed_at") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "observation_active_user_metric_time_idx" ON "observations" USING btree ("user_id", "metric", "observed_at") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "observation_active_metric_source_idx" ON "observations" USING btree (
    "metric",
    (COALESCE(NULLIF("metadata"->>'dataOrigin', ''), NULLIF("metadata"->>'source', ''), 'Manual')),
    (COALESCE(NULLIF("metadata"->>'connector', ''), CASE WHEN "metadata"->>'source' = 'Health Connect' THEN 'Health Connect' ELSE NULL END))
) WHERE "deleted_at" IS NULL;
