CREATE TABLE "daily_metrics" (
	"user_id" text DEFAULT 'owner' NOT NULL,
	"date" text NOT NULL,
	"metric" text NOT NULL,
	"value" double precision NOT NULL,
	"unit" text NOT NULL,
	"derivation_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"provider" text NOT NULL,
	"record_type" text NOT NULL,
	"external_id" text NOT NULL,
	"external_version" bigint DEFAULT 1 NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone,
	"data_origin" text,
	"recording_method" text,
	"device" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_modified_time" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "kind" text DEFAULT 'raw_metric' NOT NULL;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "source_record_id" uuid;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "derivation" text;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "derivation_version" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_metric_identity_idx" ON "daily_metrics" USING btree ("user_id","date","metric");--> statement-breakpoint
CREATE UNIQUE INDEX "health_record_source_identity_idx" ON "health_records" USING btree ("user_id","provider","external_id");--> statement-breakpoint
CREATE INDEX "health_record_type_start_idx" ON "health_records" USING btree ("record_type","start_time");--> statement-breakpoint
CREATE INDEX "health_record_origin_idx" ON "health_records" USING btree ("data_origin");--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_source_record_id_health_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."health_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "observation_record_metric_idx" ON "observations" USING btree ("source_record_id","metric","derivation_version");
