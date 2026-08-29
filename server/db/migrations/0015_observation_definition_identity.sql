DO $$
BEGIN
    UPDATE "observations"
    SET "definition_id" = 'health_record'
    WHERE "metric" = 'health_record';

    UPDATE "observations"
    SET "definition_id" = 'event'
    WHERE "definition_id" = 'journal_event';

    IF EXISTS (
        SELECT 1 FROM "observations"
        WHERE "definition_id" IS NULL OR btrim("definition_id") = ''
    ) THEN
        RAISE EXCEPTION 'Cannot remove observations.metric: unresolved definition_id values exist';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "observations"
        WHERE "definition_id" NOT IN (
            'steps', 'exercise', 'sleep', 'heart_rate', 'resting_heart_rate', 'height',
            'weight', 'water', 'energy', 'calories', 'active_calories', 'bmi',
            'calorie_balance', 'protein', 'carbs', 'fat', 'fiber', 'sugar',
            'saturatedFat', 'sodium', 'potassium', 'distance', 'total_calories',
            'body_fat', 'lean_body_mass', 'blood_pressure_systolic',
            'blood_pressure_diastolic', 'hrv_rmssd', 'oxygen_saturation',
            'respiratory_rate', 'sleep_deep', 'sleep_rem', 'sleep_light', 'sleep_awake',
            'sleep_efficiency', 'heart_rate_min', 'heart_rate_max', 'heart_rate_median',
            'heart_rate_p95', 'heart_rate_sample_count', 'pulse_pressure', 'map_estimate',
            'basal_metabolic_rate', 'vo2_max', 'meal', 'note', 'event', 'symptom',
            'check_in', 'health_record'
        )
    ) THEN
        RAISE EXCEPTION 'Cannot remove observations.metric: unknown definition_id values exist';
    END IF;
END $$;--> statement-breakpoint
DROP INDEX "observation_record_metric_idx";--> statement-breakpoint
DROP INDEX "observation_metric_observed_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "observation_active_user_metric_time_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "observation_active_metric_source_idx";--> statement-breakpoint
ALTER TABLE "observations" ALTER COLUMN "definition_id" DROP DEFAULT;--> statement-breakpoint
CREATE UNIQUE INDEX "observation_record_definition_idx" ON "observations" USING btree ("source_record_id","definition_id","derivation_version");--> statement-breakpoint
ALTER TABLE "observations" DROP COLUMN "metric";
