CREATE TABLE "monitor_issue_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_id" integer NOT NULL,
	"url" text NOT NULL,
	"media" text DEFAULT '' NOT NULL,
	"title" text NOT NULL,
	"published_at" timestamp with time zone,
	"brand_mention" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monitor_issue_articles" ADD CONSTRAINT "monitor_issue_articles_snapshot_id_monitor_issue_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."monitor_issue_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monitor_issue_articles_snapshot_idx" ON "monitor_issue_articles" USING btree ("snapshot_id","published_at");