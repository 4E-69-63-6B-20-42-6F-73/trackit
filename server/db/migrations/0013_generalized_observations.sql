CREATE TABLE "observation_relations" (
	"parent_observation_id" uuid NOT NULL,
	"child_observation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"role" text NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "observations" ALTER COLUMN "canonical_value" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "observations" ALTER COLUMN "canonical_unit" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "observations" ALTER COLUMN "original_value" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "observations" ALTER COLUMN "original_unit" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "definition_id" text DEFAULT 'metric' NOT NULL;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "definition_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "value_type" text DEFAULT 'number' NOT NULL;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "origin" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "state" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "text_value" text;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "boolean_value" boolean;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "category_value" text;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "recorded_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "observations" SET
    "definition_id" = "metric",
    "origin" = CASE
        WHEN "derivation" IS NOT NULL OR "kind" = 'derived_metric' THEN 'derived'
        WHEN "source_record_id" IS NOT NULL THEN 'external'
        ELSE 'manual'
    END,
    "state" = CASE
        WHEN "deleted_at" IS NOT NULL THEN 'deleted'
        WHEN "excluded" THEN 'excluded'
        ELSE 'active'
    END,
    "recorded_at" = "created_at";--> statement-breakpoint
ALTER TABLE "observation_relations" ADD CONSTRAINT "observation_relations_parent_observation_id_observations_id_fk" FOREIGN KEY ("parent_observation_id") REFERENCES "public"."observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_relations" ADD CONSTRAINT "observation_relations_child_observation_id_observations_id_fk" FOREIGN KEY ("child_observation_id") REFERENCES "public"."observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "observation_relation_identity_idx" ON "observation_relations" USING btree ("parent_observation_id","child_observation_id","kind","role");--> statement-breakpoint
CREATE INDEX "observation_relation_child_idx" ON "observation_relations" USING btree ("child_observation_id");--> statement-breakpoint
CREATE INDEX "observation_definition_observed_idx" ON "observations" USING btree ("definition_id","observed_at");--> statement-breakpoint
CREATE INDEX "observation_category_observed_idx" ON "observations" USING btree ("category","observed_at");
--> statement-breakpoint
INSERT INTO "observations" (
    "id", "definition_id", "definition_version", "value_type", "origin", "state",
    "metric", "title", "category", "observed_at", "recorded_at", "source_id",
    "attributes", "metadata", "version", "created_at", "updated_at", "deleted_at"
)
SELECT
    m."id", 'meal', 1, 'compound', 'migration',
    CASE WHEN m."deleted_at" IS NULL THEN 'active' ELSE 'deleted' END,
    'meal', m."name", 'Meals', m."eaten_at", m."created_at", m."source_id",
    jsonb_build_object(
        'mealType', m."meal_type",
        'nutrientSnapshot', m."nutrient_snapshot",
        'nutritionQuality', m."nutrition_quality",
        'favorite', m."favorite",
        'primaryMetric', 'calories'
    ),
    jsonb_build_object('legacyEntity', 'meal', 'legacyId', m."id"),
    m."version", m."created_at", m."updated_at", m."deleted_at"
FROM "meals" m
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "observations" root SET "attributes" = root."attributes" || jsonb_build_object(
    'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'legacyId', item."id",
            'foodId', item."food_id",
            'name', item."name_snapshot",
            'grams', item."grams",
            'nutrients', item."nutrient_snapshot"
        ) ORDER BY item."id")
        FROM "meal_items" item
        WHERE item."meal_id" = root."id"
    ), '[]'::jsonb)
)
WHERE root."definition_id" = 'meal';--> statement-breakpoint
INSERT INTO "observations" (
    "id", "definition_id", "definition_version", "value_type", "origin", "state",
    "metric", "canonical_value", "canonical_unit", "original_value", "original_unit",
    "title", "category", "observed_at", "recorded_at", "source_id", "attributes", "metadata",
    "version", "created_at", "updated_at", "deleted_at"
)
SELECT
    (
        substr(md5(m."id"::text || ':nutrient:' || nutrient.key), 1, 8) || '-' ||
        substr(md5(m."id"::text || ':nutrient:' || nutrient.key), 9, 4) || '-4' ||
        substr(md5(m."id"::text || ':nutrient:' || nutrient.key), 14, 3) || '-8' ||
        substr(md5(m."id"::text || ':nutrient:' || nutrient.key), 18, 3) || '-' ||
        substr(md5(m."id"::text || ':nutrient:' || nutrient.key), 21, 12)
    )::uuid,
    nutrient.key, 1, 'number', 'migration',
    CASE WHEN m."deleted_at" IS NULL THEN 'active' ELSE 'deleted' END,
    nutrient.key, (nutrient.value #>> '{}')::double precision,
    CASE WHEN nutrient.key = 'calories' THEN 'kcal'
         WHEN nutrient.key IN ('sodium', 'potassium') THEN 'mg' ELSE 'g' END,
    (nutrient.value #>> '{}')::double precision,
    CASE WHEN nutrient.key = 'calories' THEN 'kcal'
         WHEN nutrient.key IN ('sodium', 'potassium') THEN 'mg' ELSE 'g' END,
    nutrient.key, 'Meals', m."eaten_at", m."created_at", m."source_id",
    jsonb_build_object('nutritionQuality', m."nutrition_quality"),
    jsonb_build_object('legacyEntity', 'meal_nutrient', 'legacyMealId', m."id"),
    m."version", m."created_at", m."updated_at", m."deleted_at"
FROM "meals" m
CROSS JOIN LATERAL jsonb_each(m."nutrient_snapshot") nutrient
WHERE jsonb_typeof(nutrient.value) = 'number'
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "observation_relations" (
    "parent_observation_id", "child_observation_id", "kind", "role", "ordinal"
)
SELECT
    m."id",
    (
        substr(md5(m."id"::text || ':nutrient:' || nutrient.key), 1, 8) || '-' ||
        substr(md5(m."id"::text || ':nutrient:' || nutrient.key), 9, 4) || '-4' ||
        substr(md5(m."id"::text || ':nutrient:' || nutrient.key), 14, 3) || '-8' ||
        substr(md5(m."id"::text || ':nutrient:' || nutrient.key), 18, 3) || '-' ||
        substr(md5(m."id"::text || ':nutrient:' || nutrient.key), 21, 12)
    )::uuid,
    'component', nutrient.key, row_number() OVER (PARTITION BY m."id" ORDER BY nutrient.key) - 1
FROM "meals" m
CROSS JOIN LATERAL jsonb_each(m."nutrient_snapshot") nutrient
WHERE jsonb_typeof(nutrient.value) = 'number'
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "observations" o SET
    "title" = COALESCE(o."title", j."title"),
    "category" = COALESCE(o."category", j."category"::text),
    "attributes" = o."attributes" || jsonb_build_object('journalDetail', j."detail")
FROM "journal_entries" j
WHERE j."entity_type" = 'observation' AND j."entity_id" = o."id";--> statement-breakpoint
INSERT INTO "observations" (
    "id", "definition_id", "definition_version", "value_type", "origin", "state",
    "metric", "title", "category", "observed_at", "ended_at", "recorded_at", "source_id",
    "source_record_id", "external_id", "attributes", "metadata", "version",
    "created_at", "updated_at", "deleted_at"
)
SELECT
    h."id", h."record_type", 1, 'compound', 'external',
    CASE WHEN h."deleted_at" IS NULL THEN 'active' ELSE 'deleted' END,
    'health_record', j."title", j."category"::text, j."observed_at", h."end_time",
    h."created_at", j."source_id", h."id", h."external_id",
    jsonb_build_object(
        'journalDetail', j."detail",
        'sourceLabel', j."source_label",
        'recordType', h."record_type",
        'primaryMetric', CASE h."record_type"
            WHEN 'SleepSessionRecord' THEN 'sleep'
            WHEN 'WeightRecord' THEN 'weight'
            WHEN 'ExerciseSessionRecord' THEN 'exercise'
            WHEN 'BloodPressureRecord' THEN 'blood_pressure_systolic'
            WHEN 'BodyFatRecord' THEN 'body_fat'
            WHEN 'HeightRecord' THEN 'height'
            WHEN 'Vo2MaxRecord' THEN 'vo2_max'
            WHEN 'HydrationRecord' THEN 'water'
            WHEN 'LeanBodyMassRecord' THEN 'lean_body_mass'
            ELSE NULL
        END
    ),
    jsonb_build_object(
        'connector', h."connector",
        'provider', h."provider",
        'dataOrigin', h."data_origin"
    ),
    h."external_version", h."created_at", h."updated_at", h."deleted_at"
FROM "health_records" h
JOIN "journal_entries" j
  ON j."entity_type" = 'health_record' AND j."entity_id" = h."id"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "observation_relations" (
    "parent_observation_id", "child_observation_id", "kind", "role", "ordinal"
)
SELECT
    h."id", child."id", 'component', child."metric",
    row_number() OVER (PARTITION BY h."id" ORDER BY child."metric", child."id") - 1
FROM "health_records" h
JOIN "observations" root ON root."id" = h."id" AND root."value_type" = 'compound'
JOIN "observations" child ON child."source_record_id" = h."id" AND child."id" <> h."id"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "observations" (
    "id", "definition_id", "definition_version", "value_type", "origin", "state",
    "metric", "text_value", "title", "category", "observed_at", "recorded_at",
    "external_id", "attributes", "metadata", "version", "created_at", "updated_at", "deleted_at"
)
SELECT
    j."id",
    CASE WHEN j."category" = 'Check-ins' THEN 'check_in' ELSE 'journal_event' END,
    1, CASE WHEN j."detail" = '' THEN 'event' ELSE 'text' END, 'migration',
    CASE WHEN j."deleted_at" IS NULL THEN 'active' ELSE 'deleted' END,
    CASE WHEN j."category" = 'Check-ins' THEN 'check_in' ELSE 'journal_event' END,
    NULLIF(j."detail", ''), j."title", j."category"::text, j."observed_at", j."created_at",
    j."external_id", jsonb_build_object('sourceLabel', j."source_label"),
    jsonb_build_object('legacyEntity', 'journal', 'legacyId', j."id"),
    j."version", j."created_at", j."updated_at", j."deleted_at"
FROM "journal_entries" j
WHERE j."entity_type" IS NULL
ON CONFLICT ("id") DO NOTHING;
