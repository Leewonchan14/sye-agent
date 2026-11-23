CREATE TABLE IF NOT EXISTS "places" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'eat' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"map_url" text DEFAULT '' NOT NULL,
	"image_url" text,
	"rating" integer,
	"review" text DEFAULT '' NOT NULL,
	"rated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "places_key_uniq" ON "places" USING btree ("key");