ALTER TABLE "monitor_clients" ADD COLUMN "weekdays_only" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "monitor_issue_snapshots" ADD COLUMN "usage" jsonb;--> statement-breakpoint
ALTER TABLE "monitor_issues" ADD COLUMN "auto_state" text;--> statement-breakpoint
ALTER TABLE "monitor_issues" ADD COLUMN "report_recipient" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "monitor_issues" ADD COLUMN "report_template" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD COLUMN "auto_state" text;