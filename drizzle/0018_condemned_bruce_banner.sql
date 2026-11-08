ALTER TABLE "monitor_clients" ADD COLUMN "auto_collect" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD COLUMN "collect_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "monitor_runs_collect_key_uniq" ON "monitor_runs" USING btree ("client_id","collect_key");