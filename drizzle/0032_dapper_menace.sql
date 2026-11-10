ALTER TABLE "date_spots" ADD COLUMN "photo_urls" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "date_spots" ADD COLUMN "photo_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "date_spots" ADD COLUMN "photo_checked_at" timestamp with time zone;