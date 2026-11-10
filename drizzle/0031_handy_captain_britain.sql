ALTER TABLE "date_spots" ADD COLUMN "photo_url" text;--> statement-breakpoint
ALTER TABLE "date_spots" ADD COLUMN "photo_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "date_spots" ADD COLUMN "photo_checked_at" timestamp with time zone;