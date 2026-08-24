ALTER TABLE "goals" ADD COLUMN "aggregation" text;
ALTER TABLE "goals" ADD COLUMN "comparator" text;
ALTER TABLE "goals" ADD COLUMN "target" jsonb;
ALTER TABLE "goals" ADD COLUMN "period" jsonb;
ALTER TABLE "goals" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
UPDATE "goals" SET
    "aggregation" = CASE WHEN "metric" IN ('steps', 'exercise', 'sleep', 'water', 'calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'saturatedFat', 'sodium', 'potassium') THEN 'total' ELSE 'latest' END,
    "comparator" = 'gte',
    "target" = jsonb_build_object('value', "target_value"),
    "period" = jsonb_build_object('type', 'day');
ALTER TABLE "goals" ALTER COLUMN "aggregation" SET NOT NULL;
ALTER TABLE "goals" ALTER COLUMN "comparator" SET NOT NULL;
ALTER TABLE "goals" ALTER COLUMN "target" SET NOT NULL;
ALTER TABLE "goals" ALTER COLUMN "period" SET NOT NULL;
ALTER TABLE "goals" ALTER COLUMN "aggregation" SET DEFAULT 'latest';
ALTER TABLE "goals" ALTER COLUMN "comparator" SET DEFAULT 'gte';
ALTER TABLE "goals" ALTER COLUMN "period" SET DEFAULT '{"type":"day"}'::jsonb;
