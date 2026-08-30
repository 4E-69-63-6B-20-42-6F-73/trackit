CREATE TABLE "plan_fulfillments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_item_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL,
	"amount" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_schedule_times" (
	"plan_item_id" uuid PRIMARY KEY NOT NULL,
	"scheduled_time" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planned_meal_categories" (
	"plan_item_id" uuid PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_category_memberships" (
	"food_id" uuid NOT NULL,
	"category_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_fulfillments" ADD CONSTRAINT "plan_fulfillments_plan_item_id_plan_items_id_fk" FOREIGN KEY ("plan_item_id") REFERENCES "public"."plan_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_fulfillments" ADD CONSTRAINT "plan_fulfillments_observation_id_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_schedule_times" ADD CONSTRAINT "plan_schedule_times_plan_item_id_plan_items_id_fk" FOREIGN KEY ("plan_item_id") REFERENCES "public"."plan_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_meal_categories" ADD CONSTRAINT "planned_meal_categories_plan_item_id_plan_items_id_fk" FOREIGN KEY ("plan_item_id") REFERENCES "public"."plan_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_meal_categories" ADD CONSTRAINT "planned_meal_categories_category_id_food_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."food_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_category_memberships" ADD CONSTRAINT "food_category_memberships_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_category_memberships" ADD CONSTRAINT "food_category_memberships_category_id_food_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."food_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_fulfillment_identity_idx" ON "plan_fulfillments" USING btree ("plan_item_id","observation_id");--> statement-breakpoint
CREATE INDEX "plan_fulfillment_plan_idx" ON "plan_fulfillments" USING btree ("plan_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "food_category_membership_identity_idx" ON "food_category_memberships" USING btree ("food_id","category_id");--> statement-breakpoint
CREATE INDEX "food_category_membership_category_idx" ON "food_category_memberships" USING btree ("category_id");