ALTER TABLE "date_spots" ADD COLUMN IF NOT EXISTS "naver_place_id" text;--> statement-breakpoint
ALTER TABLE "date_spots" ADD COLUMN IF NOT EXISTS "lat" double precision;--> statement-breakpoint
ALTER TABLE "date_spots" ADD COLUMN IF NOT EXISTS "lng" double precision;