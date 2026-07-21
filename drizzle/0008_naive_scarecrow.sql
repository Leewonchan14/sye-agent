CREATE TABLE "suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"prompt" text NOT NULL,
	"sort_order" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "system_prompts" RENAME TO "instructions";--> statement-breakpoint
DROP INDEX "system_prompts_active_idx";--> statement-breakpoint
ALTER TABLE "instructions" ALTER COLUMN "is_active" SET DEFAULT true;--> statement-breakpoint
CREATE INDEX "suggestions_sort_order_idx" ON "suggestions" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "instructions_active_idx" ON "instructions" USING btree ("is_active");