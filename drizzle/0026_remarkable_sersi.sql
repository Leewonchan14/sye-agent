CREATE TABLE "ledger_trips" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "trip_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_trips_name_uniq" ON "ledger_trips" USING btree ("name");--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_trip_id_ledger_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."ledger_trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_entries_trip_idx" ON "ledger_entries" USING btree ("trip_id");