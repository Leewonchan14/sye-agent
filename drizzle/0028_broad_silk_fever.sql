CREATE TABLE "ledger_weekly_comments" (
	"week_start" text PRIMARY KEY NOT NULL,
	"expense" integer NOT NULL,
	"comment" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
