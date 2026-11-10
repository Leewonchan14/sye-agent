CREATE TABLE "date_spot_digests" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_key" text NOT NULL,
	"note" text,
	"pending_hermes_run_id" text,
	"pending_since" timestamp with time zone,
	"callback_token_hash" text,
	"callback_token_expires_at" timestamp with time zone,
	"last_error" text,
	"auto_state" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "date_spot_digests_day_key_unique" UNIQUE("day_key")
);
--> statement-breakpoint
CREATE TABLE "date_spot_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"collect_time" text DEFAULT '09:00' NOT NULL,
	"count" integer DEFAULT 5 NOT NULL,
	"areas" text[] DEFAULT ARRAY['서울']::text[] NOT NULL,
	"themes" text[] DEFAULT '{}'::text[] NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "date_spots" (
	"id" serial PRIMARY KEY NOT NULL,
	"digest_id" integer NOT NULL,
	"name" text NOT NULL,
	"area" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"instagram_url" text NOT NULL,
	"instagram_author" text,
	"posted_at" timestamp with time zone,
	"address" text,
	"price_hint" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"reaction" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "date_spots_instagram_url_unique" UNIQUE("instagram_url")
);
--> statement-breakpoint
ALTER TABLE "date_spots" ADD CONSTRAINT "date_spots_digest_id_date_spot_digests_id_fk" FOREIGN KEY ("digest_id") REFERENCES "public"."date_spot_digests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "date_spots_digest_idx" ON "date_spots" USING btree ("digest_id");