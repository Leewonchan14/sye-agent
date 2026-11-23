CREATE TABLE IF NOT EXISTS "place_areas" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"radius_m" integer DEFAULT 1500 NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "place_areas_name_uniq" ON "place_areas" USING btree ("name");