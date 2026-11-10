CREATE TABLE "ledger_recurring" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'expense' NOT NULL,
	"amount" integer NOT NULL,
	"category_id" integer,
	"memo" text DEFAULT '' NOT NULL,
	"day_of_month" integer NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"last_date" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "recurring_id" integer;--> statement-breakpoint
ALTER TABLE "ledger_recurring" ADD CONSTRAINT "ledger_recurring_category_id_ledger_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ledger_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_recurring_id_ledger_recurring_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."ledger_recurring"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_recurring_date_uniq" ON "ledger_entries" USING btree ("recurring_id","entry_date");