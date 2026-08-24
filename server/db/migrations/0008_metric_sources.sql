ALTER TABLE "health_records" ADD COLUMN "connector" text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
UPDATE "health_records"
SET "connector" = "provider",
    "provider" = COALESCE("data_origin", "provider");--> statement-breakpoint
DROP INDEX IF EXISTS "health_record_source_identity_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "health_record_source_identity_idx" ON "health_records" USING btree ("user_id", "connector", "provider", "external_id");
