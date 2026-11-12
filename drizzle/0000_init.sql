CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_turn_frames" (
	"session_id" text NOT NULL,
	"offset" integer NOT NULL,
	"chunk" jsonb NOT NULL,
	CONSTRAINT "chat_turn_frames_session_id_offset_pk" PRIMARY KEY("session_id","offset")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_turns" (
	"session_id" text PRIMARY KEY NOT NULL,
	"hermes_run_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"next_offset" integer DEFAULT 0 NOT NULL,
	"hermes_seq" integer DEFAULT -1 NOT NULL,
	"user_text" text,
	"writer_id" text,
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "instructions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"content" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitor_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"naver_url" text,
	"media" text NOT NULL,
	"title" text NOT NULL,
	"reporter" text,
	"published_at" timestamp with time zone,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitor_clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"report_title" text DEFAULT '' NOT NULL,
	"greeting" text DEFAULT '' NOT NULL,
	"closing" text DEFAULT '' NOT NULL,
	"auto_collect" boolean DEFAULT true NOT NULL,
	"collect_time" text,
	"weekdays_only" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitor_issue_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_id" integer NOT NULL,
	"url" text NOT NULL,
	"media" text DEFAULT '' NOT NULL,
	"title" text NOT NULL,
	"published_at" timestamp with time zone,
	"brand_mention" boolean DEFAULT false NOT NULL,
	"sentiment" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitor_issue_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_id" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"label" text NOT NULL,
	"added" integer NOT NULL,
	"media_count" integer,
	"brand_mentions" integer DEFAULT 0 NOT NULL,
	"last_article" jsonb,
	"report_text" text,
	"is_report" boolean DEFAULT true NOT NULL,
	"usage" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitor_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_id" integer,
	"title" text NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"brand_terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"pending_hermes_run_id" text,
	"pending_since" timestamp with time zone,
	"callback_token_hash" text,
	"callback_token_expires_at" timestamp with time zone,
	"last_error" text,
	"collect_start" text DEFAULT '09:00' NOT NULL,
	"collect_gap_minutes" integer DEFAULT 360 NOT NULL,
	"last_auto_slot" text,
	"auto_state" text,
	"report_recipient" text DEFAULT '' NOT NULL,
	"report_template" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitor_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"article_id" integer NOT NULL,
	"category" text,
	"subcategory" text,
	"score" integer DEFAULT 0 NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"excluded_reason" text,
	"excluded_rule" text,
	"included" boolean DEFAULT true NOT NULL,
	"dup_group" text,
	"is_lead" boolean DEFAULT true NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sentiment" text,
	"importance" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitor_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"since" timestamp with time zone NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"report_text" text,
	"reported_at" timestamp with time zone,
	"pending_hermes_run_id" text,
	"pending_request" text,
	"pending_since" timestamp with time zone,
	"callback_token_hash" text,
	"callback_token_expires_at" timestamp with time zone,
	"last_error" text,
	"collect_key" text,
	"auto_state" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_state" (
	"session_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"messages" jsonb NOT NULL,
	"messages_text" text,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"prompt" text NOT NULL,
	"sort_order" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructions" ADD CONSTRAINT "instructions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_clients" ADD CONSTRAINT "monitor_clients_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_issue_articles" ADD CONSTRAINT "monitor_issue_articles_snapshot_id_monitor_issue_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."monitor_issue_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_issue_snapshots" ADD CONSTRAINT "monitor_issue_snapshots_issue_id_monitor_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."monitor_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_issues" ADD CONSTRAINT "monitor_issues_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_issues" ADD CONSTRAINT "monitor_issues_client_id_monitor_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."monitor_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_items" ADD CONSTRAINT "monitor_items_run_id_monitor_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."monitor_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_items" ADD CONSTRAINT "monitor_items_article_id_monitor_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."monitor_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD CONSTRAINT "monitor_runs_client_id_monitor_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."monitor_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_state" ADD CONSTRAINT "session_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_turns_updated_idx" ON "chat_turns" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "instructions_user_active_idx" ON "instructions" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monitor_articles_url_uniq" ON "monitor_articles" USING btree ("url");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monitor_clients_slug_uniq" ON "monitor_clients" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitor_clients_user_idx" ON "monitor_clients" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitor_issue_articles_snapshot_idx" ON "monitor_issue_articles" USING btree ("snapshot_id","published_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitor_issue_snapshots_issue_idx" ON "monitor_issue_snapshots" USING btree ("issue_id","at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitor_items_run_idx" ON "monitor_items" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monitor_items_run_article_uniq" ON "monitor_items" USING btree ("run_id","article_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitor_runs_client_idx" ON "monitor_runs" USING btree ("client_id","until");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monitor_runs_collect_key_uniq" ON "monitor_runs" USING btree ("client_id","collect_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_state_user_updated_idx" ON "session_state" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_state_title_trgm_idx" ON "session_state" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_state_messages_text_trgm_idx" ON "session_state" USING gin ("messages_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suggestions_user_sort_idx" ON "suggestions" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" USING btree ("identifier");