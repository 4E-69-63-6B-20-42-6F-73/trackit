CREATE TABLE "derived_observation_inputs" (
	"derived_observation_id" text NOT NULL,
	"input_observation_id" text NOT NULL,
	"input_version" bigint NOT NULL,
	"role" text DEFAULT 'input' NOT NULL,
	"ordinal" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "derived_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"date" text NOT NULL,
	"metric" text NOT NULL,
	"canonical_value" double precision NOT NULL,
	"canonical_unit" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"derivation" text NOT NULL,
	"derivation_version" integer NOT NULL,
	"resolution_version" integer NOT NULL,
	"timezone" text NOT NULL,
	"input_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "derived_observation_inputs" ADD CONSTRAINT "derived_observation_inputs_derived_observation_id_derived_observations_id_fk" FOREIGN KEY ("derived_observation_id") REFERENCES "public"."derived_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "derived_observation_input_identity_idx" ON "derived_observation_inputs" USING btree ("derived_observation_id","input_observation_id","role");--> statement-breakpoint
CREATE INDEX "derived_observation_input_reverse_idx" ON "derived_observation_inputs" USING btree ("input_observation_id");--> statement-breakpoint
CREATE INDEX "derived_observation_metric_observed_idx" ON "derived_observations" USING btree ("metric","observed_at");--> statement-breakpoint
CREATE INDEX "derived_observation_materialization_idx" ON "derived_observations" USING btree ("user_id","date","resolution_version","derivation_version");