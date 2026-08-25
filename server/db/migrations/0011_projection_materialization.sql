CREATE TABLE "daily_projection_runs" (
    "user_id" text DEFAULT 'owner' NOT NULL,
    "date" text NOT NULL,
    "derivation_version" integer NOT NULL,
    "resolution_version" integer NOT NULL,
    "timezone" text NOT NULL,
    "status" text DEFAULT 'complete' NOT NULL,
    "completed_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "daily_projection_run_identity_idx" ON "daily_projection_runs" USING btree ("user_id", "date");--> statement-breakpoint
CREATE TABLE "projection_dirty_dates" (
    "user_id" text DEFAULT 'owner' NOT NULL,
    "date" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "projection_dirty_date_identity_idx" ON "projection_dirty_dates" USING btree ("user_id", "date");
