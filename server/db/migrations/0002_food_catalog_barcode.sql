ALTER TABLE "foods" ADD COLUMN "barcode" text;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "catalog_source" text;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "catalog_id" text;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_barcode_unique" UNIQUE("barcode");