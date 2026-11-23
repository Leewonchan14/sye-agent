CREATE TABLE IF NOT EXISTS "pick_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"pick_id" integer NOT NULL,
	"label" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_id" integer,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "picks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"result_option_id" integer,
	"rerolls_used" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'drawn' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "pick_options" ADD CONSTRAINT "pick_options_pick_id_picks_id_fk" FOREIGN KEY ("pick_id") REFERENCES "public"."picks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pick_options_pick_idx" ON "pick_options" USING btree ("pick_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "picks_created_idx" ON "picks" USING btree ("created_at");
