CREATE TABLE "plan_items" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text DEFAULT 'owner' NOT NULL,
    "kind" text NOT NULL,
    "scheduled_date" text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "skipped_at" timestamp with time zone,
    "result_observation_id" uuid,
    "version" bigint DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "plan_items_result_observation_id_observations_id_fk" FOREIGN KEY ("result_observation_id") REFERENCES "public"."observations"("id") ON DELETE set null ON UPDATE no action,
    CONSTRAINT "plan_items_kind_check" CHECK ("kind" = 'meal'),
    CONSTRAINT "plan_items_scheduled_date_check" CHECK ("scheduled_date" ~ '^\d{4}-\d{2}-\d{2}$')
);
--> statement-breakpoint
CREATE TABLE "planned_meals" (
    "plan_item_id" uuid PRIMARY KEY NOT NULL,
    "meal_type" text NOT NULL,
    "reference_type" text NOT NULL,
    "food_id" uuid,
    "recipe_id" uuid,
    "amount" double precision NOT NULL,
    "unit" text NOT NULL,
    CONSTRAINT "planned_meals_plan_item_id_plan_items_id_fk" FOREIGN KEY ("plan_item_id") REFERENCES "public"."plan_items"("id") ON DELETE cascade ON UPDATE no action,
    CONSTRAINT "planned_meals_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action,
    CONSTRAINT "planned_meals_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action,
    CONSTRAINT "planned_meals_meal_type_check" CHECK ("meal_type" IN ('Breakfast', 'Lunch', 'Dinner', 'Snack')),
    CONSTRAINT "planned_meals_reference_check" CHECK (("reference_type" = 'food' AND "food_id" IS NOT NULL AND "recipe_id" IS NULL AND "unit" = 'g') OR ("reference_type" = 'recipe' AND "recipe_id" IS NOT NULL AND "food_id" IS NULL AND "unit" = 'serving')),
    CONSTRAINT "planned_meals_amount_check" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE INDEX "plan_item_user_date_idx" ON "plan_items" USING btree ("user_id", "scheduled_date");
--> statement-breakpoint
CREATE UNIQUE INDEX "plan_item_result_observation_idx" ON "plan_items" USING btree ("result_observation_id");