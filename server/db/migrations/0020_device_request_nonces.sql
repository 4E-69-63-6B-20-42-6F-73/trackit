CREATE TABLE "device_request_nonces" (
    "nonce_hash" text PRIMARY KEY NOT NULL,
    "device_id" uuid NOT NULL REFERENCES "devices"("id") ON DELETE CASCADE,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
