CREATE INDEX "journal_observed_at_idx" ON "journal_entries" USING btree ("observed_at");--> statement-breakpoint
CREATE INDEX "journal_category_observed_idx" ON "journal_entries" USING btree ("category","observed_at");--> statement-breakpoint
CREATE INDEX "meal_eaten_at_idx" ON "meals" USING btree ("eaten_at");--> statement-breakpoint
CREATE INDEX "observation_metric_observed_idx" ON "observations" USING btree ("metric","observed_at");