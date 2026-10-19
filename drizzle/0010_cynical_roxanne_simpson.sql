CREATE TABLE "chat_turn_frames" (
	"session_id" text NOT NULL,
	"offset" integer NOT NULL,
	"chunk" jsonb NOT NULL,
	CONSTRAINT "chat_turn_frames_session_id_offset_pk" PRIMARY KEY("session_id","offset")
);
--> statement-breakpoint
CREATE TABLE "chat_turns" (
	"session_id" text PRIMARY KEY NOT NULL,
	"hermes_run_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"next_offset" integer DEFAULT 0 NOT NULL,
	"ack_offset" integer DEFAULT 0 NOT NULL,
	"keep_parts" integer DEFAULT 0 NOT NULL,
	"hermes_seq" integer DEFAULT -1 NOT NULL,
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "chat_turns_updated_idx" ON "chat_turns" USING btree ("updated_at");