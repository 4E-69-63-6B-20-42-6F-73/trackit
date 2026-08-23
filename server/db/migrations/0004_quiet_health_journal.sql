UPDATE "journal_entries" AS journal
SET "deleted_at" = now(), "updated_at" = now()
FROM "health_records" AS record
WHERE journal."entity_type" = 'health_record'
  AND journal."entity_id" = record."id"
  AND journal."deleted_at" IS NULL
  AND record."record_type" NOT IN (
      'SleepSessionRecord', 'ExerciseSessionRecord', 'WeightRecord',
      'BloodPressureRecord', 'BodyFatRecord', 'HeightRecord',
      'Vo2MaxRecord', 'HydrationRecord', 'LeanBodyMassRecord'
  );
