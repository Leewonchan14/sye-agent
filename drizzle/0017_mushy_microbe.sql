ALTER TABLE "monitor_issues" ADD COLUMN "callback_token_hash" text;--> statement-breakpoint
ALTER TABLE "monitor_issues" ADD COLUMN "callback_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD COLUMN "callback_token_hash" text;--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD COLUMN "callback_token_expires_at" timestamp with time zone;