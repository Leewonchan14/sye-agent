CREATE TABLE IF NOT EXISTS "pick_draft" (
	"id" integer PRIMARY KEY NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"labels" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
