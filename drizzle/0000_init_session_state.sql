CREATE TABLE IF NOT EXISTS "session_state" (
	"session_id" text PRIMARY KEY NOT NULL,
	"messages" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
