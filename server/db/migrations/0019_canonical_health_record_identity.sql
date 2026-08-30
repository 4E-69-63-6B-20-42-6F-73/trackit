DROP INDEX "health_record_source_identity_idx";--> statement-breakpoint
WITH "ranked" AS (
    SELECT "id", row_number() OVER (
        PARTITION BY "user_id", "connector", "external_id"
        ORDER BY "external_version" DESC, "updated_at" DESC, "id" DESC
    ) AS "rank"
    FROM "health_records"
)
DELETE FROM "health_records"
WHERE "id" IN (SELECT "id" FROM "ranked" WHERE "rank" > 1);--> statement-breakpoint
CREATE UNIQUE INDEX "health_record_source_identity_idx" ON "health_records" USING btree ("user_id","connector","external_id");
