CREATE TABLE "artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"poster_id" text,
	"storage" text DEFAULT 'local' NOT NULL,
	"key" text NOT NULL,
	"caption" text,
	"session_id" text,
	"source" text,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
