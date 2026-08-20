ALTER TABLE "meals" ADD COLUMN "favorite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "favorite" boolean DEFAULT false NOT NULL;