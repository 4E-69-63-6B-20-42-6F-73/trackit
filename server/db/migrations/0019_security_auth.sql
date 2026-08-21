CREATE TABLE "recovery_codes" (
    "code_hash" text PRIMARY KEY NOT NULL,
    "owner_id" text NOT NULL REFERENCES "owners"("id") ON DELETE CASCADE,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
INSERT INTO "recovery_codes" ("code_hash", "owner_id")
SELECT value #>> '{}', "id"
FROM "owners", jsonb_array_elements("recovery_code_hashes");
DROP TABLE "auth_challenges";
CREATE TABLE "auth_challenges" (
    "attempt_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "kind" text NOT NULL,
    "challenge" text NOT NULL,
    "browser_binding_hash" text NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);
