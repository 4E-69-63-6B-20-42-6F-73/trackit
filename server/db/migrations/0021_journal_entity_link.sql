ALTER TABLE "journal_entries" ADD COLUMN "entity_type" text;
ALTER TABLE "journal_entries" ADD COLUMN "entity_id" uuid;
UPDATE "journal_entries" SET "entity_type" = 'meal', "entity_id" = "id" WHERE "category" = 'Meals';
UPDATE "journal_entries" SET "entity_type" = 'observation', "entity_id" = "id" WHERE "category" = 'Measurements';
CREATE INDEX "journal_entity_idx" ON "journal_entries" ("entity_type", "entity_id");
