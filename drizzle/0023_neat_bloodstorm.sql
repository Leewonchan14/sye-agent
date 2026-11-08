CREATE TABLE "ledger_account" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"opening_balance" integer DEFAULT 0 NOT NULL,
	"checked_balance" integer,
	"checked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ledger_entry_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_id" integer NOT NULL,
	"action" text NOT NULL,
	"source" text DEFAULT 'web' NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "entry_time" text;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "ledger_entry_history_created_idx" ON "ledger_entry_history" USING btree ("created_at");