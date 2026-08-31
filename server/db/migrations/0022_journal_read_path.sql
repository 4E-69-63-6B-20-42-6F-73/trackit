CREATE INDEX "observation_journal_observed_idx" ON "observations" USING btree ("user_id","observed_at" DESC,"id" DESC) WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "observation_relation_component_child_idx" ON "observation_relations" USING btree ("child_observation_id") WHERE "kind" = 'component';
