DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "meals" legacy
        WHERE NOT EXISTS (
            SELECT 1 FROM "observations" migrated
            WHERE migrated."id" = legacy."id" AND migrated."definition_id" = 'meal'
        )
    ) THEN
        RAISE EXCEPTION 'Cannot retire meals: one or more meal roots were not migrated';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "journal_entries" legacy
        WHERE legacy."entity_type" IS NULL
          AND NOT EXISTS (SELECT 1 FROM "observations" migrated WHERE migrated."id" = legacy."id")
    ) THEN
        RAISE EXCEPTION 'Cannot retire Journal: one or more standalone facts were not migrated';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "journal_entries" legacy
        WHERE legacy."entity_type" = 'health_record'
          AND NOT EXISTS (SELECT 1 FROM "observations" migrated WHERE migrated."id" = legacy."entity_id")
    ) THEN
        RAISE EXCEPTION 'Cannot retire Journal: one or more Health Connect roots were not migrated';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "journal_entries" legacy
        WHERE legacy."entity_type" IN ('meal', 'observation')
          AND NOT EXISTS (
              SELECT 1 FROM "observations" migrated WHERE migrated."id" = legacy."entity_id"
          )
    ) THEN
        RAISE EXCEPTION 'Cannot retire Journal: one or more linked facts were not migrated';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "meals" meal
        JOIN "observations" root ON root."id" = meal."id"
        WHERE jsonb_array_length(COALESCE(root."attributes"->'items', '[]'::jsonb)) <>
              (SELECT count(*) FROM "meal_items" item WHERE item."meal_id" = meal."id")
    ) THEN
        RAISE EXCEPTION 'Cannot retire meal items: one or more snapshots were not migrated';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "meals" meal
        WHERE (
            SELECT count(*) FROM jsonb_each(meal."nutrient_snapshot") nutrient
            WHERE jsonb_typeof(nutrient.value) = 'number'
        ) <> (
            SELECT count(*) FROM "observation_relations" relation
            JOIN "observations" child ON child."id" = relation."child_observation_id"
            WHERE relation."parent_observation_id" = meal."id"
              AND relation."kind" = 'component'
              AND child."metadata"->>'legacyEntity' = 'meal_nutrient'
        )
    ) THEN
        RAISE EXCEPTION 'Cannot retire meal nutrients: one or more components were not migrated';
    END IF;
END $$;--> statement-breakpoint
DROP TABLE "journal_entries" CASCADE;--> statement-breakpoint
DROP TABLE "meal_items" CASCADE;--> statement-breakpoint
DROP TABLE "meals" CASCADE;--> statement-breakpoint
DROP TYPE "public"."journal_category";
