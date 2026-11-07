CREATE TABLE "monitor_articles" (
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
CREATE TABLE "monitor_clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"report_title" text DEFAULT '' NOT NULL,
	"greeting" text DEFAULT '' NOT NULL,
	"closing" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "monitor_issue_snapshots" (
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
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "monitor_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer,
	"title" text NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"brand_terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"pending_hermes_run_id" text,
	"pending_since" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "monitor_items" (
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
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "monitor_runs" (
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
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "monitor_issue_snapshots" ADD CONSTRAINT "monitor_issue_snapshots_issue_id_monitor_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."monitor_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_issues" ADD CONSTRAINT "monitor_issues_client_id_monitor_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."monitor_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_items" ADD CONSTRAINT "monitor_items_run_id_monitor_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."monitor_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_items" ADD CONSTRAINT "monitor_items_article_id_monitor_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."monitor_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD CONSTRAINT "monitor_runs_client_id_monitor_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."monitor_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "monitor_articles_url_uniq" ON "monitor_articles" USING btree ("url");--> statement-breakpoint
CREATE UNIQUE INDEX "monitor_clients_slug_uniq" ON "monitor_clients" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "monitor_issue_snapshots_issue_idx" ON "monitor_issue_snapshots" USING btree ("issue_id","at");--> statement-breakpoint
CREATE INDEX "monitor_items_run_idx" ON "monitor_items" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monitor_items_run_article_uniq" ON "monitor_items" USING btree ("run_id","article_id");--> statement-breakpoint
CREATE INDEX "monitor_runs_client_idx" ON "monitor_runs" USING btree ("client_id","until");