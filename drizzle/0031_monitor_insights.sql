ALTER TABLE "monitor_clients" ADD COLUMN "report_emails" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "monitor_issue_articles" ADD COLUMN "sentiment" text;--> statement-breakpoint
ALTER TABLE "monitor_items" ADD COLUMN "sentiment" text;--> statement-breakpoint
ALTER TABLE "monitor_items" ADD COLUMN "importance" text;--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD COLUMN "mailed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD COLUMN "mailed_to" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "monitor_runs_share_token_uniq" ON "monitor_runs" USING btree ("share_token");