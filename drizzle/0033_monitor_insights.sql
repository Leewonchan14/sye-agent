ALTER TABLE "monitor_issue_articles" ADD COLUMN IF NOT EXISTS "sentiment" text;--> statement-breakpoint
ALTER TABLE "monitor_items" ADD COLUMN IF NOT EXISTS "sentiment" text;--> statement-breakpoint
ALTER TABLE "monitor_items" ADD COLUMN IF NOT EXISTS "importance" text;