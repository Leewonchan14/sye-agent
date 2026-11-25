CREATE TABLE IF NOT EXISTS "calendar_diaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"author" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"mood" text DEFAULT '' NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"owner" text NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"is_lunar" boolean DEFAULT false NOT NULL,
	"lunar_year" integer,
	"lunar_month" integer,
	"lunar_day" integer,
	"lunar_leap" boolean DEFAULT false NOT NULL,
	"recurrence" text DEFAULT 'none' NOT NULL,
	"recurrence_until" text,
	"label_id" integer,
	"location" text DEFAULT '' NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"group_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_labels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"show_holidays" boolean DEFAULT true NOT NULL,
	"show_photos" boolean DEFAULT true NOT NULL,
	"week_start" integer DEFAULT 0 NOT NULL,
	"highlight_weekend" boolean DEFAULT true NOT NULL,
	"lunar_detail" boolean DEFAULT true NOT NULL,
	"lunar_month" boolean DEFAULT false NOT NULL,
	"lunar_event" boolean DEFAULT true NOT NULL,
	"minute_step" integer DEFAULT 10 NOT NULL,
	"plus" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"owner" text NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"label_id" integer,
	"location" text DEFAULT '' NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_label_id_calendar_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."calendar_labels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_diaries_date_author_idx" ON "calendar_diaries" USING btree ("date","author");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_diaries_date_idx" ON "calendar_diaries" USING btree ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_events_start_idx" ON "calendar_events" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_events_owner_idx" ON "calendar_events" USING btree ("owner");
