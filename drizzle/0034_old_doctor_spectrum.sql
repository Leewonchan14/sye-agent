ALTER TABLE "date_spots" ALTER COLUMN "instagram_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "date_spot_settings" ADD COLUMN IF NOT EXISTS "content_count" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "date_spots" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'place' NOT NULL;--> statement-breakpoint
ALTER TABLE "date_spots" ADD COLUMN IF NOT EXISTS "source_url" text;--> statement-breakpoint
ALTER TABLE "date_spots" ADD COLUMN IF NOT EXISTS "period" text;--> statement-breakpoint
ALTER TABLE "date_spots" ADD CONSTRAINT "date_spots_source_url_unique" UNIQUE("source_url");