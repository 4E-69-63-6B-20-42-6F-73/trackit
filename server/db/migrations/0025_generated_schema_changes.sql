CREATE TABLE "device_reconcile_ids" (
	"session_id" uuid NOT NULL,
	"external_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_reconcile_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"record_type" text NOT NULL,
	"since" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_reconcile_ids" ADD CONSTRAINT "device_reconcile_ids_session_id_device_reconcile_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."device_reconcile_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_reconcile_sessions" ADD CONSTRAINT "device_reconcile_sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_reconcile_id_identity_idx" ON "device_reconcile_ids" USING btree ("session_id","external_id");--> statement-breakpoint
CREATE INDEX "device_reconcile_session_device_created_idx" ON "device_reconcile_sessions" USING btree ("device_id","created_at");