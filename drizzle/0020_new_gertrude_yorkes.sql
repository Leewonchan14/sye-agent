ALTER TABLE "monitor_clients" ADD COLUMN "collect_time" text;--> statement-breakpoint
ALTER TABLE "monitor_issues" ADD COLUMN "collect_times" jsonb DEFAULT '["09:00","13:00","18:00"]'::jsonb NOT NULL;